import { describe, expect, it } from "vitest";
import { parseIcs } from "./IcsParser";

describe("parseIcs", () => {
  it("extracts UID, DTSTART, DTEND, LOCATION, ORGANIZER, STATUS and SEQUENCE from a well-formed VEVENT", () => {
    const ics = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "BEGIN:VEVENT",
      "UID:abc123@google.com",
      "DTSTART:20260812T140000Z",
      "DTEND:20260812T150000Z",
      "LOCATION:Zoom Meeting",
      "ORGANIZER;CN=Jane Recruiter:mailto:jane@acme.com",
      "STATUS:CONFIRMED",
      "SEQUENCE:0",
      "SUMMARY:Interview with Acme",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");

    const result = parseIcs(ics);
    expect(result.uid).toBe("abc123@google.com");
    expect(result.dtStartIso).toBe("2026-08-12T14:00:00.000Z");
    expect(result.dtEndIso).toBe("2026-08-12T15:00:00.000Z");
    expect(result.location).toBe("Zoom Meeting");
    expect(result.organizerEmail).toBe("jane@acme.com");
    expect(result.status).toBe("CONFIRMED");
    expect(result.sequence).toBe(0);
  });

  it("handles a CANCELLED event with a non-zero SEQUENCE", () => {
    const ics = [
      "BEGIN:VEVENT",
      "UID:cancelled-event@google.com",
      "DTSTART:20260901T090000Z",
      "STATUS:CANCELLED",
      "SEQUENCE:2",
      "END:VEVENT",
    ].join("\n");

    const result = parseIcs(ics);
    expect(result.status).toBe("CANCELLED");
    expect(result.sequence).toBe(2);
  });

  it("parses an all-day (VALUE=DATE) DTSTART as midnight UTC of that date", () => {
    const ics = [
      "BEGIN:VEVENT",
      "UID:allday@google.com",
      "DTSTART;VALUE=DATE:20260815",
      "END:VEVENT",
    ].join("\n");
    const result = parseIcs(ics);
    expect(result.dtStartIso).toBe("2026-08-15T00:00:00.000Z");
  });

  it("returns null for a DTSTART with a TZID param rather than silently mis-converting it", () => {
    const ics = [
      "BEGIN:VEVENT",
      "UID:tzid-event@google.com",
      "DTSTART;TZID=America/New_York:20260812T100000",
      "END:VEVENT",
    ].join("\n");
    const result = parseIcs(ics);
    expect(result.dtStartIso).toBeNull();
    expect(result.uid).toBe("tzid-event@google.com");
  });

  it("unfolds a line continuation (RFC 5545 line folding) before parsing", () => {
    // Folded mid-word (RFC 5545 permits folding "between any two
    // characters"): the continuation line's single leading space is purely
    // the fold marker and must be removed entirely, not preserved as a real
    // space — "Str" + "\r\n eet" unfolds to "Street", not "Str eet".
    const ics = [
      "BEGIN:VEVENT",
      "UID:folded@google.com",
      "LOCATION:123 Long Str\r\n eet Suite 400",
      "END:VEVENT",
    ].join("\r\n");
    const result = parseIcs(ics);
    expect(result.location).toBe("123 Long Street Suite 400");
  });

  it("unescapes backslash-escaped commas and semicolons in text values", () => {
    const ics = [
      "BEGIN:VEVENT",
      "UID:escaped@google.com",
      "LOCATION:Acme\\, Inc.\\; Floor 3",
      "END:VEVENT",
    ].join("\n");
    const result = parseIcs(ics);
    expect(result.location).toBe("Acme, Inc.; Floor 3");
  });

  it("extracts the organizer email even without an mailto: prefix", () => {
    const ics = [
      "BEGIN:VEVENT",
      "UID:no-mailto@google.com",
      "ORGANIZER:jane@acme.com",
      "END:VEVENT",
    ].join("\n");
    expect(parseIcs(ics).organizerEmail).toBe("jane@acme.com");
  });

  it("returns all-null fields for text with no VEVENT block, without throwing", () => {
    const result = parseIcs("BEGIN:VCALENDAR\nVERSION:2.0\nEND:VCALENDAR");
    expect(result.uid).toBeNull();
    expect(result.dtStartIso).toBeNull();
  });

  it("never throws on malformed input", () => {
    expect(() => parseIcs("not an ics file at all\n\x00\x01")).not.toThrow();
  });

  it("only reads the FIRST VEVENT block when multiple are present", () => {
    const ics = [
      "BEGIN:VEVENT",
      "UID:first@google.com",
      "END:VEVENT",
      "BEGIN:VEVENT",
      "UID:second@google.com",
      "END:VEVENT",
    ].join("\n");
    expect(parseIcs(ics).uid).toBe("first@google.com");
  });
});
