import type { AuthedContext } from "@/server/supabase";
import { serverEnv, requireEnv } from "@/server/env";
import { GoogleConnectionRepository } from "@/repositories/GoogleConnectionRepository";
import { CalendarRepository } from "@/repositories/CalendarRepository";
import { SuggestionRepository } from "@/repositories/SuggestionRepository";
import { refreshAccessToken, GoogleOAuthError } from "@/server/gmail/GoogleOAuthClient";
import { decryptToken } from "@/server/gmail/TokenCrypto";
import * as calendarApi from "./CalendarApiClient";
import type { GoogleCalendarEvent } from "./CalendarApiClient";
import {
  decideRelevance,
  buildSyncWindow,
  tierForConfidence,
  type RelevanceContext,
} from "./CalendarRelevanceFilter";
import {
  parseCalendarEventStart,
  extractCalendarMeetingLink,
  findSelfResponseStatus,
  externalAttendeeEmails,
  organizerEmailForRelevance,
  type ParsedEventTime,
} from "./CalendarClassifier";
import {
  extractCalendarCompanyName,
  extractCalendarRole,
  extractCalendarRecruiterName,
} from "./CalendarEntityExtractor";
import { matchApplication } from "@/server/gmail/ApplicationMatcher";
import { suggestionDedupeKey } from "@/server/gmail/GmailSyncService";
import {
  buildCalendarInterviewDraft,
  buildCalendarInterviewUpdateDraft,
  type MergeCandidate,
} from "./CalendarSuggestionBuilder";
import type { CalendarEventRow } from "@/types/database";

// ── Calendar sync orchestrator (Module 9B, finalized) ──
//
// Parallel to GmailSyncService.ts, same discipline: always runs inside an
// authenticated request (connect / app-open / manual "Sync Now" — no
// detached background job, see GmailSyncService's own header for why),
// atomic claim-lock against concurrent triggers, bounded batch, checkpoint-
// only-after-persist.
//
// Two-phase fetch, mirroring Gmail's backfill/history split conceptually:
// windowed full sync (timeMin/timeMax, paginated via page_token) until
// backfill_complete, then syncToken-based incremental. A 410 GONE response
// (Google's sync token expired/invalid — normal, expected behavior, not a
// failure) clears the token and silently restarts a full sync.
//
// Calendar NEVER writes to `interviews` directly. Every relevant event
// becomes a `create_interview` / `create_application` / update suggestion —
// exactly the same reviewable-queue model Gmail already uses, with the same
// accept pipeline (GmailService.acceptCreateInterview, shared, not
// duplicated). There is no more silent auto-merge: an earlier version of
// this file wrote straight into `interviews` for an "exact" merge-ladder
// match (iCalUID chain or identical meeting link); that write path is gone.
// `findMergeCandidate`'s merge ladder still exists — it still decides
// WHETHER this event matches an interview already tracked — but the outcome
// is now always a suggestion, either "new interview" (no match) or "this
// interview's details changed" (match found), never a direct write.

const BATCH_SIZE = 250;
export const MIN_CALENDAR_SYNC_INTERVAL_MINUTES = 15;
const GOOGLE_CALENDAR_ID = "primary";

// When the stored window's far edge comes within this many days of "now +
// lookahead", transparently re-run a full sync with a refreshed window
// rather than let the window silently go stale (a sync token inherits the
// timeMin/timeMax of the full sync that produced it and doesn't roll on its
// own — see the Module 9B plan's Q21).
const WINDOW_ROLL_THRESHOLD_DAYS = 14;

export type CalendarSyncOutcome =
  | {
      status: "synced";
      eventsProcessed: number;
      relevantEventsStored: number;
      suggestionsCreated: number;
    }
  | { status: "skipped"; reason: "not_connected" | "already_syncing" | "needs_reauth" }
  | { status: "error"; message: string };

