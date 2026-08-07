import { describe, expect, it } from "vitest";
import { detectMeetingProvider, MEETING_PROVIDER_LABEL } from "./meetingLink";

describe("detectMeetingProvider", () => {
  it("recognizes a Google Meet link", () => {
    expect(detectMeetingProvider("https://meet.google.com/abc-defg-hij")).toBe("google_meet");
  });

  it("recognizes a Zoom link", () => {
    expect(detectMeetingProvider("https://zoom.us/j/1234567890")).toBe("zoom");
  });

  it("recognizes a Microsoft Teams link", () => {
    expect(detectMeetingProvider("https://teams.microsoft.com/l/meetup-join/abc")).toBe("teams");
  });

  it("falls back to 'other' for an unrecognized provider", () => {
    expect(detectMeetingProvider("https://webex.com/meet/abc")).toBe("other");
  });

  it("falls back to 'other' for null/undefined", () => {
    expect(detectMeetingProvider(null)).toBe("other");
    expect(detectMeetingProvider(undefined)).toBe("other");
  });

  it("every provider has a display label", () => {
    for (const provider of Object.keys(MEETING_PROVIDER_LABEL)) {
      expect(MEETING_PROVIDER_LABEL[provider as keyof typeof MEETING_PROVIDER_LABEL]).toBeTruthy();
    }
  });
});
