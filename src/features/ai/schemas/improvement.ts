import { z } from "zod";

// ── Shared improvement-action contract (Module 6E AI-quality pass) ──
//
// The actionable "improvement plan" item that Resume Match and ATS Compatibility
// both produce. Framed as advice (not an editable diff like the optimizer's
// suggestions): each item is a concrete action with why / how / example /
// expected benefit — the same What → Why → How → Example shape the reports now
// render. Additive to both capability schemas; every field has a `.catch()`
// fallback so a malformed item degrades gracefully.

/**
 * The kind of action — organizes the plan the way the brief asks for
 * (what matches / missing / improve / add / remove / rewrite / move) plus a few
 * ATS-specific buckets. Drives only a small tag in the UI; unknown → "improve".
 */
export const IMPROVEMENT_ACTION_TYPES = [
  "match",
  "missing",
  "improve",
  "add",
  "remove",
  "rewrite",
  "move",
  "keyword",
  "formatting",
  "positioning",
  "other",
] as const;

/**
 * Priority tier — drives the "Top Priority / High-ROI / Quick Wins / Nice to
 * Have" grouping the reports render (Module 6E quality follow-up). The model
 * assigns each action a tier so the user gets a prioritized checklist, not a
 * flat list. Unknown → "high" (a safe middle default that still surfaces high).
 *   critical      — must-fix, highest impact (Top Priority / Critical Fixes)
 *   high          — high-ROI improvement
 *   quick_win     — high impact, low effort (fast to apply)
 *   nice_to_have  — polish; do last
 */
export const IMPROVEMENT_PRIORITIES = ["critical", "high", "quick_win", "nice_to_have"] as const;
export type ImprovementPriority = (typeof IMPROVEMENT_PRIORITIES)[number];

export const ImprovementActionSchema = z
  .object({
    /** The imperative "what to do" headline, e.g. "Add 'roadmap ownership' to your Product Intern bullet". */
    action: z.string().catch(""),
    type: z.enum(IMPROVEMENT_ACTION_TYPES).catch("improve"),
    /** Priority tier for the prioritized-checklist grouping. */
    priority: z.enum(IMPROVEMENT_PRIORITIES).catch("high"),
    /** WHY it matters. */
    why: z.string().catch(""),
    /** HOW to do it — a concrete, actionable instruction. */
    how: z.string().catch(""),
    /** An optional concrete example. */
    example: z.string().nullable().catch(null),
    /** The expected benefit of doing it (e.g. the expected ATS gain). */
    benefit: z.string().catch(""),
  })
  .catch({
    action: "",
    type: "improve",
    priority: "high",
    why: "",
    how: "",
    example: null,
    benefit: "",
  });

export type ImprovementAction = z.infer<typeof ImprovementActionSchema>;

/** Drop empty/placeholder items the model may emit via the `.catch()` fallback. */
export function cleanImprovementPlan(items: ImprovementAction[]): ImprovementAction[] {
  return items
    .filter((a) => a.action.trim().length > 0)
    .map((a) => ({
      action: a.action.trim(),
      type: a.type,
      priority: a.priority,
      why: a.why.trim(),
      how: a.how.trim(),
      example: a.example?.trim() ? a.example.trim() : null,
      benefit: a.benefit.trim(),
    }));
}
