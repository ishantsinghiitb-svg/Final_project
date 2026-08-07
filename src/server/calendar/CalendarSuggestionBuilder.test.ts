import { describe, expect, it } from "vitest";
import {
  buildCalendarInterviewDraft,
  buildCalendarInterviewUpdateDraft,
} from "./CalendarSuggestionBuilder";
import { parseCalendarEventStart } from "./CalendarClassifier";
import type { GoogleCalendarEvent } from "./CalendarApiClient";

function event(overrides: Partial<GoogleCalendarEvent> = {}): GoogleCalendarEvent {
  return {
    id: "evt-1",
    status: "confirmed",
    summary: "Interview — Backend Engineer",
    start: { dateTime: "2026-08-12T14:00:00-04:00", timeZone: "America/New_York" },
    end: { dateTime: "2026-08-12T15:00:00-04:00" },
    ...overrides,
  };
}

function payloadOf(draft: ReturnType<typeof buildCalendarInterviewDraft>) {
  return draft.payload as Record<string, unknown>;
}

describe("buildCalendarInterviewDraft", () => {
  const baseArgs = {
    event: event(),
    time: parseCalendarEventStart(event()),
    companyName: "Acme",
    role: "Backend Engineer",
    recruiterName: "Jane Recruiter",
    applicationId: "app-1",
    possibleDuplicateOfInterviewId: null,
    calendarEventRowId: "cal-evt-row-1",
    matchConfidence: 0.85,
    relevanceConfidence: 0.95,
  };

  it("produces a create_interview draft targeting the matched application", () => {
    const draft = buildCalendarInterviewDraft(baseArgs);
    expect(draft.type).toBe("create_interview");
    expect(draft.targetApplicationId).toBe("app-1");
  });

  it("uses the minimum of match and relevance confidence, never the average", () => {
    const draft = buildCalendarInterviewDraft({
      ...baseArgs,
      matchConfidence: 0.6,
      relevanceConfidence: 0.95,
    });
    expect(draft.confidence).toBe(0.6);
  });

  it("carries scheduledAtIso, link/mode/location and round through the payload", () => {
    const draft = buildCalendarInterviewDraft(baseArgs);
    const payload = payloadOf(draft);
    expect(payload.scheduledAtIso).toBe(baseArgs.time.startsAtIso);
    expect(payload.round).toBeTruthy();
    expect(payload.interviewer).toBe("Jane Recruiter");
  });

  it("leaves scheduledAtIso null for an all-day event, forcing the user to pick a real time", () => {
    const allDayEvent = event({ start: { date: "2026-08-15" }, end: undefined });
    const time = parseCalendarEventStart(allDayEvent);
    const draft = buildCalendarInterviewDraft({ ...baseArgs, event: allDayEvent, time });
    const payload = payloadOf(draft);
    expect(payload.scheduledAtIso).toBeNull();
    expect(payload.isAllDay).toBe(true);
  });

  it("flags isTentative when the user hasn't accepted the invite", () => {
    const tentativeEvent = event({
      attendees: [{ email: "me@gmail.com", self: true, responseStatus: "tentative" }],
    });
    const draft = buildCalendarInterviewDraft({ ...baseArgs, event: tentativeEvent });
    expect(payloadOf(draft).isTentative).toBe(true);
  });

  it("does not flag isTentative when the user has accepted", () => {
    const acceptedEvent = event({
      attendees: [{ email: "me@gmail.com", self: true, responseStatus: "accepted" }],
    });
    const draft = buildCalendarInterviewDraft({ ...baseArgs, event: acceptedEvent });
    expect(payloadOf(draft).isTentative).toBe(false);
  });

  it("sets possibleDuplicateOfInterviewId and changes the copy when a weak merge candidate exists", () => {
    const draft = buildCalendarInterviewDraft({
      ...baseArgs,
      possibleDuplicateOfInterviewId: "interview-existing-1",
    });
    const payload = payloadOf(draft);
    expect(payload.possibleDuplicateOfInterviewId).toBe("interview-existing-1");
    const summary = payload.summary as Record<string, unknown>;
    expect(String(summary.action)).toMatch(/confirm whether this is the same interview/i);
  });

  it("answers what/why/what-to-do explicitly in the summary block", () => {
    const draft = buildCalendarInterviewDraft(baseArgs);
    const summary = payloadOf(draft).summary as Record<string, unknown>;
    expect(summary.headline).toBeTruthy(); // what happened
    expect(summary.reason).toBeTruthy(); // why it matters
    expect(summary.action).toBeTruthy(); // what to do
  });

  it("prefers a video conferenceData link over the description regex fallback", () => {
    const linkedEvent = event({
      conferenceData: {
        entryPoints: [{ entryPointType: "video", uri: "https://meet.google.com/abc-defg-hij" }],
      },
    });
    const draft = buildCalendarInterviewDraft({ ...baseArgs, event: linkedEvent });
    expect(payloadOf(draft).link).toBe("https://meet.google.com/abc-defg-hij");
    expect(payloadOf(draft).mode).toBe("online");
  });

  it("falls back to offline mode with a location when there's no meeting link", () => {
    const officeEvent = event({ location: "123 Main St, Floor 4" });
    const draft = buildCalendarInterviewDraft({ ...baseArgs, event: officeEvent });
    expect(payloadOf(draft).mode).toBe("offline");
    expect(payloadOf(draft).location).toBe("123 Main St, Floor 4");
  });
});

