import { startOfDay, startOfYear, subDays } from "date-fns";
import type { AppliedDatePreset } from "./types";

// Role matching now lives in features/jobs/utils.ts#roleMatchesAnyCategory —
// shared with the Global Jobs Role filter. Import it from there.

// ── Applied-date presets ─────────────────────────────────────────────────────

/**
 * Converts a preset into an { after, before } ISO range. "custom" is handled
 * by the caller (the user supplies after/before directly) and always returns
 * an empty range here.
 */
export function dateRangeForPreset(preset: AppliedDatePreset): {
  after?: string;
  before?: string;
} {
  const now = new Date();
  switch (preset) {
    case "today":
      return { after: startOfDay(now).toISOString() };
    case "last_7_days":
      return { after: subDays(now, 7).toISOString() };
    case "last_30_days":
      return { after: subDays(now, 30).toISOString() };
    case "last_90_days":
      return { after: subDays(now, 90).toISOString() };
    case "this_year":
      return { after: startOfYear(now).toISOString() };
    case "custom":
      return {};
  }
}
