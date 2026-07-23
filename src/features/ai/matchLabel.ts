// ── Deterministic match label (Module 6B) ──
//
// The AI never generates this label — it's derived in code from
// `overallScore` so the label and the number can never disagree, and the
// thresholds can be retuned later without touching the prompt, the schema,
// or any stored `ai_analyses` row (it's a pure read-time computation).
//
// Kept dependency-free (no zod import) so the extension — a separate Vite
// bundle that does not share this project's module graph — can copy this
// file verbatim rather than importing across the bundle boundary. If you
// change the thresholds here, mirror the change in
// extension/src/shared/matchLabel.ts.

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
