import { describe, expect, it } from "vitest";
import {
  freshnessCutoffIso,
  isFreshJob,
  MAX_JOB_AGE_DAYS,
  parsePostedDate,
  parseRelativePostedDate,
} from "./freshness";

const NOW = new Date("2026-09-12T12:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;

function daysAgo(days: number, extraMs = 0): string {
  return new Date(NOW.getTime() - days * DAY - extraMs).toISOString();
}

describe("parsePostedDate", () => {
  it("parses an ISO timestamp", () => {
    const result = parsePostedDate("2026-09-01T10:00:00Z", NOW);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.iso).toBe("2026-09-01T10:00:00.000Z");
  });

  it("parses a date-only string as UTC midnight", () => {
    const result = parsePostedDate("2026-08-26", NOW);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.iso).toBe("2026-08-26T00:00:00.000Z");
  });

  it("parses epoch milliseconds", () => {
    const result = parsePostedDate(NOW.getTime() - 5 * DAY, NOW);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.iso).toBe(daysAgo(5));
  });

  it("parses epoch seconds", () => {
    const result = parsePostedDate(Math.floor((NOW.getTime() - 5 * DAY) / 1000), NOW);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.iso).toBe(daysAgo(5));
  });

  it("parses a Date instance", () => {
    const result = parsePostedDate(new Date(NOW.getTime() - DAY), NOW);
    expect(result.ok).toBe(true);
  });

  it("rejects null", () => {
    expect(parsePostedDate(null, NOW).ok).toBe(false);
  });

  it("rejects undefined", () => {
    expect(parsePostedDate(undefined, NOW).ok).toBe(false);
  });

  it("rejects an empty string", () => {
    expect(parsePostedDate("", NOW).ok).toBe(false);
  });

  it("rejects a malformed date", () => {
    const result = parsePostedDate("not-a-date", NOW);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/could not be parsed/i);
  });

  it("rejects a far-future date", () => {
    const result = parsePostedDate("2027-01-01T00:00:00Z", NOW);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/future/i);
  });

  it("tolerates a date just ahead of now (timezone/date-only skew)", () => {
    expect(parsePostedDate(new Date(NOW.getTime() + 12 * 60 * 60 * 1000), NOW).ok).toBe(true);
  });

  it("rejects an absurdly old date as a mis-parse", () => {
    const result = parsePostedDate("1999-01-01T00:00:00Z", NOW);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/mis-parse/i);
  });
});

describe("isFreshJob — the 30-day boundary", () => {
  it("accepts a job posted today", () => {
    expect(isFreshJob(NOW.toISOString(), NOW).fresh).toBe(true);
  });

  it("accepts 29 days old", () => {
    expect(isFreshJob(daysAgo(29), NOW).fresh).toBe(true);
  });

  it("accepts EXACTLY 30 days old — the boundary is inclusive", () => {
    expect(isFreshJob(daysAgo(30), NOW).fresh).toBe(true);
  });

  it("rejects one millisecond past 30 days", () => {
    expect(isFreshJob(daysAgo(30, 1), NOW).fresh).toBe(false);
  });

  it("rejects 31 days old", () => {
    const decision = isFreshJob(daysAgo(31), NOW);
    expect(decision.fresh).toBe(false);
    if (!decision.fresh) expect(decision.reason).toMatch(/older than the 30-day window/i);
  });

  it("rejects a job posted months ago", () => {
    expect(isFreshJob("2026-06-03T02:46:08-04:00", NOW).fresh).toBe(false);
  });

  it("rejects a missing posted date rather than defaulting to now", () => {
    const decision = isFreshJob(null, NOW);
    expect(decision.fresh).toBe(false);
    if (!decision.fresh) expect(decision.reason).toMatch(/no posted date/i);
  });

  it("rejects a malformed posted date", () => {
    expect(isFreshJob("yesterday", NOW).fresh).toBe(false);
  });

  it("reports the age in days for an accepted job", () => {
    const decision = isFreshJob(daysAgo(10), NOW);
    expect(decision.fresh).toBe(true);
    if (decision.fresh) expect(Math.round(decision.ageDays)).toBe(10);
  });

  it("honours a custom window", () => {
    expect(isFreshJob(daysAgo(20), NOW, 14).fresh).toBe(false);
    expect(isFreshJob(daysAgo(10), NOW, 14).fresh).toBe(true);
  });
});

describe("isFreshJob — timezone independence", () => {
  it("treats the same instant expressed in different offsets identically", () => {
    const utc = "2026-09-01T00:00:00Z";
    const ist = "2026-09-01T05:30:00+05:30"; // the same instant
    const a = isFreshJob(utc, NOW);
    const b = isFreshJob(ist, NOW);
    expect(a.fresh).toBe(b.fresh);
    if (a.fresh && b.fresh) expect(a.ageDays).toBeCloseTo(b.ageDays, 6);
  });

  it("compares instants, not local calendar days, at the boundary", () => {
    // 30 days ago in IST is still 30 days ago in UTC — same instant, same verdict.
    const boundaryIst = new Date(NOW.getTime() - 30 * DAY).toISOString();
    expect(isFreshJob(boundaryIst, NOW).fresh).toBe(true);
  });
});

describe("freshnessCutoffIso", () => {
  it("returns the oldest still-eligible instant", () => {
    expect(freshnessCutoffIso(NOW)).toBe(daysAgo(MAX_JOB_AGE_DAYS));
  });
});

describe("parseRelativePostedDate — sources that only state an age", () => {
  // Internshala publishes no absolute date; these are its real chip values.
  it("reads 'Posted just now' as now", () => {
    expect(parseRelativePostedDate("Posted just now", NOW)).toBe(NOW.toISOString());
  });

  it("reads 'Posted few hours ago' as today", () => {
    expect(parseRelativePostedDate("Posted few hours ago", NOW)).toBe(NOW.toISOString());
  });

  it("reads 'Posted 1 day ago'", () => {
    expect(parseRelativePostedDate("Posted 1 day ago", NOW)).toBe(daysAgo(1));
  });

  it("reads 'Posted 5 days ago'", () => {
    expect(parseRelativePostedDate("Posted 5 days ago", NOW)).toBe(daysAgo(5));
  });

  it("reads 'Posted 1 week ago'", () => {
    expect(parseRelativePostedDate("Posted 1 week ago", NOW)).toBe(daysAgo(7));
  });

  it("reads 'Posted 2 weeks ago'", () => {
    expect(parseRelativePostedDate("Posted 2 weeks ago", NOW)).toBe(daysAgo(14));
  });

  it("reads 'yesterday'", () => {
    expect(parseRelativePostedDate("Posted yesterday", NOW)).toBe(daysAgo(1));
  });

  it("reads 'a month ago' as one month", () => {
    expect(parseRelativePostedDate("a month ago", NOW)).toBe(daysAgo(30));
  });

  it("returns null for text with no age in it", () => {
    expect(parseRelativePostedDate("Actively hiring", NOW)).toBeNull();
    expect(parseRelativePostedDate("", NOW)).toBeNull();
    expect(parseRelativePostedDate(null, NOW)).toBeNull();
  });

  it("feeds the freshness rule so an Internshala posting can qualify", () => {
    expect(isFreshJob(parseRelativePostedDate("Posted 3 days ago", NOW), NOW).fresh).toBe(true);
    expect(isFreshJob(parseRelativePostedDate("Posted 2 months ago", NOW), NOW).fresh).toBe(false);
  });
});
