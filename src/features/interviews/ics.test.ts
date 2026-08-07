import { describe, expect, it } from "vitest";
import { buildInterviewIcs, canExportToCalendar } from "./ics";
import type { Interview } from "@/types";

function interview(overrides: Partial<Interview> = {}): Interview {
  return {
    id: "interview-1",
    user_id: "user-1",
    application_id: "app-1",
    company_name: "Acme",
    role: "Backend Engineer",
    scheduled_at: "2026-08-12T14:00:00.000Z",
    interviewer: "Jane Recruiter",
    type: "Technical Round",
    status: "scheduled",
    link: "https://meet.google.com/abc-defg-hij",
    mode: "online",
    location: null,
    source: "manual",
    created_at: "2026-08-01T00:00:00.000Z",
    updated_at: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("buildInterviewIcs", () => {
  it("produces a well-formed VCALENDAR/VEVENT block", () => {
    const ics = buildInterviewIcs(interview());
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("BEGIN:VEVENT");
    expect(ics).toContain("END:VEVENT");
    expect(ics).toContain("END:VCALENDAR");
  });

  it("uses a stable UID derived from the interview id, unchanged across repeat exports", () => {
    const first = buildInterviewIcs(interview());
    const second = buildInterviewIcs(interview());
    const uidLine = (ics: string) => ics.split("\r\n").find((l) => l.startsWith("UID:"));
    expect(uidLine(first)).toBe(uidLine(second));
    expect(uidLine(first)).toContain("interview-1");
  });

  it("defaults to a 60-minute duration since interviews have no stored end time", () => {
    const ics = buildInterviewIcs(interview());
    expect(ics).toContain("DTSTART:20260812T140000Z");
    expect(ics).toContain("DTEND:20260812T150000Z");
  });

  it("includes the meeting link as the location for an online interview", () => {
    const ics = buildInterviewIcs(interview());
    expect(ics).toContain("LOCATION:https://meet.google.com/abc-defg-hij");
  });

  it("includes the physical location for an offline interview", () => {
    const ics = buildInterviewIcs(
      interview({ mode: "offline", link: null, location: "123 Main St, Floor 4" }),
    );
    expect(ics).toContain("LOCATION:123 Main St\\, Floor 4");
  });

  it("escapes commas, semicolons and backslashes in text fields", () => {
    const ics = buildInterviewIcs(interview({ company_name: "Acme, Inc.; Corp" }));
    expect(ics).toContain("Acme\\, Inc.\\; Corp");
  });

  it("includes the role, interviewer and meeting link in the description", () => {
    const ics = buildInterviewIcs(interview());
    expect(ics).toMatch(/DESCRIPTION:.*Role: Backend Engineer/);
    expect(ics).toMatch(/DESCRIPTION:.*Interviewer: Jane Recruiter/);
  });
});

describe("canExportToCalendar", () => {
  it("allows export for a manual interview", () => {
    expect(canExportToCalendar({ source: "manual" })).toBe(true);
  });

  it("allows export for a Gmail-sourced interview", () => {
    expect(canExportToCalendar({ source: "gmail" })).toBe(true);
  });

  it("hides export for a calendar-sourced interview — it's already on the calendar", () => {
    expect(canExportToCalendar({ source: "calendar" })).toBe(false);
  });

  it("hides export for a 'both'-sourced interview", () => {
    expect(canExportToCalendar({ source: "both" })).toBe(false);
  });
});
