/**
 * Deterministic match label — mirrors src/features/ai/matchLabel.ts in the
 * main app. Duplicated (not imported) because the extension is a separate
 * Vite bundle with its own module graph; this is a tiny, dependency-free
 * pure function, so a verbatim copy is cheaper than a cross-bundle import.
 * If you change the thresholds in the main app, mirror the change here.
 */

export const MATCH_LABELS = {
  EXCELLENT: "Excellent Match",
  GOOD: "Good Match",
  PARTIAL: "Partial Match",
  LIMITED: "Limited Match",
} as const;

export type MatchLabel = (typeof MATCH_LABELS)[keyof typeof MATCH_LABELS];

export function matchLabelForScore(score: number): MatchLabel {
  if (score >= 90) return MATCH_LABELS.EXCELLENT;
  if (score >= 70) return MATCH_LABELS.GOOD;
  if (score >= 50) return MATCH_LABELS.PARTIAL;
  return MATCH_LABELS.LIMITED;
}