async function buildRelevanceContext(authed: AuthedContext): Promise<RelevanceContext> {
  const userId = authed.user.id;

  const [linksResult, contactsResult, icsResult] = await Promise.all([
    authed.supabase.from("interviews").select("link").eq("user_id", userId).not("link", "is", null),
    authed.supabase
      .from("application_contacts")
      .select("email")
      .eq("user_id", userId)
      .not("email", "is", null),
    authed.supabase
      .from("gmail_messages")
      .select("ical_uid")
      .eq("user_id", userId)
      .not("ical_uid", "is", null),
  ]);
  if (linksResult.error) throw linksResult.error;
  if (contactsResult.error) throw contactsResult.error;
  if (icsResult.error) throw icsResult.error;

  const existingInterviewLinks = new Set(
    (linksResult.data ?? []).map((r) => r.link).filter((v): v is string => Boolean(v)),
  );
  // Domain derived from real recruiter contact emails — accurate, no
  // company-name-to-domain guessing needed. A full attendee-domain-vs-
  // normalized-company-name signal is Module 9B Phase 3's ApplicationMatcher
  // extension; this context object already carries what Phase 3 needs.
  const trackedCompanyDomains = new Set(
    (contactsResult.data ?? [])
      .map((r) => (r.email as string | null)?.split("@")[1]?.toLowerCase())
      .filter((v): v is string => Boolean(v)),
  );
  const knownIcsUids = new Set(
    (icsResult.data ?? []).map((r) => r.ical_uid).filter((v): v is string => Boolean(v)),
  );

  return { knownIcsUids, trackedCompanyDomains, existingInterviewLinks };
}

// A calendar event within this many milliseconds of an existing interview
// on the SAME application is a "possible duplicate" — reviewed, never
// auto-merged (Q41/Q42 in the plan; rungs 1-2 of the merge ladder — iCalUID
// and exact meeting link — auto-merge; this weaker rung always needs the
// user's confirmation).
const MERGE_TIME_WINDOW_MS = 90 * 60 * 1000;

/**
 * The merge ladder (Module 9B plan §1.4/Q41), highest-identity-first:
 *   1. iCalUID chain — this event's iCalUID matches a gmail_messages row,
 *      which an ACCEPTED create_interview suggestion was built from, which
 *      produced an interview whose source_suggestion_id points back to that
 *      suggestion. Exact identity: the invitation email and this calendar
 *      event are provably the same interview.
 *   2. Exact meeting link match against an existing interview.
 *   3. Same matched application AND within ±90 minutes of an existing
 *      interview's time — plausible, not provable, so this rung is always a
 *      "possible duplicate" review item, never an automatic merge.
 */
async function findMergeCandidate(
  authed: AuthedContext,
  userId: string,
  input: {
    icalUid: string | null;
    meetingLink: string | null;
    matchedApplicationId: string | null;
    eventStartsAtIso: string;
  },
): Promise<MergeCandidate | null> {
  if (input.icalUid) {
    const { data: message, error: messageError } = await authed.supabase
      .from("gmail_messages")
      .select("id")
      .eq("user_id", userId)
      .eq("ical_uid", input.icalUid)
      .maybeSingle();
    if (messageError) throw messageError;
    if (message) {
      const { data: suggestions, error: suggestionError } = await authed.supabase
        .from("suggestions")
        .select("id")
        .eq("gmail_message_id", message.id);
      if (suggestionError) throw suggestionError;
      const suggestionIds = (suggestions ?? []).map((s) => s.id);
      if (suggestionIds.length > 0) {
        const { data: interviews, error: interviewError } = await authed.supabase
          .from("interviews")
          .select("id")
          .eq("user_id", userId)
          .in("source_suggestion_id", suggestionIds)
          .limit(1);
        if (interviewError) throw interviewError;
        if (interviews && interviews.length > 0) {
          return { interviewId: interviews[0].id, kind: "exact" };
        }
      }
    }
  }

  if (input.meetingLink) {
    const { data: interviews, error } = await authed.supabase
      .from("interviews")
      .select("id")
      .eq("user_id", userId)
      .eq("link", input.meetingLink)
      .limit(1);
    if (error) throw error;
    if (interviews && interviews.length > 0) {
      return { interviewId: interviews[0].id, kind: "exact" };
    }
  }

  if (input.matchedApplicationId) {
    const eventTime = new Date(input.eventStartsAtIso).getTime();
    const windowStart = new Date(eventTime - MERGE_TIME_WINDOW_MS).toISOString();
    const windowEnd = new Date(eventTime + MERGE_TIME_WINDOW_MS).toISOString();
    const { data: interviews, error } = await authed.supabase
      .from("interviews")
      .select("id")
      .eq("user_id", userId)
      .eq("application_id", input.matchedApplicationId)
      .gte("scheduled_at", windowStart)
      .lte("scheduled_at", windowEnd)
      .limit(1);
    if (error) throw error;
    if (interviews && interviews.length > 0) {
      return { interviewId: interviews[0].id, kind: "possible_duplicate" };
    }
  }

  return null;
}

