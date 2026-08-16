import type { AuthedContext } from "@/server/supabase";
import { CalendarRepository } from "@/repositories/CalendarRepository";
import { GoogleConnectionRepository } from "@/repositories/GoogleConnectionRepository";
import {
  decideRelevance,
  tierForConfidence,
  type RelevanceContext,
} from "./CalendarRelevanceFilter";
import { extractCompanyName } from "@/server/gmail/CompanyExtractor";
import { matchApplication } from "@/server/gmail/ApplicationMatcher";

// ── Calendar rescan (Module 9B · DEVELOPMENT ONLY) ──
//
// Re-runs the CURRENT relevance/matching logic over already-stored
// calendar_events rows — no Calendar API call, no change to the OAuth
// connection or sync checkpoint. Exists for the same reason
// SuggestionRebuilder.ts does: iterating on CalendarRelevanceFilter is
// otherwise painful, since the only way to see new logic applied to real
// events is a full disconnect/reconnect/resync, which burns Calendar API
// quota and destroys the sync checkpoint.
//
// Unlike SuggestionRebuilder, this never deletes anything — a
// calendar_events row IS the record of having seen an event, so this only
// ever UPDATES relevance_tier/confidence/matched_application_id in place. A
// row already `ignored_at` (dismissed/deleted) is left untouched: rescanning
// must never resurrect a suggestion the user explicitly rejected.

export type CalendarRescanOutcome = {
  eventsScanned: number;
  eventsReclassified: number;
  warnings: string[];
};

async function buildContextFromStored(authed: AuthedContext): Promise<RelevanceContext> {
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

  return {
    existingInterviewLinks: new Set(
      (linksResult.data ?? []).map((r) => r.link).filter((v): v is string => Boolean(v)),
    ),
    trackedCompanyDomains: new Set(
      (contactsResult.data ?? [])
        .map((r) => (r.email as string | null)?.split("@")[1]?.toLowerCase())
        .filter((v): v is string => Boolean(v)),
    ),
    knownIcsUids: new Set(
      (icsResult.data ?? []).map((r) => r.ical_uid).filter((v): v is string => Boolean(v)),
    ),
  };
}

export async function rescanCalendarEvents(authed: AuthedContext): Promise<CalendarRescanOutcome> {
  const userId = authed.user.id;
  const warnings: string[] = [];
  const calendarRepo = new CalendarRepository(authed.supabase);
  const context = await buildContextFromStored(authed);

  // `calendar_events.organizer_email` is a display field, stored
  // unconditionally (see CalendarSyncService) — it does NOT record whether
  // the connected user themselves was the organizer, unlike the live sync
  // path's `organizerEmailForRelevance` (CalendarClassifier.ts), which reads
  // that straight from Google's `organizer.self`. Reconstructing that same
  // exclusion here from the stored row alone: compare against the
  // connection's own account email.
  const connection = await new GoogleConnectionRepository(authed.supabase).findConnectionForSync(
    userId,
  );
  const ownEmail = connection?.google_email?.toLowerCase() ?? null;

  const { data: rows, error } = await authed.supabase
    .from("calendar_events")
    .select(
      "id, title, description_snippet, organizer_email, attendee_emails, ical_uid, meeting_link, recurring_event_id, ignored_at",
    )
    .eq("user_id", userId);
  if (error) throw error;

  let eventsReclassified = 0;
  for (const row of rows ?? []) {
    if (row.ignored_at) continue;

    const organizerIsSelf = Boolean(
      ownEmail && row.organizer_email && row.organizer_email.toLowerCase() === ownEmail,
    );

    const relevance = decideRelevance(
      {
        title: row.title,
        description: row.description_snippet,
        organizerEmail: organizerIsSelf ? null : row.organizer_email,
        externalAttendeeEmails: Array.isArray(row.attendee_emails)
          ? (row.attendee_emails as string[])
          : [],
        icalUid: row.ical_uid,
        meetingLink: row.meeting_link,
      },
      context,
    );

    if (!relevance.relevant) {
      // No longer relevant under the current logic — tombstone it the same
      // way an ordinary sync would, rather than leaving a stale Tier 1-3 row.
      await calendarRepo.markIgnored(row.id);
      eventsReclassified += 1;
      continue;
    }

    try {
      const organizerAddress = (row.organizer_email ?? "").toLowerCase();
      const companyName = extractCompanyName(
        {
          address: organizerAddress,
          domain: organizerAddress.split("@")[1] ?? "",
          displayName: null,
        },
        row.title ?? "",
        row.description_snippet ?? "",
      );
      const match = await matchApplication(authed.supabase, userId, {
        fromAddress: row.organizer_email ?? "",
        companyName,
        gmailThreadId: "",
        subject: row.title ?? "",
        attendeeEmails: Array.isArray(row.attendee_emails) ? (row.attendee_emails as string[]) : [],
        icalUid: row.ical_uid,
      });
      await calendarRepo.updateEvent(row.id, {
        relevance_tier: tierForConfidence(relevance.confidence),
        confidence: relevance.confidence,
        matched_application_id: match.kind === "single" ? match.applicationId : null,
      });
      eventsReclassified += 1;
    } catch (err) {
      warnings.push(
        `Could not update "${row.title ?? row.id}": ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  return { eventsScanned: (rows ?? []).length, eventsReclassified, warnings };
}
