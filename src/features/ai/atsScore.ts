// ── ATS Compatibility scoring model (Module 6C) ──
//
// The single source of truth for HOW the final ATS Compatibility score is
// composed. The AI never returns the final number — it returns per-component
// evaluations for the contextual dimensions, the deterministic parser owns the
// formatting/structure dimensions, and the APPLICATION combines them here with
// fixed weights. Keeping the weights + the math in one pure, dependency-free
// module (no zod, no React) means the extension bundle or a test can reuse it,
// and retuning weights never touches the prompt, schema, or DB.
//
// Two "sources" per component:
//   • ai            — scored by the model (keyword/skills/experience/readability)
//   • deterministic — scored by the parser (formatting/section completeness)

export type AtsComponentKey =
  | "keywordCoverage"
  | "formatting"
  | "sectionCompleteness"
  | "skillsAlignment"
  | "experienceAlignment"
  | "readability";

export type AtsComponentSource = "ai" | "deterministic";

export type AtsComponentMeta = {
  key: AtsComponentKey;
  label: string;
  /** Weight as a whole-number percentage. The six weights sum to 100. */
  weightPct: number;
  source: AtsComponentSource;
};

// Order here is the display order in the breakdown. Weights per the Module 6C
// spec: Keyword 30 · Formatting 20 · Sections 15 · Skills 15 · Experience 10 ·
// Readability 10  (= 100).
export const ATS_COMPONENTS: readonly AtsComponentMeta[] = [
  { key: "keywordCoverage", label: "Keyword Coverage", weightPct: 30, source: "ai" },
  { key: "formatting", label: "ATS Formatting", weightPct: 20, source: "deterministic" },
  {
    key: "sectionCompleteness",
    label: "Section Completeness",
    weightPct: 15,
    source: "deterministic",
  },
  { key: "skillsAlignment", label: "Skills Alignment", weightPct: 15, source: "ai" },
  { key: "experienceAlignment", label: "Experience Alignment", weightPct: 10, source: "ai" },
  { key: "readability", label: "Readability", weightPct: 10, source: "ai" },
] as const;

/** Clamp any component score into the 0–100 range the weighting assumes. */
export function clampScore(score: number): number {
  if (!Number.isFinite(score)) return 0;
  return Math.max(0, Math.min(100, Math.round(score)));
}

/**
 * Combine the six component scores (each 0–100) into the final ATS
 * Compatibility score (0–100) using the fixed weights above. Pure function —
 * the application, never the AI, owns this number.
 */
export function computeAtsOverall(scores: Record<AtsComponentKey, number>): number {
  const weighted = ATS_COMPONENTS.reduce(
    (sum, c) => sum + clampScore(scores[c.key]) * c.weightPct,
    0,
  );
  return Math.round(weighted / 100);
}
