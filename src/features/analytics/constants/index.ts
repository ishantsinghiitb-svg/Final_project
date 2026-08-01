import type { AnalyticsRangePreset, FunnelStageKey, GoalKey } from "@/features/analytics/types";

// ── Time range ────────────────────────────────────────────────────────────

export const RANGE_PRESET_OPTIONS: AnalyticsRangePreset[] = [
  "last_7_days",
  "last_30_days",
  "last_90_days",
  "all_time",
];

export const RANGE_PRESET_LABELS: Record<AnalyticsRangePreset, string> = {
  last_7_days: "Last 7 Days",
  last_30_days: "Last 30 Days",
  last_90_days: "Last 90 Days",
  all_time: "All Time",
};

export const DEFAULT_RANGE: AnalyticsRangePreset = "last_30_days";

// ── Funnel ────────────────────────────────────────────────────────────────
// Stage order is computed at runtime (Applications, optionally Assessments,
// Interviews, Offers) — see computeFunnel in utils.ts. Assessments only
// appears when this user's pipeline actually uses that stage; forcing an
// always-empty stage was the exact thing user feedback flagged. Stops at
// Offers — Accepted isn't useful for this dashboard's funnel view.

export const FUNNEL_STAGE_LABELS: Record<FunnelStageKey, string> = {
  applications: "Applications",
  assessments: "Assessments",
  interviews: "Interviews",
  offers: "Offers",
};

// ── Resume performance ───────────────────────────────────────────────────

/**
 * Minimum applications a resume needs before its interview/offer rate is
 * treated as meaningful. Below this, a resume shows "Used in N applications"
 * and progress toward this floor instead of a rate — never a misleading
 * percentage off a handful of data points.
 */
export const RESUME_MIN_SAMPLE = 10;

// ── Job Search Health ────────────────────────────────────────────────────

/** Below this many applications in range, Health shows "Just getting started" rather than judging a rate. */
export const HEALTH_MIN_SAMPLE = 5;

/**
 * Internal thresholds that decide the Health card's tone — not shown to the
 * user as a benchmark/comparison, just the boundary between "Strong" /
 * "On Track" / "Needs Attention" for whichever of this account's own three
 * stage-conversion rates (Applied→progressed, progressed→interview,
 * interview→offer) is currently weakest.
 */
export const HEALTH_STAGE_THRESHOLDS = { good: 0.3, warning: 0.1 } as const;

// ── Focus areas ───────────────────────────────────────────────────────────

/** An application still sitting in "Applied" longer than this, with no further activity, is surfaced as stale. */
export const STUCK_APPLIED_DAYS = 10;

/** Applications linked to a resume at or below this count (but above 0) get a "only N linked" nudge — 0 is handled by Resume Performance's own empty state instead, so the two never say the same thing. */
export const LOW_RESUME_LINK_THRESHOLD = 2;

/** Cards shown at once — genuine rule-based insights first, then static guidance fills any remaining slots so the panel never looks sparse. */
export const MAX_FOCUS_AREAS = 5;

// ── Goals ─────────────────────────────────────────────────────────────────

export const GOAL_ORDER: GoalKey[] = ["applications", "interviews", "offers"];

export const GOAL_LABELS: Record<GoalKey, string> = {
  applications: "Applications",
  interviews: "Interviews",
  offers: "Offers",
};

/** Suggested defaults, used whenever the profile's goal column is null. */
export const DEFAULT_GOALS: Record<GoalKey, number> = {
  applications: 20,
  interviews: 5,
  offers: 1,
};
