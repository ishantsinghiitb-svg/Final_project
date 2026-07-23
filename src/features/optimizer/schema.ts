import { z } from "zod";

// ── Resume Optimizer AI schema (Module 6D) ──
//
// The contract the optimizer model must satisfy. Deliberately separate from the
// placeholder `ResumeOptimizerResultSchema` in features/ai/schemas (which stays
// untouched, part of the frozen 6A engine) — 6D needs the richer current →
// suggested → reason shape the review workspace renders.
//
// Every field carries a `.catch()` fallback (same defensive pattern as Resume
// Match / ATS) so one malformed suggestion from the model degrades gracefully
// instead of failing the whole run.

export const OPTIMIZER_SECTION_KEYS = [
  "summary",
  "experience",
  "projects",
  "skills",
  "education",
  "other",
] as const;

/**
 * The kind of improvement a suggestion makes — drives the small tag on each
 * card and keeps the rationale honest (the model must pick one).
 */
export const OPTIMIZER_CHANGE_TYPES = [
  "impact",
  "action_verb",
  "quantify",
  "clarity",
  "keyword",
  "grammar",
  "tone",
  "structure",
  "concise",
] as const;

export const OptimizerSuggestionSchema = z
  .object({
    section: z.enum(OPTIMIZER_SECTION_KEYS).catch("other"),
    /** Short human label for where this applies, e.g. "Product Intern — Acme". */
    target: z.string().catch(""),
    /** The EXACT existing text being improved (quoted verbatim from the resume). */
    current: z.string().catch(""),
    /** The improved rewrite of `current`. */
    suggested: z.string().catch(""),
    /** Why this is better (recruiter-facing, one or two sentences). */
    reason: z.string().catch(""),
    changeType: z.enum(OPTIMIZER_CHANGE_TYPES).catch("clarity"),
  })
  .catch({
    section: "other",
    target: "",
    current: "",
    suggested: "",
    reason: "",
    changeType: "clarity",
  });

export const OptimizerResultSchema = z.object({
  suggestions: z.array(OptimizerSuggestionSchema).max(40).catch([]),
  /** A short, plain-language note on the overall direction of the edits. */
  summary: z.string().catch(""),
});

export type OptimizerAISuggestion = z.infer<typeof OptimizerSuggestionSchema>;
export type OptimizerAIResult = z.infer<typeof OptimizerResultSchema>;
