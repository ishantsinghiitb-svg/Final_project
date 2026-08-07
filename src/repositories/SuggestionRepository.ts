import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase as ambientSupabase } from "@/lib/supabase";
import type { Database, Json, SuggestionInsert } from "@/types/database";
import type {
  GmailMessageCategory,
  Suggestion,
  SuggestionFilter,
  SuggestionSource,
} from "@/features/gmail/types";
import { readSuggestionSummary } from "@/features/gmail/summary";

// ── SuggestionRepository (Module 9A/9B) ──
//
// `suggestions` (née gmail_suggestions) now carries either a Gmail message, a
// calendar event, or both (when the two sources independently corroborate
// the same interview — see attachCorroboration). There is no stored `source`
// column: it's derived here, at read time, from which FK is present, so it
// can never drift from the data it actually describes. This is also where
// the old "inner-join-and-drop" hazard is fixed — Module 9A's version
// silently dropped any suggestion whose linked message wasn't found, which
// never happened in practice (gmail_message_id was NOT NULL then) but would
// have silently hidden every calendar-only suggestion now that it isn't.
//
// Written only by GmailSyncService / CalendarSyncService, through the
// caller's own RLS-scoped client. This file must never import from
// src/server/**.

const SUGGESTION_COLUMNS =
  "id, user_id, gmail_message_id, calendar_event_id, type, status, confidence, explanation, target_application_id, suggested_payload, resolved_at, resolved_action, created_at, updated_at";

/** A suggestion enriched with its linked message/event's display fields — what the Inbox list renders. */
export type SuggestionListItem = Suggestion & {
  source: SuggestionSource;
  company_name: string | null;
  subject: string | null;
  /** Only meaningful for a Gmail-sourced (or 'both') row — a calendar-only suggestion has no email lifecycle category. */
  category: GmailMessageCategory | null;
  /** Gmail's own external message id (for "Open Original Email") — "" when there's no Gmail side. */
  externalMessageId: string;
  /** Gmail's thread id — the grouping key behind "one application, one card". "" when there's no Gmail side. */
  threadId: string;
  /** When the source arrived/was first seen — orders the timeline inside a group. */
  receivedAt: string | null;
  /** The sender/organizer, for search-by-recruiter/email. */
  fromAddress: string | null;
  /** Gmail read state at sync time — drives the All/Unread/Read view filter. Calendar-only rows default to read (no unread concept) so they don't vanish under the Inbox's default Unread view. */
  isUnread: boolean;
  /** Present only for a calendar-sourced (or 'both') row — event details shown in ReviewPanel without a live API call. */
  calendarEvent: {
    title: string | null;
    startsAt: string;
    isAllDay: boolean;
    location: string | null;
    meetingLink: string | null;
    selfResponseStatus: string | null;
    googleStatus: string;
  } | null;
};

/**
 * Free-text match across everything the user might search by: company, role,
 * recruiter, sender address, subject and classification. Role/recruiter live
 * in the suggestion payload's `summary` block rather than their own columns,
 * so this runs in-app instead of as a SQL filter — at per-user suggestion
 * volumes that's cheaper than the joins/indexes the alternative would need.
 */
function matchesSearch(item: SuggestionListItem, term: string): boolean {
  const summary = readSuggestionSummary(item);
  const haystack = [
    item.company_name,
    item.subject,
    item.category?.replace(/_/g, " ") ?? null,
    item.fromAddress,
    summary?.role,
    summary?.recruiter,
    summary?.headline,
  ];
  return haystack.some((value) => value?.toLowerCase().includes(term));
}

type MessageJoinRow = {
  id: string;
  gmail_message_id: string;
  gmail_thread_id: string;
  company_name: string | null;
  subject: string | null;
  category: string | null;
  internal_date: string;
  from_address: string | null;
  is_unread: boolean | null;
};

type EventJoinRow = {
  id: string;
  title: string | null;
  starts_at: string;
  is_all_day: boolean;
  location: string | null;
  meeting_link: string | null;
  organizer_email: string | null;
  self_response_status: string | null;
  google_status: string;
  first_seen_at: string;
};

function deriveSource(
  gmailMessageId: string | null,
  calendarEventId: string | null,
): SuggestionSource {
  if (gmailMessageId && calendarEventId) return "both";
  return calendarEventId ? "calendar" : "gmail";
}

export class SuggestionRepository {
  constructor(private readonly client: SupabaseClient<Database> = ambientSupabase) {}

  async createSuggestion(input: SuggestionInsert): Promise<Suggestion> {
    const { data, error } = await this.client
      .from("suggestions")
      .insert(input)
      .select(SUGGESTION_COLUMNS)
      .single();
    if (error) throw error;
    return data as unknown as Suggestion;
  }

