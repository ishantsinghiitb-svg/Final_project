import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase as ambientSupabase } from "@/lib/supabase";
import type {
  Database,
  CalendarEventInsert,
  CalendarEventRow,
  CalendarSyncStateRow,
} from "@/types/database";

// ── CalendarRepository (Module 9B) ──
//
// calendar_events (candidate ledger, mirrors gmail_messages) + calendar_
// sync_state (per-calendar checkpoint) only — connection state lives in
// GoogleConnectionRepository, suggestions (Gmail- or Calendar-sourced) live
// in SuggestionRepository. Written only by CalendarSyncService, through the
// caller's own RLS-scoped client. This file must never import from
// src/server/**.

const EVENT_COLUMNS =
  "id, user_id, google_calendar_id, google_event_id, ical_uid, recurring_event_id, title, description_snippet, location, meeting_link, organizer_email, organizer_name, attendee_emails, starts_at, ends_at, is_all_day, event_timezone, google_status, self_response_status, etag, google_updated_at, relevance_tier, confidence, classified_by, matched_application_id, matched_interview_id, ignored_at, first_seen_at, last_seen_at, created_at, updated_at";

const SYNC_STATE_COLUMNS =
  "id, user_id, google_calendar_id, sync_token, page_token, window_start, window_end, backfill_complete, created_at, updated_at";

export class CalendarRepository {
  constructor(private readonly client: SupabaseClient<Database> = ambientSupabase) {}

  // ── Sync state ───────────────────────────────────────────────────────────

  async findSyncState(
    userId: string,
    googleCalendarId = "primary",
  ): Promise<CalendarSyncStateRow | null> {
    const { data, error } = await this.client
      .from("calendar_sync_state")
      .select(SYNC_STATE_COLUMNS)
      .eq("user_id", userId)
      .eq("google_calendar_id", googleCalendarId)
      .maybeSingle();
    if (error) throw error;
    return data as CalendarSyncStateRow | null;
  }

  /** Upserts on the UNIQUE(user_id, google_calendar_id) constraint — creates the row on first sync, updates the checkpoint on every run after. */
  async upsertSyncState(
    userId: string,
    googleCalendarId: string,
    patch: {
      sync_token?: string | null;
      page_token?: string | null;
      window_start?: string | null;
      window_end?: string | null;
      backfill_complete?: boolean;
    },
  ): Promise<CalendarSyncStateRow> {
    const { data, error } = await this.client
      .from("calendar_sync_state")
      .upsert(
        { user_id: userId, google_calendar_id: googleCalendarId, ...patch },
        { onConflict: "user_id,google_calendar_id" },
      )
      .select(SYNC_STATE_COLUMNS)
      .single();
    if (error) throw error;
    return data as unknown as CalendarSyncStateRow;
  }

  // ── Events ───────────────────────────────────────────────────────────────

  /** Dedup precheck — the DB UNIQUE(user_id, google_calendar_id, google_event_id) constraint is the hard guarantee; this avoids a wasted insert attempt and lets the sync engine detect an etag change (event updated since last seen). */
  async findEventByGoogleId(
    userId: string,
    googleCalendarId: string,
    googleEventId: string,
  ): Promise<CalendarEventRow | null> {
    const { data, error } = await this.client
      .from("calendar_events")
      .select(EVENT_COLUMNS)
      .eq("user_id", userId)
      .eq("google_calendar_id", googleCalendarId)
      .eq("google_event_id", googleEventId)
      .maybeSingle();
    if (error) throw error;
    return data as CalendarEventRow | null;
  }

  async findEventById(id: string): Promise<CalendarEventRow | null> {
    const { data, error } = await this.client
      .from("calendar_events")
      .select(EVENT_COLUMNS)
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return data as CalendarEventRow | null;
  }

  async createEvent(input: CalendarEventInsert): Promise<CalendarEventRow> {
    const { data, error } = await this.client
      .from("calendar_events")
      .insert(input)
      .select(EVENT_COLUMNS)
      .single();
    if (error) throw error;
    return data as unknown as CalendarEventRow;
  }

  /** Re-sync of an already-stored event whose etag changed — refreshes the extracted/classified fields, never touches ignored_at or matched_interview_id (a tombstone or an accepted link survives a re-classify). */
  async updateEvent(
    id: string,
    patch: Partial<Omit<CalendarEventRow, "id" | "user_id" | "created_at" | "updated_at">>,
  ): Promise<CalendarEventRow> {
    const { data, error } = await this.client
      .from("calendar_events")
      .update(patch)
      .eq("id", id)
      .select(EVENT_COLUMNS)
      .single();
    if (error) throw error;
    return data as unknown as CalendarEventRow;
  }

  /** Dismiss/delete tombstone (Q45) — checked by the sync engine before ever re-suggesting this event, survives a post-410 full resync since only the sync TOKEN resets, never this row. */
  async markIgnored(id: string): Promise<void> {
    const { error } = await this.client
      .from("calendar_events")
      .update({ ignored_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw error;
  }

  /** Links a Tier 1/2 auto-merge target so a later sync recognizes this event is already an interview, without a suggestion row ever existing. */
  async linkToInterview(id: string, interviewId: string): Promise<void> {
    const { error } = await this.client
      .from("calendar_events")
      .update({ matched_interview_id: interviewId })
      .eq("id", id);
    if (error) throw error;
  }

  /**
   * Calendar disconnect (Module 9B plan §6), second step — run AFTER
   * SuggestionRepository.deleteCalendarOnlySuggestions (a surviving
   * calendar-only suggestion would violate suggestions_has_source_check the
   * moment its calendar_event_id is nulled out here). An interview already
   * linked to one of these rows survives via calendar_event_id's
   * ON DELETE SET NULL; only the candidate-ledger rows themselves go.
   */
  async deleteAllEventsForUser(userId: string): Promise<void> {
    const { error } = await this.client.from("calendar_events").delete().eq("user_id", userId);
    if (error) throw error;
  }

  /**
   * Clears the per-calendar sync checkpoint on disconnect so a future
   * reconnect starts a fresh full backfill instead of resuming an
   * incremental sync token against a now-empty calendar_events table (which
   * would only return deltas, silently missing every event untouched since
   * the old checkpoint).
   */
  async deleteSyncState(userId: string, googleCalendarId = "primary"): Promise<void> {
    const { error } = await this.client
      .from("calendar_sync_state")
      .delete()
      .eq("user_id", userId)
      .eq("google_calendar_id", googleCalendarId);
    if (error) throw error;
  }
}
