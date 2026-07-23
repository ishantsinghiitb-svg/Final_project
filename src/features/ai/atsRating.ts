// ── Deterministic ATS rating (Module 6C) ──
//
// The AI never generates this rating — like the Resume Match label (see
// matchLabel.ts) it is derived in code from the final ATS Compatibility score
// so the words and the number can never disagree, and the thresholds can be
// retuned later without touching the prompt, the schema, or any stored
// `ai_analyses` row (pure read-time computation).

export const ATS_RATINGS = {
  EXCELLENT: "Excellent",
  STRONG: "Strong",
  MODERATE: "Moderate",
  NEEDS_IMPROVEMENT: "Needs Improvement",
} as const;

export type AtsRating = (typeof ATS_RATINGS)[keyof typeof ATS_RATINGS];

export function atsRatingForScore(score: number): AtsRating {
  if (score >= 85) return ATS_RATINGS.EXCELLENT;
  if (score >= 70) return ATS_RATINGS.STRONG;
  if (score >= 50) return ATS_RATINGS.MODERATE;
  return ATS_RATINGS.NEEDS_IMPROVEMENT;
}