/**
 * An event that IS a known interview — either a prior sync already
 * confirmed the link (`existing.matched_interview_id` was set at a previous
 * Accept), or this run's merge ladder just found an exact match for the
 * first time. Either way, Calendar never silently rewrites the interview
 * (Module 9 finalization pass — Calendar must behave exactly like Gmail):
 * if something changed (time or location), this raises ONE `create_interview`
 * review item (`existingInterviewId` set) rather than writing anything.
 * Deduped against any already-PENDING suggestion for this event, so a
 * dismissed update can still be re-suggested if the calendar drifts again
 * later — unlike the brand-new-detection dedupe guard in the main loop,
 * which is permanent (Q45). Completed/passed/rejected interviews are
 * historical and are never touched.
 */
async function suggestInterviewUpdateIfChanged(
  authed: AuthedContext,
  userId: string,
  interviewId: string,
  eventRow: CalendarEventRow,
  event: GoogleCalendarEvent,
  time: ParsedEventTime,
  meetingLink: string | null,
  suggestionRepo: SuggestionRepository,
): Promise<{ suggestionCreated: boolean }> {
  const { data: interview, error } = await authed.supabase
    .from("interviews")
    .select(
      "id, application_id, company_name, type, status, interviewer, scheduled_at, mode, link, location",
    )
    .eq("id", interviewId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!interview || interview.status !== "scheduled") return { suggestionCreated: false };

  const timeChanged =
    !time.isAllDay &&
    new Date(interview.scheduled_at).getTime() !== new Date(time.startsAtIso).getTime();
  const locationChanged = meetingLink
    ? interview.mode !== "online" || interview.link !== meetingLink
    : Boolean(event.location) &&
      (interview.mode !== "offline" || interview.location !== event.location);

  if (!timeChanged && !locationChanged) return { suggestionCreated: false };

  const { data: alreadyPending, error: alreadyPendingError } = await authed.supabase
    .from("suggestions")
    .select("id")
    .eq("calendar_event_id", eventRow.id)
    .eq("status", "pending")
    .limit(1);
  if (alreadyPendingError) throw alreadyPendingError;
  if (alreadyPending && alreadyPending.length > 0) return { suggestionCreated: false };

  const draft = buildCalendarInterviewUpdateDraft({
    event,
    time,
    meetingLink,
    calendarEventRowId: eventRow.id,
    applicationId: interview.application_id,
    existingInterview: {
      id: interview.id,
      company_name: interview.company_name,
      type: interview.type,
      interviewer: interview.interviewer,
      scheduled_at: interview.scheduled_at,
    },
  });

  await suggestionRepo.createSuggestion({
    user_id: userId,
    calendar_event_id: eventRow.id,
    type: draft.type,
    confidence: draft.confidence,
    explanation: draft.explanation,
    target_application_id: draft.targetApplicationId,
    suggested_payload: draft.payload,
  });
  return { suggestionCreated: true };
}