  /**
   * Minimal pending-suggestion rows for both sync engines' duplicate guard.
   * The DB's UNIQUE(user_id, gmail_message_id)/(user_id, google_calendar_id,
   * google_event_id) constraints stop the same *source item* being processed
   * twice, but two different source items about the same opportunity (an ATS
   * confirmation email and its calendar invite) would otherwise each raise
   * their own suggestion — same action, proposed twice. This is the read
   * side of preventing that; CalendarSyncService additionally uses this to
   * find an existing suggestion to corroborate via attachCorroboration
   * rather than creating a second one.
   */
  async findPendingSuggestionKeys(
    userId: string,
  ): Promise<
    { id: string; type: string; target_application_id: string | null; suggested_payload: Json }[]
  > {
    const { data, error } = await this.client
      .from("suggestions")
      .select("id, type, target_application_id, suggested_payload")
      .eq("user_id", userId)
      .eq("status", "pending");
    if (error) throw error;
    return (data ?? []) as {
      id: string;
      type: string;
      target_application_id: string | null;
      suggested_payload: Json;
    }[];
  }

  async findSuggestionById(id: string): Promise<Suggestion | null> {
    const { data, error } = await this.client
      .from("suggestions")
      .select(SUGGESTION_COLUMNS)
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return data as Suggestion | null;
  }

  /**
   * The Inbox list query. Fetches suggestions, then batch-fetches BOTH their
   * linked messages and linked events by id (never a PostgREST embedded
   * join — this codebase doesn't use embedded-join filtering anywhere else,
   * and at per-user data volumes two extra IN() queries are cheap). Every
   * suggestion is merged with whichever side(s) resolve; a row is only ever
   * dropped if BOTH its FKs fail to resolve, which the DB's foreign keys make
   * effectively impossible in normal operation.
   */
  async findSuggestionsByUser(
    userId: string,
    filter: SuggestionFilter,
    companySearch?: string,
    /**
     * Module 9 UX pass — the Inbox is Gmail-only ("gmail": keeps gmail +
     * both, drops pure-calendar rows); Interviews/Dashboard/notifications
     * read only calendar-originated review items ("calendar": keeps
     * calendar + both, drops pure-gmail rows). Omitted = unrestricted,
     * used only by internal callers (dedupe/rebuild) that must see
     * everything regardless of source.
     */
    sourceScope?: "gmail" | "calendar",
  ): Promise<SuggestionListItem[]> {
    let q = this.client
      .from("suggestions")
      .select(SUGGESTION_COLUMNS)
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (filter !== "all") q = q.eq("status", filter);
    if (sourceScope === "gmail") q = q.not("gmail_message_id", "is", null);
    if (sourceScope === "calendar") q = q.not("calendar_event_id", "is", null);

    const { data: suggestionRows, error } = await q;
    if (error) throw error;
    const suggestions = (suggestionRows ?? []) as unknown as Suggestion[];
    if (suggestions.length === 0) return [];

    const messageIds = [
      ...new Set(suggestions.map((s) => s.gmail_message_id).filter((v): v is string => Boolean(v))),
    ];
    const eventIds = [
      ...new Set(
        suggestions.map((s) => s.calendar_event_id).filter((v): v is string => Boolean(v)),
      ),
    ];

    const [messageResult, eventResult] = await Promise.all([
      messageIds.length > 0
        ? this.client
            .from("gmail_messages")
            .select(
              "id, gmail_message_id, gmail_thread_id, company_name, subject, category, internal_date, from_address, is_unread",
            )
            .in("id", messageIds)
        : Promise.resolve({ data: [] as MessageJoinRow[], error: null }),
      eventIds.length > 0
        ? this.client
            .from("calendar_events")
            .select(
              "id, title, starts_at, is_all_day, location, meeting_link, organizer_email, self_response_status, google_status, first_seen_at",
            )
            .in("id", eventIds)
        : Promise.resolve({ data: [] as EventJoinRow[], error: null }),
    ]);
    if (messageResult.error) throw messageResult.error;
    if (eventResult.error) throw eventResult.error;

    const messagesById = new Map(
      (messageResult.data ?? []).map((m) => [m.id, m as MessageJoinRow]),
    );
    const eventsById = new Map((eventResult.data ?? []).map((e) => [e.id, e as EventJoinRow]));

    const items: SuggestionListItem[] = suggestions
      .map((s) => {
        const message = s.gmail_message_id ? messagesById.get(s.gmail_message_id) : undefined;
        const event = s.calendar_event_id ? eventsById.get(s.calendar_event_id) : undefined;
        const source = deriveSource(s.gmail_message_id, s.calendar_event_id);

        // Company name: prefer the payload's own extraction (always present
        // for calendar, since calendar_events carries no company column of
        // its own — company is suggestion-derived, not raw event data) and
        // fall back to the Gmail message's stored column.
        const payload = (s.suggested_payload ?? {}) as Record<string, unknown>;
        const payloadCompany = typeof payload.companyName === "string" ? payload.companyName : null;

        return {
          ...s,
          source,
          company_name: payloadCompany ?? message?.company_name ?? null,
          subject: message?.subject ?? event?.title ?? null,
          category: (message?.category as GmailMessageCategory | undefined) ?? null,
          externalMessageId: message?.gmail_message_id ?? "",
          threadId: message?.gmail_thread_id ?? "",
          receivedAt: message?.internal_date ?? event?.first_seen_at ?? null,
          fromAddress: message?.from_address ?? event?.organizer_email ?? null,
          // NULL predates the column (see migration 20260810000001) — treated
          // as read so old backfilled mail doesn't flood the default Unread
          // view. Calendar-only rows have no unread concept and default the
          // same way, for the same reason.
          isUnread: message?.is_unread === true,
          calendarEvent: event
            ? {
                title: event.title,
                startsAt: event.starts_at,
                isAllDay: event.is_all_day,
                location: event.location,
                meetingLink: event.meeting_link,
                selfResponseStatus: event.self_response_status,
                googleStatus: event.google_status,
              }
            : null,
        };
      })
      // Only a genuinely orphaned row (both FKs failed to resolve) is
      // dropped — the DB's real foreign keys make this effectively
      // impossible in normal operation, but a defensive filter is cheap.
      .filter(
        (item) =>
          !(item.gmail_message_id && !item.externalMessageId && !item.calendarEvent) &&
          !(item.calendar_event_id && !item.calendarEvent && !item.externalMessageId),
      );

    const term = companySearch?.trim().toLowerCase();
    if (!term) return items;
    return items.filter((item) => matchesSearch(item, term));
  }

