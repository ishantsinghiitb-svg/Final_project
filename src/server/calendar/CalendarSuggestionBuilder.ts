import type { Json } from "@/types/database";
import type { SuggestionType } from "@/features/gmail/types";
import type { GoogleCalendarEvent } from "./CalendarApiClient";
import {
  extractCalendarMeetingLink,
  findSelfResponseStatus,
  inferRoundLabel,
} from "./CalendarClassifier";
import type { ParsedEventTime } from "./CalendarClassifier";

// ── Calendar suggestion drafting (Module 9B) ──
//
// Deliberately NOT a port of SuggestionBuilder.ts's 5-type/20-category
// table — a calendar event only ever justifies two of the five existing
// suggestion types (create_interview, create_application; no new type was
// needed, see the Module 9B plan §1.4). This file is pure — no DB access —
// mirroring SuggestionBuilder.ts's own shape: the caller (CalendarSyncService)
// resolves the merge candidate and application match first, then hands the
// already-resolved facts here to build the draft + its copy.
//
// Every suggestion this produces is built to answer three questions,
// explicitly (Q7 in the plan, "what happened / why does it matter / what
// should I do"):
//   - what happened  → summary.headline
//   - why it matters  → reason
//   - what to do      → action
// This is the same separation SuggestionBuilder.ts already uses for Gmail —
// reused deliberately, not reinvented.

export type SuggestionDraft = {
  type: SuggestionType;
  confidence: number;
  explanation: string;
  targetApplicationId: string | null;
  payload: Json;
};

export type MergeCandidate = { interviewId: string; kind: "exact" | "possible_duplicate" };

function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

/**
 * Builds the `create_interview` draft for a relevant event that isn't already
 * a known interview — THE one draft Calendar produces for a new detection.
 *
 * `applicationId` is nullable on purpose: a calendar event that matches a
 * tracked application links to it, and one that doesn't still becomes an
 * interview (a STANDALONE one, created at accept time from the companyName/
 * role carried in this payload). Calendar deliberately never proposes
 * creating an *application* — the finalization spec is explicit that a
 * detected interview event turns into one reviewable "interview detected"
 * item whose Accept produces the Interview card, not a two-step
 * accept-an-application-then-re-sync dance. Tracking an application is
 * Gmail's job.
 *
 * `companyName` may be null when the event title names no company at all
 * ("DSA interview") — the draft is still produced (previously this dropped
 * the event silently, so it never surfaced anywhere); Accept then asks for
 * the company in the review dialog, the same way a missing time does.
 *
 * `possibleDuplicateOfInterviewId` is set when a weaker (time-window) merge
 * candidate exists and needs the user's confirmation before merging.
 */
export function buildCalendarInterviewDraft(input: {
  event: GoogleCalendarEvent;
  time: ParsedEventTime;
  companyName: string | null;
  role: string | null;
  recruiterName: string | null;
  applicationId: string | null;
  possibleDuplicateOfInterviewId: string | null;
  calendarEventRowId: string;
  matchConfidence: number;
  relevanceConfidence: number;
}): SuggestionDraft {
  const { event, time, companyName, role, recruiterName } = input;
  const meetingLink = extractCalendarMeetingLink(event);
  const selfResponseStatus = findSelfResponseStatus(event);
  const isTentative = selfResponseStatus === "tentative" || selfResponseStatus === "needsAction";
  const round = inferRoundLabel(event.summary ?? null);
  const who = companyName ?? "this company";
  const forRole = role ? ` for ${role}` : "";
  const when = `${formatDay(time.startsAtIso)}${time.isAllDay ? "" : ` at ${formatTime(time.startsAtIso)}`}`;

  // Mirrors SuggestionBuilder's own combinedConfidence formula — the
  // minimum of the two independent signals, a conservative floor rather
  // than an average. With no application matched there's no second signal
  // to floor against, so relevance alone carries it.
  const combinedConfidence = input.applicationId
    ? Math.min(input.relevanceConfidence, input.matchConfidence)
    : input.relevanceConfidence;

  const headline = input.possibleDuplicateOfInterviewId
    ? `A calendar event might be the same interview as one you're already tracking at ${who}`
    : companyName
      ? `Interview detected at ${companyName}`
      : "An interview was detected on your calendar";

  const reason = input.possibleDuplicateOfInterviewId
    ? `This event is close in time to an interview you already have tracked at ${who}${forRole} — it might be the same one, rescheduled, or a separate round.`
    : input.applicationId
      ? `The event "${event.summary ?? "Untitled"}" on ${when} matches your tracked application at ${who}${forRole}.`
      : companyName
        ? `The event "${event.summary ?? "Untitled"}" on ${when} looks like an interview at ${companyName}${forRole}. You're not tracking an application there yet, so this would be added as a standalone interview.`
        : `The event "${event.summary ?? "Untitled"}" on ${when} looks like an interview, but the title doesn't name a company.`;

  const action = input.possibleDuplicateOfInterviewId
    ? "Review — confirm whether this is the same interview (merge) or a separate round (keep both)."
    : !companyName
      ? "Review and add the company before accepting this interview."
      : time.isAllDay
        ? "Review and pick a specific time before adding this interview."
        : "Accept to add this interview, or edit the details first.";

  const payload: Record<string, unknown> = {
    scheduledAtIso: time.isAllDay ? null : time.startsAtIso,
    timezoneConfident: true,
    rawDateText: null,
    meetingLink,
    link: meetingLink,
    mode: meetingLink ? "online" : event.location ? "offline" : "online",
    location: event.location ?? null,
    round,
    interviewer: recruiterName,
    existingInterviewId: null,
    calendarEventId: input.calendarEventRowId,
    isTentative,
    isAllDay: time.isAllDay,
    possibleDuplicateOfInterviewId: input.possibleDuplicateOfInterviewId,
    // Carried for the STANDALONE accept path (no application to inherit
    // from) and for the review dialog's Company/Role fields. Null company is
    // a real, expected state — the dialog requires it before Accept.
    companyName,
    role,
    summary: {
      headline,
      company: companyName,
      role,
      recruiter: recruiterName,
      receivedAtIso: time.startsAtIso,
      reason,
      action,
      confidenceReasons: [
        input.possibleDuplicateOfInterviewId
          ? "Same tracked application, close in time to an existing interview"
          : input.applicationId
            ? "Matches an application you're already tracking"
            : "Detected as an interview from your calendar",
        isTentative ? "You haven't confirmed this invite yet" : null,
        time.isAllDay ? "All-day event — no specific time set" : null,
        !companyName ? "No company name found in the event" : null,
      ].filter((r): r is string => Boolean(r)),
      subject: event.summary ?? null,
    },
  };

  return {
    type: "create_interview",
    confidence: combinedConfidence,
    explanation: reason,
    targetApplicationId: input.applicationId,
    payload: payload as Json,
  };
}

