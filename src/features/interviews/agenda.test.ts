import { describe, expect, it } from "vitest";
import { groupFor } from "./agenda";

// Monday, Aug 10 2026 — a clean Monday-start-of-week reference so the
// This week / Next week boundaries below are unambiguous.
const NOW = new Date(2026, 7, 10, 12, 0, 0);

describe("groupFor", () => {
  it("buckets a time before today as Past", () => {
    expect(groupFor("2026-08-09T23:00:00", NOW)).toBe("Past");
  });

  it("buckets any time on the same calendar day as Today, regardless of hour", () => {
    expect(groupFor("2026-08-10T00:30:00", NOW)).toBe("Today");
    expect(groupFor("2026-08-10T23:30:00", NOW)).toBe("Today");
  });

  it("buckets the rest of the current Mon-Sun week as This week", () => {
    expect(groupFor("2026-08-11T09:00:00", NOW)).toBe("This week");
    expect(groupFor("2026-08-16T23:59:00", NOW)).toBe("This week");
  });

  it("buckets the following Mon-Sun week as Next week", () => {
    expect(groupFor("2026-08-17T00:30:00", NOW)).toBe("Next week");
    expect(groupFor("2026-08-23T23:59:00", NOW)).toBe("Next week");
  });

  it("buckets anything beyond next week as Later", () => {
    expect(groupFor("2026-08-24T00:00:01", NOW)).toBe("Later");
    expect(groupFor("2026-12-01T00:00:00", NOW)).toBe("Later");
  });
});
