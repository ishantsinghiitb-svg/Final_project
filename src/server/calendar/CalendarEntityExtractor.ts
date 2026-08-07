import type { ParsedFromHeader } from "@/server/gmail/emailParsing";
import { extractCompanyName } from "@/server/gmail/CompanyExtractor";
import { extractRole, extractRecruiterName } from "@/server/gmail/EntityExtractor";
import type { GoogleCalendarEvent } from "./CalendarApiClient";

// ── Calendar entity extraction (Module 9B) ──
//
// A thin adapter, not new extraction logic: extractCompanyName/extractRole/
// extractRecruiterName (src/server/gmail/CompanyExtractor.ts,
// EntityExtractor.ts) have zero Gmail-specific runtime coupling — no MIME,
// thread or message-id assumptions, just ParsedFromHeader + text — so they
// run unchanged against a calendar event's organizer + title + description.
//
// The one real adapter step is building a ParsedFromHeader-shaped value from
// the event's organizer (falling back to the first external attendee when
// the user themself is the organizer — common for a self-created interview
// block built from an accepted email). Expect lower recall than on email:
// the extractors' strongest patterns are tuned for email phrasing ("your
// application to X", "the team at X") that a terse event title like
// "Interview — Acme — Backend Engineer" won't hit as often; both extractors
// already have fallback branches (domain-derived company, title-splitting
// for role) that calendar events lean on more heavily.

function organizerAsFromHeader(event: GoogleCalendarEvent): ParsedFromHeader {
  const organizer = event.organizer;
  const externalAttendee = event.attendees?.find((a) => !a.self && a.email);
  const source =
    organizer && !organizer.self && organizer.email ? organizer : (externalAttendee ?? organizer);

  const address = (source?.email ?? "").toLowerCase();
  const domain = address.split("@")[1] ?? "";
  return { address, domain, displayName: source?.displayName ?? null };
}

export function extractCalendarCompanyName(event: GoogleCalendarEvent): string | null {
  const from = organizerAsFromHeader(event);
  return extractCompanyName(from, event.summary ?? "", event.description ?? "");
}

export function extractCalendarRole(event: GoogleCalendarEvent): string | null {
  return extractRole(event.summary ?? "", event.description ?? "");
}

export function extractCalendarRecruiterName(event: GoogleCalendarEvent): string | null {
  const from = organizerAsFromHeader(event);
  return extractRecruiterName(from, event.description ?? "");
}

export { organizerAsFromHeader };
