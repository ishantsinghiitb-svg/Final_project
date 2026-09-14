import { describe, expect, it } from "vitest";
import { parseRelativePostedDate } from "./postedDate";

const NOW = new Date("2026-09-13T12:00:00.000Z");
const MS_PER_DAY = 24 * 60 * 60 * 1000;

describe("parseRelativePostedDate", () => {
  it("resolves 'just now' / 'today' / a few hours/minutes ago to the current instant", () => {
    expect(parseRelativePostedDate("just now", NOW)).toBe(NOW.toISOString());
    expect(parseRelativePostedDate("Today", NOW)).toBe(NOW.toISOString());
    expect(parseRelativePostedDate("a few hours ago", NOW)).toBe(NOW.toISOString());
    expect(parseRelativePostedDate("a few minutes ago", NOW)).toBe(NOW.toISOString());
  });

  it("resolves 'yesterday' to exactly one day back", () => {
    expect(parseRelativePostedDate("Yesterday", NOW)).toBe(
      new Date(NOW.getTime() - MS_PER_DAY).toISOString(),
    );
  });

  it("resolves 'N hours ago' — the exact LinkedIn top-card shape", () => {
    expect(parseRelativePostedDate("13 hours ago", NOW)).toBe(
      new Date(NOW.getTime() - 13 * 3_600_000).toISOString(),
    );
  });

  it("resolves 'N days ago' / 'N weeks ago' / 'N months ago'", () => {
    expect(parseRelativePostedDate("3 days ago", NOW)).toBe(
      new Date(NOW.getTime() - 3 * MS_PER_DAY).toISOString(),
    );
    expect(parseRelativePostedDate("2 weeks ago", NOW)).toBe(
      new Date(NOW.getTime() - 14 * MS_PER_DAY).toISOString(),
    );
    expect(parseRelativePostedDate("1 month ago", NOW)).toBe(
      new Date(NOW.getTime() - 30 * MS_PER_DAY).toISOString(),
    );
  });

  it("treats 'a/an' as one unit", () => {
    expect(parseRelativePostedDate("an hour ago", NOW)).toBe(
      new Date(NOW.getTime() - 3_600_000).toISOString(),
    );
    expect(parseRelativePostedDate("a day ago", NOW)).toBe(
      new Date(NOW.getTime() - MS_PER_DAY).toISOString(),
    );
  });

  it("is case-insensitive", () => {
    expect(parseRelativePostedDate("13 HOURS AGO", NOW)).toBe(
      parseRelativePostedDate("13 hours ago", NOW),
    );
  });

  it("returns null for blank, missing, or unrecognized text", () => {
    expect(parseRelativePostedDate(null)).toBeNull();
    expect(parseRelativePostedDate(undefined)).toBeNull();
    expect(parseRelativePostedDate("")).toBeNull();
    expect(parseRelativePostedDate("   ")).toBeNull();
    expect(parseRelativePostedDate("Actively hiring")).toBeNull();
    expect(parseRelativePostedDate("Reposted")).toBeNull();
  });

  it("never fabricates a date from a negative or non-finite amount", () => {
    // Not a realistic input, but the amount-parsing arithmetic must not
    // silently produce a future date from it.
    expect(parseRelativePostedDate("-3 days ago", NOW)).not.toBeNull();
    // "-3 days ago" still matches "3 days ago" inside it via the unanchored
    // regex — the value returned must be 3 days in the PAST, never negative.
    const result = parseRelativePostedDate("-3 days ago", NOW);
    expect(new Date(result as string).getTime()).toBeLessThanOrEqual(NOW.getTime());
  });
});