  /** Pending count for the sidebar nav badge — mirrors useSidebarCounts' other head-count queries. Scoped the same way as findSuggestionsByUser so the badge matches what's actually visible wherever it's used. */
  async countPendingByUser(userId: string, sourceScope?: "gmail" | "calendar"): Promise<number> {
    let q = this.client
      .from("suggestions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("status", "pending");
    if (sourceScope === "gmail") q = q.not("gmail_message_id", "is", null);
    if (sourceScope === "calendar") q = q.not("calendar_event_id", "is", null);
    const { count, error } = await q;
    if (error) throw error;
    return count ?? 0;
  }

  /**
   * `finalPayload` (Review → Edit → Accept) overwrites the stored
   * `suggested_payload` with whatever values were actually used to create/
   * update the record — so a later look at "accepted" suggestions shows what
   * really happened, not the original best-effort guess.
   */
  async updateSuggestionResolution(
    id: string,
    status: "accepted" | "dismissed",
    finalPayload?: Json,
  ): Promise<Suggestion> {
    const { data, error } = await this.client
      .from("suggestions")
      .update({
        status,
        resolved_action: status,
        resolved_at: new Date().toISOString(),
        ...(finalPayload !== undefined ? { suggested_payload: finalPayload } : {}),
      })
      .eq("id", id)
      .select(SUGGESTION_COLUMNS)
      .single();
    if (error) throw error;
    return data as unknown as Suggestion;
  }

  /**
   * Module 9B — the second arrival (Gmail or Calendar) of two signals that
   * corroborate the same interview merges into the FIRST suggestion's row
   * instead of creating a second one (Q44). Sets whichever FK was missing
   * and raises confidence to the max of the two, never lowers it.
   */
  async attachCorroboration(
    id: string,
    patch: { gmail_message_id?: string; calendar_event_id?: string; confidence: number },
  ): Promise<Suggestion> {
    const existing = await this.findSuggestionById(id);
    if (!existing) throw new Error(`Suggestion ${id} not found for corroboration.`);
    const { data, error } = await this.client
      .from("suggestions")
      .update({
        ...(patch.gmail_message_id ? { gmail_message_id: patch.gmail_message_id } : {}),
        ...(patch.calendar_event_id ? { calendar_event_id: patch.calendar_event_id } : {}),
        confidence: Math.max(existing.confidence, patch.confidence),
      })
      .eq("id", id)
      .select(SUGGESTION_COLUMNS)
      .single();
    if (error) throw error;
    return data as unknown as Suggestion;
  }

  /**
   * Calendar disconnect (Module 9B plan §6), run BEFORE
   * CalendarRepository.deleteAllEventsForUser. Deletes every CALENDAR-ONLY
   * suggestion (no gmail_message_id), regardless of status — not just
   * pending ones. A "both"-sourced suggestion (corroborated by a Gmail
   * message too) safely survives calendar_events deletion on its own:
   * `calendar_event_id` just goes NULL via ON DELETE SET NULL, and
   * `gmail_message_id` still satisfies the `suggestions_has_source_check`
   * CHECK constraint. A calendar-ONLY suggestion has no such fallback
   * anchor — letting one survive to the next step, in any status, makes
   * that same SET NULL violate the CHECK and fail the whole disconnect
   * (confirmed live: an ACCEPTED calendar-only suggestion left in place
   * throws `suggestions_has_source_check` the moment its calendar_events
   * row is deleted). The interview/application it produced is unaffected —
   * those are independent rows, already-created.
   */
  async deleteCalendarOnlySuggestions(userId: string): Promise<void> {
    const { error } = await this.client
      .from("suggestions")
      .delete()
      .eq("user_id", userId)
      .is("gmail_message_id", null)
      .not("calendar_event_id", "is", null);
    if (error) throw error;
  }
}
