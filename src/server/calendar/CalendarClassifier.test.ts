import { describe, expect, it } from "vitest";
import {
  parseCalendarEventStart,
  extractCalendarMeetingLink,
  findSelfResponseStatus,
  externalAttendeeEmails,
  organizerEmailForRelevance,
  inferRoundLabel,
} from "./CalendarClassifier";
import type { GoogleCalendarEvent } from "./CalendarApiClient";

function baseEvent(overrides: Partial<GoogleCalendarEvent> = {}): GoogleCalendarEvent {
  return { id: "evt-1", status: "confirmed", ...overrides };
}

describe("parseCalendarEventStart", () => {
  it("parses a timed event's dateTime as a real instant, preserving the IANA timezone", () => {
    const result = parseCalendarEventStart(
      baseEvent({
        start: { dateTime: "2026-08-12T14:00:00-04:00", timeZone: "America/New_York" },
        end: { dateTime: "2026-08-12T15:00:00-04:00" },
      }),
    );
    expect(result.isAllDay).toBe(false);
    expect(result.timezone).toBe("America/New_York");
    expect(new Date(result.startsAtIso).toISOString()).toBe("2026-08-12T18:00:00.000Z");
    expect(result.endsAtIso).not.toBeNull();
  });

  it("treats an all-day event as isAllDay with no real time, anchored to midnight UTC", () => {
    const result = parseCalendarEventStart(baseEvent({ start: { date: "2026-08-12" } }));
    expect(result.isAllDay).toBe(true);
    expect(result.startsAtIso).toBe("2026-08-12T00:00:00.000Z");
  });

  it("falls back to a safe anchor when start is entirely missing", () => {
    const result = parseCalendarEventStart(baseEvent({}));
    expect(() => new Date(result.startsAtIso).toISOString()).not.toThrow();
  });
});

describe("extractCalendarMeetingLink", () => {
  it("prefers a structured conferenceData video entry point over everything else", () => {
    const link = extractCalendarMeetingLink(
      baseEvent({
        conferenceData: {
          entryPoints: [{ entryPointType: "video", uri: "https://meet.google.com/abc-defg-hij" }],
        },
        hangoutLink: "https://meet.google.com/wrong-link",
        description: "Join here: https://zoom.us/j/999999999",
      }),
    );
    expect(link).toBe("https://meet.google.com/abc-defg-hij");
  });

  it("falls back to hangoutLink when there is no conferenceData video entry", () => {
    const link = extractCalendarMeetingLink(
      baseEvent({ hangoutLink: "https://meet.google.com/xyz-abcd-efg" }),
    );
    expect(link).toBe("https://meet.google.com/xyz-abcd-efg");
  });

  it("falls back to a regex match over the description as a last resort", () => {
    const link = extractCalendarMeetingLink(
      baseEvent({ description: "Please join via https://zoom.us/j/1234567890" }),
    );
    expect(link).toBe("https://zoom.us/j/1234567890");
  });

  it("returns null when no link exists anywhere", () => {
    expect(extractCalendarMeetingLink(baseEvent({ description: "No link here" }))).toBeNull();
  });
});

describe("findSelfResponseStatus", () => {
  it("finds the user's own RSVP among the attendees", () => {
    const status = findSelfResponseStatus(
      baseEvent({
        attendees: [
          { email: "recruiter@acme.com", responseStatus: "accepted" },
          { email: "me@gmail.com", self: true, responseStatus: "tentative" },
        ],
      }),
    );
    expect(status).toBe("tentative");
  });

  it("returns null when the user has no self-attendee entry (e.g. they're the organizer only)", () => {
    expect(
      findSelfResponseStatus(baseEvent({ attendees: [{ email: "recruiter@acme.com" }] })),
    ).toBeNull();
  });
});

describe("externalAttendeeEmails", () => {
  it("excludes the self entry and includes everyone else", () => {
    const emails = externalAttendeeEmails(
      baseEvent({
        attendees: [
          { email: "me@gmail.com", self: true },
          { email: "recruiter@acme.com" },
          { email: "hiring-manager@acme.com" },
        ],
      }),
    );
    expect(emails).toEqual(["recruiter@acme.com", "hiring-manager@acme.com"]);
  });

  it("returns an empty array when there are no attendees at all", () => {
    expect(externalAttendeeEmails(baseEvent({}))).toEqual([]);
  });
});

describe("organizerEmailForRelevance", () => {
  it("passes the organizer's email through when they are someone else", () => {
    expect(
      organizerEmailForRelevance(baseEvent({ organizer: { email: "recruiter@acme.com" } })),
    ).toBe("recruiter@acme.com");
  });

  it("returns null when the connected user is the organizer, so a self-created block never counts as an external party", () => {
    expect(
      organizerEmailForRelevance(baseEvent({ organizer: { email: "me@gmail.com", self: true } })),
    ).toBeNull();
  });

  it("returns null when there is no organizer at all", () => {
    expect(organizerEmailForRelevance(baseEvent({}))).toBeNull();
  });
});

describe("inferRoundLabel", () => {
  it("recognizes an HR round from the title", () => {
    expect(inferRoundLabel("HR Round — Final Discussion")).toBe("HR Round");
  });

  it("recognizes a technical round", () => {
    expect(inferRoundLabel("Technical Interview - Backend")).toBe("Technical Round");
  });

  it("falls back to a generic 'Interview' label when nothing matches", () => {
    expect(inferRoundLabel("Call with Jane")).toBe("Interview");
  });

  it("falls back to 'Interview' when there is no title at all", () => {
    expect(inferRoundLabel(null)).toBe("Interview");
  });
});
