// ── Deterministic performance band (Module 7C) ──
//
// Same rationale as atsRatingForScore / matchLabelForScore: the AI never
// generates the band label — it's derived in code from overallPerformance.score
// so the words and the number can never disagree, and thresholds can be
// retuned later without a prompt or schema change.

export const PERFORMANCE_BANDS = {
  EXCELLENT: "Excellent",
  STRONG: "Strong",
  SOLID: "Solid",
  DEVELOPING: "Developing",
  NEEDS_WORK: "Needs Work",
} as const;

export type PerformanceBand = (typeof PERFORMANCE_BANDS)[keyof typeof PERFORMANCE_BANDS];

export function performanceBandForScore(score: number): PerformanceBand {
  if (score >= 85) return PERFORMANCE_BANDS.EXCELLENT;
  if (score >= 70) return PERFORMANCE_BANDS.STRONG;
  if (score >= 55) return PERFORMANCE_BANDS.SOLID;
  if (score >= 35) return PERFORMANCE_BANDS.DEVELOPING;
  return PERFORMANCE_BANDS.NEEDS_WORK;
}
