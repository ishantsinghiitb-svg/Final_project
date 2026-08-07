import type { Interview } from "@/types";
import { safeFileName, triggerBlobDownload } from "@/lib/download";

// ── "Add to Calendar" ICS export (Module 9B) ──
//
// Client-side only — no OAuth scope, no Calendar API call, works even with
// Calendar fully disconnected. This is the answer to "get this interview
// into my calendar" without ever requesting a write scope (see the plan's
// Q1=C: read-only V1, architected so a write path could be added later
// without touching this).
//
// DURATION GAP, documented rather than silently assumed: `interviews` has no
// end-time/duration column anywhere in the schema, so every exported event
// defaults to a fixed 60-minute duration. A real duration field is a
// reasonable future enhancement, out of scope here since it wasn't asked
// for.
//
// UID is derived from the interview's own id, not randomly generated on
// every click — re-downloading the same interview produces the same UID, so
// importing it twice into a real calendar updates the existing event rather
// than creating a duplicate.

const DEFAULT_DURATION_MINUTES = 60;

function escapeIcsText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

/** RFC 5545 folds lines over 75 octets — not strictly required for these short fields, but cheap to do correctly. */
function foldLine(line: string): string {
  if (line.length <= 75) return line;
  const parts: string[] = [];
  let rest = line;
  while (rest.length > 75) {
    parts.push(rest.slice(0, 75));
    rest = " " + rest.slice(75);
  }
  parts.push(rest);
  return parts.join("\r\n");
}

function toIcsUtc(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

/** Builds a standards-compliant single-VEVENT .ics file for one interview. */
export function buildInterviewIcs(interview: Interview): string {
  const start = new Date(interview.scheduled_at);
  const end = new Date(start.getTime() + DEFAULT_DURATION_MINUTES * 60_000);

  const summary = `${interview.type} — ${interview.company_name}`;
  const descriptionParts = [
    interview.role ? `Role: ${interview.role}` : null,
    interview.interviewer ? `Interviewer: ${interview.interviewer}` : null,
    interview.mode === "online" && interview.link ? `Meeting link: ${interview.link}` : null,
    interview.notes ? interview.notes : null,
  ].filter((p): p is string => Boolean(p));

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//NextOffer//Calendar Intelligence//EN",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:nextoffer-interview-${interview.id}@nextoffer`,
    `DTSTAMP:${toIcsUtc(new Date().toISOString())}`,
    `DTSTART:${toIcsUtc(interview.scheduled_at)}`,
    `DTEND:${toIcsUtc(end.toISOString())}`,
    `SUMMARY:${escapeIcsText(summary)}`,
    ...(descriptionParts.length > 0
      ? [`DESCRIPTION:${escapeIcsText(descriptionParts.join("\\n"))}`]
      : []),
    ...(interview.mode === "offline" && interview.location
      ? [`LOCATION:${escapeIcsText(interview.location)}`]
      : interview.mode === "online" && interview.link
        ? [`LOCATION:${escapeIcsText(interview.link)}`]
        : []),
    "END:VEVENT",
    "END:VCALENDAR",
  ];

  return lines.map(foldLine).join("\r\n") + "\r\n";
}

/** Triggers a browser download of the interview as a .ics file. */
export function downloadInterviewIcs(interview: Interview): void {
  const ics = buildInterviewIcs(interview);
  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const dateStamp = new Date(interview.scheduled_at).toISOString().slice(0, 10);
  const filename = `interview-${safeFileName(interview.company_name, "interview")}-${dateStamp}.ics`;
  triggerBlobDownload(blob, filename);
}

/**
 * "Add to Calendar" is only meaningful for an interview that ISN'T already
 * on the user's calendar — a calendar-sourced (or 'both') interview is
 * already there by definition (Q60's explicit hide condition).
 */
export function canExportToCalendar(interview: Pick<Interview, "source">): boolean {
  return interview.source !== "calendar" && interview.source !== "both";
}
