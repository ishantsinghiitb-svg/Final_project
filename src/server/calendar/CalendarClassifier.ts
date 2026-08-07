import type { GoogleCalendarEvent } from "./CalendarApiClient";
import { extractMeetingLink } from "@/server/gmail/EmailClassifier";

// ── Calendar event parsing (Module 9B) ──
//
// Deliberately NOT a port of EmailClassifier.ts's 20-category lifecycle
// classifier — a calendar event's meaning is "this already-scheduled thing
// is (or isn't) an interview," a much thinner question than an email's.
// Interview-likelihood tiering lives in CalendarRelevanceFilter; this file
// only extracts structured facts from an already-fetched event.
//
// Date handling is the one place worth calling out explicitly: the Calendar
// API returns already-parsed RFC3339 (`start.dateTime`) or an all-day date
// (`start.date`) plus a real IANA `start.timeZone` — never unstructured
// prose. That means none of EmailClassifier's ICS-DTSTART-regex or
// fixed-offset-approximation machinery applies or is needed here; this is a
// strictly EASIER parsing problem than the email path solves, and the real
// IANA zone is correctly DST-aware for free (the email path's fixed-offset
// table is an accepted limitation there specifically because prose never
// gives you a real zone name).

export type ParsedEventTime = {
  /** Always a real instant — for an all-day event, midnight UTC of that date (a sort/dedupe anchor, not a real time; see `isAllDay`). */
  startsAtIso: string;
  endsAtIso: string | null;
  isAllDay: boolean;
  /** Real IANA zone from Google (e.g. "America/New_York"), or null if absent. */
  timezone: string | null;
};

export function parseCalendarEventStart(event: GoogleCalendarEvent): ParsedEventTime {
  const start = event.start;
  const end = event.end;

  if (start?.dateTime) {
    return {
      startsAtIso: new Date(start.dateTime).toISOString(),
      endsAtIso: end?.dateTime ? new Date(end.dateTime).toISOString() : null,
      isAllDay: false,
      timezone: start.timeZone ?? null,
    };
  }

  if (start?.date) {
    return {
      startsAtIso: new Date(`${start.date}T00:00:00Z`).toISOString(),
      endsAtIso: end?.date ? new Date(`${end.date}T00:00:00Z`).toISOString() : null,
      isAllDay: true,
      timezone: start.timeZone ?? null,
    };
  }

  // Shouldn't happen (every real event has a start) — treat "now" as a safe
  // anchor rather than throwing and losing the whole sync batch over one
  // malformed event.
  const now = new Date().toISOString();
  return { startsAtIso: now, endsAtIso: null, isAllDay: false, timezone: null };
}

/**
 * Meeting link priority: Calendar's own structured `conferenceData` (Meet/
 * Zoom/Teams add-ons register an entry point here) → `hangoutLink` (Meet's
 * older, simpler field) → a regex fallback over the description, reusing
 * EmailClassifier's `extractMeetingLink` (generic text-pattern matching, no
 * Gmail coupling) for a link pasted into free text. Checked in this order
 * because the first two are structured data Gmail never has; the regex is
 * the fallback of last resort here, not the primary signal it is for email.
 */
export function extractCalendarMeetingLink(event: GoogleCalendarEvent): string | null {
  const videoEntry = event.conferenceData?.entryPoints?.find((e) => e.entryPointType === "video");
  if (videoEntry?.uri) return videoEntry.uri;
  if (event.hangoutLink) return event.hangoutLink;
  if (event.description) return extractMeetingLink(event.description);
  return null;
}

/** The user's own RSVP on this event, or null if they're not in the attendee list (e.g. they're the organizer with no self-attendee entry). */
export function findSelfResponseStatus(event: GoogleCalendarEvent): string | null {
  return event.attendees?.find((a) => a.self)?.responseStatus ?? null;
}

/** Every attendee's email except the user's own — the Tier 1/2/3 "external attendee" signal. */
export function externalAttendeeEmails(event: GoogleCalendarEvent): string[] {
  return (event.attendees ?? []).filter((a) => !a.self && a.email).map((a) => a.email as string);
}

/**
 * The organizer's email, but ONLY when the organizer is someone other than
 * the connected user — feeds CalendarRelevanceFilter's attendee/organizer-
 * domain signals. Google's `organizer.self` is true only when the connected
 * user created the event; a self-created event (e.g. a personal "prep for
 * interview" block with no one invited) must never count its own organizer
 * as an "external party," or a solo reminder would false-positive into a
 * relevant tier. A real recruiter invite, by contrast, very often has the
 * recruiter as `organizer` WITHOUT duplicating them into `attendees` (common
 * for events created by scheduling tools) — passing the organizer through
 * here (when it's genuinely someone else) is what makes those invites
 * recognizable at all.
 */
export function organizerEmailForRelevance(event: GoogleCalendarEvent): string | null {
  return event.organizer?.self ? null : (event.organizer?.email ?? null);
}

const ROUND_KEYWORDS: { pattern: RegExp; label: string }[] = [
  { pattern: /\bhr\b|\bhuman resources\b/i, label: "HR Round" },
  { pattern: /\btechnical\b|\btech\b/i, label: "Technical Round" },
  { pattern: /\bonsite\b|\bon-site\b/i, label: "Onsite" },
  { pattern: /\bpanel\b/i, label: "Panel Interview" },
  { pattern: /\bfinal\b/i, label: "Final Round" },
  { pattern: /\bscreen(ing)?\b/i, label: "Screening" },
  { pattern: /\bmanager(ial)?\b/i, label: "Hiring Manager Round" },
  { pattern: /\bculture\b|\bfit\b/i, label: "Culture Fit" },
];

/** Deterministic round-label inference from the event title — always editable in the review dialog, so a miss here just means "Interview". */
export function inferRoundLabel(title: string | null): string {
  if (!title) return "Interview";
  for (const { pattern, label } of ROUND_KEYWORDS) {
    if (pattern.test(title)) return label;
  }
  return "Interview";
}