/**
 * Builds a `create_interview` draft with a CONFIRMED existing target
 * (`existingInterviewId` set, not a merge candidate) — used whenever a
 * calendar event is determined to BE an interview OfferLyst already knows
 * about (whether that's the first time the link is confirmed, via
 * CalendarSyncService's merge ladder, or a later drift on an
 * already-confirmed link) and something about it (time or location)
 * changed. Every update, without exception, goes through this review step —
 * Calendar never silently rewrites an interview, exactly like Gmail never
 * silently creates one.
 */
export function buildCalendarInterviewUpdateDraft(input: {
  event: GoogleCalendarEvent;
  time: ParsedEventTime;
  meetingLink: string | null;
  calendarEventRowId: string;
  applicationId: string | null;
  existingInterview: {
    id: string;
    company_name: string;
    type: string;
    interviewer: string | null;
    scheduled_at: string;
  };
}): SuggestionDraft {
  const { event, time, meetingLink, existingInterview } = input;
  const who = existingInterview.company_name;
  const selfResponseStatus = findSelfResponseStatus(event);
  const isTentative = selfResponseStatus === "tentative" || selfResponseStatus === "needsAction";

  const headline = `Your calendar now shows different details for your ${who} interview`;
  const reason = `Your calendar now says ${formatDay(time.startsAtIso)}${time.isAllDay ? "" : ` at ${formatTime(time.startsAtIso)}`}, but you have it recorded as ${formatDay(existingInterview.scheduled_at)} at ${formatTime(existingInterview.scheduled_at)}.`;
  const action =
    "Review — Accept Update to apply the calendar's new details, or Dismiss to keep what you have.";

  const payload: Record<string, unknown> = {
    scheduledAtIso: time.isAllDay ? existingInterview.scheduled_at : time.startsAtIso,
    timezoneConfident: true,
    rawDateText: null,
    meetingLink,
    link: meetingLink,
    mode: meetingLink ? "online" : event.location ? "offline" : "online",
    location: event.location ?? null,
    round: existingInterview.type,
    interviewer: existingInterview.interviewer,
    existingInterviewId: existingInterview.id,
    calendarEventId: input.calendarEventRowId,
    isTentative,
    isAllDay: time.isAllDay,
    possibleDuplicateOfInterviewId: null,
    companyName: who,
    summary: {
      headline,
      company: who,
      role: null,
      recruiter: existingInterview.interviewer,
      receivedAtIso: time.startsAtIso,
      reason,
      action,
      confidenceReasons: ["Matches an interview you already have tracked"],
      subject: event.summary ?? null,
    },
  };

  return {
    type: "create_interview",
    confidence: 0.9,
    explanation: reason,
    targetApplicationId: input.applicationId,
    payload: payload as Json,
  };
}

// NOTE: a `buildCalendarApplicationDraft` used to live here, producing a
// `create_application` suggestion for a relevant event with no matched
// application. It was REMOVED in the finalization pass: it made accepting a
// detected interview a two-step dance (accept an application, re-sync, then
// accept the interview it finally matched), and it silently dropped any
// event whose title named no company at all — which is exactly why a real
// "DSA interview" event was detected, stored, and then never surfaced
// anywhere in the UI. Calendar now always produces ONE create_interview
// draft per detection (see buildCalendarInterviewDraft), matched or not.