// Regression coverage for the finalization fix: a relevant calendar event
// must ALWAYS become one reviewable create_interview item. Previously an
// event with no matched application became a `create_application` (so
// accepting it created an application, not the interview the user asked
// for), and an event whose title named no company at all produced NOTHING
// and silently vanished — the actual reported bug ("DSA interview" never
// appeared anywhere despite being detected and stored).
describe("buildCalendarInterviewDraft — unmatched and company-less events", () => {
  const unmatchedArgs = {
    event: event(),
    time: parseCalendarEventStart(event()),
    companyName: "Acme",
    role: "Backend Engineer",
    recruiterName: null,
    applicationId: null,
    possibleDuplicateOfInterviewId: null,
    calendarEventRowId: "cal-evt-row-1",
    matchConfidence: 0,
    relevanceConfidence: 0.45,
  };

  it("still produces a create_interview (never a create_application) when no application matched", () => {
    const draft = buildCalendarInterviewDraft(unmatchedArgs);
    expect(draft.type).toBe("create_interview");
    expect(draft.targetApplicationId).toBeNull();
  });

  it("carries companyName and role in the payload so the standalone accept path can build the interview", () => {
    const payload = payloadOf(buildCalendarInterviewDraft(unmatchedArgs));
    expect(payload.companyName).toBe("Acme");
    expect(payload.role).toBe("Backend Engineer");
  });

  it("uses relevance alone for confidence when there is no match signal to floor against", () => {
    const draft = buildCalendarInterviewDraft(unmatchedArgs);
    expect(draft.confidence).toBe(0.45);
  });

  it("produces a draft even when no company name could be extracted — the event must never vanish silently", () => {
    const untitledCompanyEvent = event({ summary: "DSA interview" });
    const draft = buildCalendarInterviewDraft({
      ...unmatchedArgs,
      event: untitledCompanyEvent,
      time: parseCalendarEventStart(untitledCompanyEvent),
      companyName: null,
      role: null,
    });
    expect(draft.type).toBe("create_interview");
    expect(payloadOf(draft).companyName).toBeNull();
  });

  it("tells the user to supply the missing company rather than implying it can just be accepted", () => {
    const draft = buildCalendarInterviewDraft({ ...unmatchedArgs, companyName: null, role: null });
    const summary = payloadOf(draft).summary as Record<string, unknown>;
    expect(String(summary.action)).toMatch(/add the company/i);
    expect((summary.confidenceReasons as string[]).join(" ")).toMatch(/no company name/i);
  });

  it("answers what/why/what-to-do explicitly in the summary block", () => {
    const summary = payloadOf(buildCalendarInterviewDraft(unmatchedArgs)).summary as Record<
      string,
      unknown
    >;
    expect(summary.headline).toBeTruthy();
    expect(summary.reason).toBeTruthy();
    expect(summary.action).toBeTruthy();
  });
});

describe("buildCalendarInterviewUpdateDraft", () => {
  const existingInterview = {
    id: "interview-locked-1",
    company_name: "Acme",
    type: "Technical Round",
    interviewer: "Jane Recruiter",
    scheduled_at: "2026-08-10T14:00:00.000Z",
  };

  const baseArgs = {
    event: event(),
    time: parseCalendarEventStart(event()),
    meetingLink: "https://meet.google.com/abc-defg-hij",
    calendarEventRowId: "cal-evt-row-1",
    applicationId: "app-1",
    existingInterview,
  };

  it("targets the existing interview via existingInterviewId, never creating a new one", () => {
    const draft = buildCalendarInterviewUpdateDraft(baseArgs);
    expect(draft.type).toBe("create_interview");
    expect(draft.targetApplicationId).toBe("app-1");
    const payload = payloadOf(draft);
    expect(payload.existingInterviewId).toBe("interview-locked-1");
    expect(payload.possibleDuplicateOfInterviewId).toBeNull();
  });

  it("passes targetApplicationId through as null for a standalone locked interview", () => {
    const draft = buildCalendarInterviewUpdateDraft({ ...baseArgs, applicationId: null });
    expect(draft.targetApplicationId).toBeNull();
  });

  it("preserves the interview's existing round and interviewer rather than overwriting them", () => {
    const draft = buildCalendarInterviewUpdateDraft(baseArgs);
    const payload = payloadOf(draft);
    expect(payload.round).toBe("Technical Round");
    expect(payload.interviewer).toBe("Jane Recruiter");
  });

  it("carries the calendar's new time distinctly from the interview's currently-recorded time", () => {
    const draft = buildCalendarInterviewUpdateDraft(baseArgs);
    const payload = payloadOf(draft);
    expect(payload.scheduledAtIso).toBe(baseArgs.time.startsAtIso);
    expect(payload.scheduledAtIso).not.toBe(existingInterview.scheduled_at);
  });

  it("falls back to the interview's existing time when the calendar event turned all-day", () => {
    const allDayEvent = event({ start: { date: "2026-08-15" }, end: undefined });
    const time = parseCalendarEventStart(allDayEvent);
    const draft = buildCalendarInterviewUpdateDraft({
      ...baseArgs,
      event: allDayEvent,
      time,
      meetingLink: null,
    });
    expect(payloadOf(draft).scheduledAtIso).toBe(existingInterview.scheduled_at);
  });

  it("explains why this is treated as the same interview in the confidence reasons", () => {
    const draft = buildCalendarInterviewUpdateDraft(baseArgs);
    const summary = payloadOf(draft).summary as Record<string, unknown>;
    expect((summary.confidenceReasons as string[]).join(" ")).toMatch(/already have tracked/i);
  });

  it("answers what/why/what-to-do explicitly in the summary block, naming both times", () => {
    const draft = buildCalendarInterviewUpdateDraft(baseArgs);
    const summary = payloadOf(draft).summary as Record<string, unknown>;
    expect(summary.headline).toBeTruthy();
    expect(String(summary.reason)).toMatch(/calendar now says/i);
    expect(String(summary.action)).toMatch(/review/i);
  });
});