export async function syncCalendarForUser(authed: AuthedContext): Promise<CalendarSyncOutcome> {
  const userId = authed.user.id;
  const connectionRepo = new GoogleConnectionRepository(authed.supabase);
  const calendarRepo = new CalendarRepository(authed.supabase);

  const connection = await connectionRepo.findConnectionForSync(userId);
  if (!connection || connection.calendar_status === "disconnected") {
    return { status: "skipped", reason: "not_connected" };
  }
  if (connection.calendar_status === "needs_reauth") {
    return { status: "skipped", reason: "needs_reauth" };
  }

  const claimed = await connectionRepo.claimSyncLock(userId, "calendar");
  if (!claimed) return { status: "skipped", reason: "already_syncing" };

  try {
    const encryptionKey = requireEnv(
      "GOOGLE_TOKEN_ENCRYPTION_KEY",
      serverEnv.googleTokenEncryptionKey,
    );

    let accessToken: string;
    try {
      const refreshToken = await decryptToken(
        { ciphertext: connection.refresh_token_ciphertext, nonce: connection.refresh_token_nonce },
        encryptionKey,
      );
      accessToken = (await refreshAccessToken(refreshToken)).accessToken;
    } catch (err) {
      if (err instanceof GoogleOAuthError && err.code === "invalid_grant") {
        await connectionRepo.releaseCalendarSyncLock(userId, {
          status: "needs_reauth",
          last_sync_error: "Calendar access was revoked. Please reconnect.",
        });
        return { status: "skipped", reason: "needs_reauth" };
      }
      const message = err instanceof Error ? err.message : "Failed to refresh Calendar access.";
      await connectionRepo.releaseCalendarSyncLock(userId, {
        status: "error",
        last_sync_error: message,
      });
      return { status: "error", message };
    }

    let syncState = await calendarRepo.findSyncState(userId, GOOGLE_CALENDAR_ID);
    const window = buildSyncWindow();

    // Window-roll check: if the stored window's far edge is close to (or
    // behind) where a fresh window would end, restart a full sync so the
    // lookahead doesn't silently go stale.
    const needsWindowRoll =
      syncState?.backfill_complete &&
      syncState.window_end &&
      new Date(syncState.window_end).getTime() - Date.now() <
        WINDOW_ROLL_THRESHOLD_DAYS * 86_400_000;

    if (needsWindowRoll) {
      syncState = await calendarRepo.upsertSyncState(userId, GOOGLE_CALENDAR_ID, {
        sync_token: null,
        page_token: null,
        backfill_complete: false,
        window_start: window.timeMin,
        window_end: window.timeMax,
      });
    }

    // Shouldn't happen (backfill_complete implies sync_token was set by the
    // full sync that completed it) — degrade to restarting backfill rather
    // than throw, same defensive shape as GmailSyncService's history_id
    // fallback.
    let backfillComplete = Boolean(syncState?.backfill_complete && syncState.sync_token);

    let page: calendarApi.ListEventsResult;
    try {
      page = backfillComplete
        ? await calendarApi.listEvents(accessToken, GOOGLE_CALENDAR_ID, {
            mode: "incremental",
            syncToken: syncState!.sync_token!,
            pageToken: syncState?.page_token ?? undefined,
            maxResults: BATCH_SIZE,
          })
        : await calendarApi.listEvents(accessToken, GOOGLE_CALENDAR_ID, {
            mode: "full",
            timeMin: syncState?.window_start ?? window.timeMin,
            timeMax: syncState?.window_end ?? window.timeMax,
            pageToken: syncState?.page_token ?? undefined,
            maxResults: BATCH_SIZE,
          });
    } catch (err) {
      // 410 GONE: the incremental sync token expired or is invalid — normal,
      // expected Google behavior. Discard it and retry INLINE as a full sync
      // in this same run, rather than reporting zero-everything and leaving
      // recovery to whatever sync happens to fire next — a user who clicks
      // "Sync Now" once should not have to click it twice to actually see
      // their events.
      if (err instanceof calendarApi.CalendarApiError && err.status === 410) {
        console.log(
          `[CalendarSync] user=${userId} sync token expired (410) — retrying as a full sync in this same run`,
        );
        syncState = await calendarRepo.upsertSyncState(userId, GOOGLE_CALENDAR_ID, {
          sync_token: null,
          page_token: null,
          backfill_complete: false,
          window_start: window.timeMin,
          window_end: window.timeMax,
        });
        backfillComplete = false;
        page = await calendarApi.listEvents(accessToken, GOOGLE_CALENDAR_ID, {
          mode: "full",
          timeMin: window.timeMin,
          timeMax: window.timeMax,
          maxResults: BATCH_SIZE,
        });
      } else {
        throw err;
      }
    }

    const context = await buildRelevanceContext(authed);

    // A recurring series producing more than the relevance filter's cap is
    // treated as a standing meeting — counted per series within this page
    // before the relevance decision, so every instance in an oversized
    // series is consistently dropped rather than only the ones after the
    // cap was reached.
    const seriesInstanceCounts = new Map<string, number>();
    for (const event of page.items) {
      if (event.recurringEventId) {
        seriesInstanceCounts.set(
          event.recurringEventId,
          (seriesInstanceCounts.get(event.recurringEventId) ?? 0) + 1,
        );
      }
    }

    let eventsProcessed = 0;
    let relevantEventsStored = 0;
    let suggestionsCreated = 0;

    const suggestionRepo = new SuggestionRepository(authed.supabase);
    // Same duplicate-suggestion guard as GmailSyncService's own pendingKeys,
    // but keyed to the suggestion's OWN id too — an event whose action
    // matches an already-pending Gmail-sourced suggestion corroborates it
    // (Q44) instead of creating a second row.
    const pendingKeys = new Map<string, string>();
    for (const row of await suggestionRepo.findPendingSuggestionKeys(userId)) {
      pendingKeys.set(
        suggestionDedupeKey(row.type, row.target_application_id, row.suggested_payload),
        row.id,
      );
    }

    for (const event of page.items) {
      eventsProcessed += 1;
      const existing = await calendarRepo.findEventByGoogleId(userId, GOOGLE_CALENDAR_ID, event.id);

      // A cancelled event we already know about is marked cancelled in
      // place (Q32) so it's never re-suggested; a cancelled event we never
      // stored (was never relevant) is simply skipped. The interview itself
      // is never touched (Q50) — attachDerivedFields already surfaces this
      // reactively as "Removed from calendar" from google_status alone — but
      // a scheduled, application-linked interview additionally gets a
      // one-time timeline entry so the cancellation has a permanent record,
      // not just a card badge. Past/completed interviews are left alone
      // entirely (Q51), and the entry only fires on the FIRST sync that
      // observes the cancellation, not every subsequent one.
      if (event.status === "cancelled") {
        if (existing && existing.google_status !== "cancelled") {
          await calendarRepo.updateEvent(existing.id, { google_status: "cancelled" });

          if (existing.matched_interview_id) {
            const { data: linkedInterview, error: linkedError } = await authed.supabase
              .from("interviews")
              .select("id, application_id, status")
              .eq("id", existing.matched_interview_id)
              .maybeSingle();
            if (linkedError) throw linkedError;

            if (linkedInterview?.application_id && linkedInterview.status === "scheduled") {
              const { error: timelineError } = await authed.supabase
                .from("application_activity")
                .insert({
                  application_id: linkedInterview.application_id,
                  user_id: userId,
                  kind: "calendar_event_cancelled",
                  text: "The calendar invite for this interview was cancelled",
                  previous_value: null,
                  new_value: null,
                  metadata: { calendar_event_id: existing.id },
                });
              if (timelineError) throw timelineError;
            }
          }
        }
        continue;
      }

      // Unchanged since last seen — nothing to do.
      if (existing && existing.etag === (event.etag ?? null)) continue;

      const time = parseCalendarEventStart(event);
      const meetingLink = extractCalendarMeetingLink(event);
      const relevance = decideRelevance(
        {
          title: event.summary ?? null,
          description: event.description ?? null,
          organizerEmail: organizerEmailForRelevance(event),
          externalAttendeeEmails: externalAttendeeEmails(event),
          icalUid: event.iCalUID ?? null,
          meetingLink,
          recurringSeriesInstanceCount: event.recurringEventId
            ? seriesInstanceCounts.get(event.recurringEventId)
            : undefined,
        },
        context,
      );

      if (!relevance.relevant) {
        // Below threshold — never stored. If we'd previously stored it (a
        // once-relevant event that no longer qualifies, e.g. attendees
        // changed), remove the stale row rather than leave outdated data.
        if (existing) await calendarRepo.markIgnored(existing.id);
        // Only real diagnostic signal for "why didn't my event show up" —
        // the UI never surfaces per-event scoring, so this is the one place
        // that answers it without re-deriving relevance by hand. Logs every
        // signal that WAS checked, not just the fact that it failed.
        console.log(
          `[CalendarSync] dropped user=${userId} event="${event.summary ?? event.id}" confidence=${relevance.confidence.toFixed(2)} reasons="${relevance.reasons.join("; ")}"`,
        );
        continue;
      }

      const companyName = extractCalendarCompanyName(event);

      let matchedApplicationId: string | null = null;
      const match = await matchApplication(authed.supabase, userId, {
        fromAddress: event.organizer?.email ?? "",
        companyName,
        gmailThreadId: "",
        subject: event.summary ?? "",
        attendeeEmails: externalAttendeeEmails(event),
        icalUid: event.iCalUID ?? null,
      });
      if (match.kind === "single") matchedApplicationId = match.applicationId;

      const eventPatch = {
        user_id: userId,
        google_calendar_id: GOOGLE_CALENDAR_ID,
        google_event_id: event.id,
        ical_uid: event.iCalUID ?? null,
        recurring_event_id: event.recurringEventId ?? null,
        title: event.summary ?? null,
        description_snippet: event.description ? event.description.slice(0, 500) : null,
        location: event.location ?? null,
        meeting_link: meetingLink,
        organizer_email: event.organizer?.email ?? null,
        organizer_name: event.organizer?.displayName ?? null,
        attendee_emails: externalAttendeeEmails(event),
        starts_at: time.startsAtIso,
        ends_at: time.endsAtIso,
        is_all_day: time.isAllDay,
        event_timezone: time.timezone,
        google_status: event.status,
        self_response_status: findSelfResponseStatus(event),
        etag: event.etag ?? null,
        google_updated_at: event.updated ?? null,
        relevance_tier: tierForConfidence(relevance.confidence),
        confidence: relevance.confidence,
        classified_by: "rule" as const,
        matched_application_id: matchedApplicationId,
        last_seen_at: new Date().toISOString(),
      };

      const eventRow = existing
        ? await calendarRepo.updateEvent(existing.id, eventPatch)
        : await calendarRepo.createEvent(eventPatch);
      relevantEventsStored += 1;

      // Already confirmed as a known interview (a prior Accept set
      // matched_interview_id) — keep it in sync on later changes, always via
      // a review suggestion, never a silent write (Module 9 finalization:
      // Calendar behaves exactly like Gmail — nothing is ever auto-created
      // or auto-updated).
      let targetInterviewId: string | null = existing?.matched_interview_id ?? null;
      let mergeCandidate: MergeCandidate | null = null;

      if (!targetInterviewId) {
        // A brand-new detection for this event — permanently deduped (Q45):
        // ANY suggestion (pending, accepted, OR dismissed) for this event
        // blocks a second one from ever being created, so dismissing a
        // detection really does mean "ignore this calendar event," for good.
        const { data: alreadySuggested, error: alreadySuggestedError } = await authed.supabase
          .from("suggestions")
          .select("id")
          .eq("calendar_event_id", eventRow.id)
          .limit(1);
        if (alreadySuggestedError) throw alreadySuggestedError;
        if (alreadySuggested && alreadySuggested.length > 0) continue;

        mergeCandidate = await findMergeCandidate(authed, userId, {
          icalUid: event.iCalUID ?? null,
          meetingLink,
          matchedApplicationId,
          eventStartsAtIso: time.startsAtIso,
        });
        if (mergeCandidate?.kind === "exact") targetInterviewId = mergeCandidate.interviewId;
      }

      if (targetInterviewId) {
        const result = await suggestInterviewUpdateIfChanged(
          authed,
          userId,
          targetInterviewId,
          eventRow,
          event,
          time,
          meetingLink,
          suggestionRepo,
        );
        if (result.suggestionCreated) suggestionsCreated += 1;
        continue;
      }

      const role = extractCalendarRole(event);
      const recruiterName = extractCalendarRecruiterName(event);

      // ONE draft shape for every new detection: "this looks like an
      // interview." Whether an application matched only decides if the
      // resulting interview is linked to one or standalone — it never
      // decides WHETHER the user hears about the event at all.
      //
      // This replaces a three-way branch that produced a create_interview
      // only on an application match, a create_application when a company
      // name could be extracted, and NOTHING otherwise. That last branch
      // was a silent black hole: a genuinely detected, stored, relevant
      // event ("DSA interview" — no company in the title) produced no
      // suggestion and appeared nowhere in the UI.
      const draft = buildCalendarInterviewDraft({
        event,
        time,
        companyName,
        role,
        recruiterName,
        applicationId: match.kind === "single" ? match.applicationId : null,
        possibleDuplicateOfInterviewId: mergeCandidate?.interviewId ?? null,
        calendarEventRowId: eventRow.id,
        matchConfidence: match.kind === "single" ? match.confidence : 0,
        relevanceConfidence: relevance.confidence,
      });

      const key = suggestionDedupeKey(draft.type, draft.targetApplicationId, draft.payload);
      const existingSuggestionId = pendingKeys.get(key);
      if (existingSuggestionId) {
        await suggestionRepo.attachCorroboration(existingSuggestionId, {
          calendar_event_id: eventRow.id,
          confidence: draft.confidence,
        });
        continue;
      }

      const created = await suggestionRepo.createSuggestion({
        user_id: userId,
        calendar_event_id: eventRow.id,
        type: draft.type,
        confidence: draft.confidence,
        explanation: draft.explanation,
        target_application_id: draft.targetApplicationId,
        suggested_payload: draft.payload,
      });
      pendingKeys.set(key, created.id);
      suggestionsCreated += 1;
    }

    // ── Checkpoint — only advances now that everything above is committed ──
    await calendarRepo.upsertSyncState(userId, GOOGLE_CALENDAR_ID, {
      page_token: page.nextPageToken,
      sync_token: page.nextSyncToken ?? syncState?.sync_token ?? null,
      backfill_complete: backfillComplete || page.nextPageToken === null,
      window_start: syncState?.window_start ?? window.timeMin,
      window_end: syncState?.window_end ?? window.timeMax,
    });

    const nextSyncAt = new Date(
      Date.now() + MIN_CALENDAR_SYNC_INTERVAL_MINUTES * 60_000,
    ).toISOString();
    await connectionRepo.releaseCalendarSyncLock(userId, {
      status: "connected",
      last_synced_at: new Date().toISOString(),
      last_sync_error: null,
      next_sync_at: nextSyncAt,
    });

    // Permanent summary log — the only place that reports the full funnel
    // (Google → relevant → new-to-review) in one line. Without this, "Sync
    // complete — nothing new" is genuinely ambiguous: it's the same message
    // whether Google returned zero events, events came back but were all
    // filtered as irrelevant, or events were stored/updated with nothing new
    // to review. See GoogleConnectionCard.tsx's toast copy, which now reads
    // these same three counters to disambiguate for the user too.
    console.log(
      `[CalendarSync] user=${userId} mode=${backfillComplete ? "incremental" : "full"} processed=${eventsProcessed} stored=${relevantEventsStored} suggestions=${suggestionsCreated}`,
    );

    return { status: "synced", eventsProcessed, relevantEventsStored, suggestionsCreated };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Calendar sync failed.";
    console.error(`[CalendarSync] user=${userId} failed: ${message}`);
    await connectionRepo.releaseCalendarSyncLock(userId, {
      status: "error",
      last_sync_error: message,
    });
    return { status: "error", message };
  }
}

/** Whether an opportunistic (app-open) Calendar sync should fire right now — "Sync Now" bypasses this entirely. */
export function isCalendarSyncDue(connection: {
  calendar_auto_sync_enabled: boolean;
  calendar_next_sync_at: string | null;
  calendar_status: string;
}): boolean {
  if (!connection.calendar_auto_sync_enabled) return false;
  if (
    connection.calendar_status === "disconnected" ||
    connection.calendar_status === "needs_reauth"
  )
    return false;
  if (connection.calendar_status === "syncing") return false;
  if (!connection.calendar_next_sync_at) return true;
  return new Date(connection.calendar_next_sync_at).getTime() <= Date.now();
}
