// ── Module 10B.2: the 30-day active-job lifecycle ──
//
// The rule these tests protect: freshness is decided by `last_seen_at` (when a
// crawl last OBSERVED the job live), NOT by `posted_at` (when the source says
// it was originally posted). Confusing the two is not hypothetical — this
// codebase shipped a `posted_at` age ceiling once and reverted it as a
// reported regression, because a still-open repost carries an old date.

import { describe, expect, it } from "vitest";
import {
  ACTIVE_WINDOW_DAYS,
  activeWindowCutoffIso,
  ageInDays,
  isOutsideActiveWindow,
} from "./activeWindow";

const NOW = Date.parse("2026-08-09T12:00:00Z");
const daysAgo = (days: number) => new Date(NOW - days * 24 * 3600 * 1000).toISOString();

describe("activeWindowCutoffIso", () => {
  it("is exactly 30 days back", () => {
    expect(activeWindowCutoffIso(NOW)).toBe(daysAgo(ACTIVE_WINDOW_DAYS));
  });
});

describe("isOutsideActiveWindow — the INGESTION gate", () => {
  it("accepts a posting inside the window", () => {
    expect(isOutsideActiveWindow(daysAgo(0), NOW)).toBe(false);
    expect(isOutsideActiveWindow(daysAgo(29), NOW)).toBe(false);
  });

  it("rejects a posting past the window", () => {
    expect(isOutsideActiveWindow(daysAgo(31), NOW)).toBe(true);
    expect(isOutsideActiveWindow(daysAgo(400), NOW)).toBe(true);
  });

  it("NEVER treats an absent date as stale", () => {
    // Many sources omit the date, and every extension-captured job predates
    // this rule — "unknown age" must not mean "too old".
    expect(isOutsideActiveWindow(null, NOW)).toBe(false);
    expect(isOutsideActiveWindow(undefined, NOW)).toBe(false);
  });

  it("never treats an unparseable date as stale", () => {
    expect(isOutsideActiveWindow("last spring", NOW)).toBe(false);
  });

  it("does not treat a future date as stale", () => {
    expect(isOutsideActiveWindow(daysAgo(-5), NOW)).toBe(false);
  });
});

describe("ageInDays", () => {
  it("counts whole days", () => {
    expect(ageInDays(daysAgo(0), NOW)).toBe(0);
    expect(ageInDays(daysAgo(45), NOW)).toBe(45);
  });

  it("returns null when the date is absent or unparseable", () => {
    expect(ageInDays(null, NOW)).toBeNull();
    expect(ageInDays("soon", NOW)).toBeNull();
  });
});

// ── The lifecycle semantics the discovery query implements ──
//
// `JobRepository.applyDiscoveryVisibility` filters on `last_seen_at`. These
// tests pin the DECISION that filter encodes, in the four cases the module
// scope calls out, without needing a database.

/** Mirrors the discovery predicate: last_seen_at IS NULL OR >= cutoff. */
function isActive(job: { lastSeenAt: string | null }, now = NOW): boolean {
  if (job.lastSeenAt === null) return true;
  return job.lastSeenAt >= activeWindowCutoffIso(now);
}

describe("active-job lifecycle", () => {
  it("old original posting + recently observed → ACTIVE", () => {
    // The repost case that broke the feed last time. A job first posted a year
    // ago but seen on its board today is open, and must stay visible.
    const repost = { postedAt: daysAgo(365), lastSeenAt: daysAgo(0) };
    expect(isActive(repost)).toBe(true);
    // And note the two dates genuinely disagree — that is the whole point.
    expect(isOutsideActiveWindow(repost.postedAt, NOW)).toBe(true);
  });

  it("old posting + not seen recently → INACTIVE", () => {
    expect(isActive({ lastSeenAt: daysAgo(31) })).toBe(false);
    expect(isActive({ lastSeenAt: daysAgo(400) })).toBe(false);
  });

  it("new posting → ACTIVE", () => {
    expect(isActive({ lastSeenAt: daysAgo(0) })).toBe(true);
  });

  it("a rediscovered job becomes active again without changing posted_at", () => {
    const stale = { postedAt: daysAgo(200), lastSeenAt: daysAgo(90) };
    expect(isActive(stale)).toBe(false);

    // A later crawl observes it again. Only last_seen_at moves.
    const rediscovered = { ...stale, lastSeenAt: daysAgo(1) };
    expect(isActive(rediscovered)).toBe(true);
    expect(rediscovered.postedAt).toBe(stale.postedAt);
  });

  it("a duplicate crawl of the same job does not change its lifecycle standing", () => {
    const first = { lastSeenAt: daysAgo(2) };
    const afterDuplicateCrawl = { lastSeenAt: daysAgo(0) };
    // Both are active; re-seeing a job can only ever refresh it, never age it.
    expect(isActive(first)).toBe(true);
    expect(isActive(afterDuplicateCrawl)).toBe(true);
  });

  it("a row with no last_seen_at stays visible", () => {
    // Rows predating the column, and anything the untouched extension path
    // writes. Unknown is not stale — the same rule the ingestion gate uses.
    expect(isActive({ lastSeenAt: null })).toBe(true);
  });

  it("sits exactly on the boundary correctly", () => {
    expect(isActive({ lastSeenAt: activeWindowCutoffIso(NOW) })).toBe(true);
    expect(isActive({ lastSeenAt: daysAgo(ACTIVE_WINDOW_DAYS + 1) })).toBe(false);
  });
});
