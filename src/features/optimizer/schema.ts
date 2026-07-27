import { z } from "zod";

// ── Resume Optimizer AI schema (Module 6D; expanded in the 6E AI-quality pass) ──
//
// The contract the optimizer model must satisfy. Deliberately separate from the
// placeholder `ResumeOptimizerResultSchema` in features/ai/schemas — the studio
// needs the richer action → current → suggested → why/how/example shape the
// review workspace renders, plus the full set of structural edit kinds.
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
 * What KIND of edit a suggestion makes. The 6E pass covers the full range a
 * real resume reviewer uses — not just rewrites. Composition (compose.ts) knows
 * how to APPLY each; any kind whose target text/section can't be located is
 * still shown as advice, just not auto-applied to the downloadable resume.
 *
 *   rewrite/replace           — swap a verbatim span for improved text
 *   compress/expand           — shorten / lengthen a span (applied like rewrite)
 *   merge/split/highlight/restructure — structural text edits (applied like rewrite when a span is given)
 *   add                       — insert new content into an EXISTING section
 *   remove                    — delete a span, or a whole section (removeSection)
 *   move/reorder/promote/demote — move a whole section (promote=up, demote=down)
 *   rename                    — rename a section heading (renameTo)
 */
export const OPTIMIZER_SUGGESTION_KINDS = [
  "rewrite",
  "replace",
  "add",
  "remove",
  "merge",
  "split",
  "move",
  "reorder",
  "rename",
  "highlight",
  "compress",
  "expand",
  "promote",
  "demote",
  "restructure",
] as const;

/**
 * The theme of an improvement — drives the small tag on each card. Expanded in
 * 6E to cover positioning/narrative/product-thinking themes, not just wording.
 * Unknown values fall back to a generic label in the UI.
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
  "readability",
  "summary_quality",
  "headline",
  "positioning",
  "narrative",
  "product_thinking",
  "customer_focus",
  "ownership",
  "metrics",
  "business_impact",
  "technical_depth",
  "leadership",
  "collaboration",
  "prioritization",
  "experimentation",
  "project_description",
  "skills_organization",
  "section_order",
  "formatting",
  "ats_friendliness",
  "duplicate_removal",
  "relevance",
  "missing_info",
] as const;

/** Internal impact ordering only — the UI no longer surfaces severity tiers (6E). */
export const OPTIMIZER_SEVERITIES = ["critical", "high", "medium", "low"] as const;

export const OptimizerSuggestionSchema = z
  .object({
    kind: z.enum(OPTIMIZER_SUGGESTION_KINDS).catch("rewrite"),
    section: z.enum(OPTIMIZER_SECTION_KEYS).catch("other"),
    /** Short human label for where this applies, e.g. "Product Intern — Acme". */
    target: z.string().catch(""),
    /** The imperative "what to do" headline, e.g. "Add product metrics to your internship bullets". */
    action: z.string().catch(""),
    /**
     * The EXACT existing text being changed, quoted verbatim from the resume
     * (rewrite/replace/remove/compress/expand/merge/split/highlight). May be
     * empty for `add` (nothing existed) or section-level move/rename/remove.
     */
    current: z.string().catch(""),
    /** The improved text: the rewrite, the new content to add, or the improved-order description. */
    suggested: z.string().catch(""),
    /** WHY this is better (recruiter-facing, one or two sentences). */
    reason: z.string().catch(""),
    /** HOW to make the change — a concrete, actionable instruction. */
    how: z.string().catch(""),
    /** The concrete expected benefit — one short phrase. */
    benefit: z.string().catch(""),
    /** An optional concrete example illustrating the point. */
    example: z.string().nullable().catch(null),
    changeType: z.enum(OPTIMIZER_CHANGE_TYPES).catch("clarity"),
    severity: z.enum(OPTIMIZER_SEVERITIES).catch("medium"),
    /** move/reorder/promote/demote: the exact section heading to move. */
    moveSection: z.string().nullable().catch(null),
    /** move/reorder: move `moveSection` before this heading; null = to the top. */
    beforeSection: z.string().nullable().catch(null),
    /** remove (whole section): the heading of the section to remove. */
    removeSection: z.string().nullable().catch(null),
    /** rename: the section heading to rename (in `target`/`current`) → this new heading. */
    renameTo: z.string().nullable().catch(null),
  })
  .catch({
    kind: "rewrite",
    section: "other",
    target: "",
    action: "",
    current: "",
    suggested: "",
    reason: "",
    how: "",
    benefit: "",
    example: null,
    changeType: "clarity",
    severity: "medium",
    moveSection: null,
    beforeSection: null,
    removeSection: null,
    renameTo: null,
  });

/**
 * One row of the CATEGORY SCORECARD (Module 6E transformation engine). The
 * dimensions are NOT fixed — the model derives them per career category via the
 * Role Intelligence Layer, so a Product Management scorecard and a Finance
 * scorecard measure different things. `status` drives the bar tone; `insight`
 * is a one-line "where you are + the biggest lever" for that dimension.
 */
export const OptimizerScorecardEntrySchema = z
  .object({
    dimension: z.string().catch(""),
    score: z.number().int().min(0).max(100).catch(0),
    status: z.enum(["strong", "adequate", "weak"]).catch("adequate"),
    insight: z.string().catch(""),
  })
  .catch({ dimension: "", score: 0, status: "adequate", insight: "" });

/**
 * One CAREER SIGNAL (Module 6E · Transformation Coach). Answers the SECOND
 * product question — "what does a top resume in this category usually contain
 * that mine doesn't demonstrate?" — WITHOUT ever encouraging fabrication.
 *
 * The truthfulness switch is `developmental`:
 *   • developmental = false → the candidate genuinely HAS this (presence yes/
 *     partial); the recommendation is where/how to SURFACE it on the resume
 *     (a resume improvement).
 *   • developmental = true  → the résumé shows no real evidence; the
 *     recommendation is to BUILD this experience (future internships/projects),
 *     NOT to add it to the résumé (a career-development opportunity).
 */
export const CareerSignalSchema = z
  .object({
    /** The recruiter signal, e.g. "Product Discovery" or "Roadmap Ownership". */
    signal: z.string().catch(""),
    /** Why recruiters in this category value this signal. */
    importance: z.string().catch(""),
    /** How clearly the résumé demonstrates it today. */
    presence: z.enum(["yes", "partial", "no"]).catch("no"),
    /**
     * TRUE = the résumé shows no genuine evidence → recommend BUILDING the
     * experience, never adding it. FALSE = they have it → recommend surfacing it.
     */
    developmental: z.boolean().catch(false),
    /** If they have it: where/how to include it. If not: how to build it. Never "fabricate". */
    recommendation: z.string().catch(""),
    /**
     * For developmental signals only — concrete, practical ways to GAIN this
     * experience (internships, side projects, clubs, certifications, volunteering,
     * case studies, competitions). Empty for signals the candidate already has.
     */
    waysToBuild: z.array(z.string()).catch([]),
    /** An optional illustration. NEVER an invented claim about the candidate. */
    example: z.string().nullable().catch(null),
    /**
     * TRUE when `example` is a generic illustrative TEMPLATE (bracketed
     * placeholders, not the candidate's real facts) → the UI labels it as such.
     * FALSE when it is derived from the candidate's actual résumé content.
     */
    exampleIsTemplate: z.boolean().catch(false),
  })
  .catch({
    signal: "",
    importance: "",
    presence: "no",
    developmental: false,
    recommendation: "",
    waysToBuild: [],
    example: null,
    exampleIsTemplate: false,
  });

export const OptimizerResultSchema = z.object({
  // ── Role Intelligence / transformation framing (Module 6E transformation engine) ──
  /** What a top-1% resume in THIS category looks like (the benchmark, 1-2 sentences). */
  benchmark: z.string().catch(""),
  /** How ready the resume is TODAY for a strong role in this category (0-100). */
  readiness: z.number().int().min(0).max(100).catch(0),
  /** The realistic ceiling this resume could reach with truthful changes (0-100). */
  transformationPotential: z.number().int().min(0).max(100).catch(0),
  /** The category-adaptive rubric, scored — different dimensions per category. */
  scorecard: z.array(OptimizerScorecardEntrySchema).catch([]),
  /** Category-specific things this resume already does well. */
  categoryStrengths: z.array(z.string()).catch([]),
  /** Category-specific gaps holding it back from a top resume. */
  categoryGaps: z.array(z.string()).catch([]),
  /**
   * CAREER SIGNALS — recruiter-expected signals for this category and whether the
   * résumé demonstrates them. Educates the user (question 2); never fabricates.
   */
  careerSignals: z.array(CareerSignalSchema).catch([]),
  /** A short recruiter-style overview of the resume's biggest opportunities (the audit verdict). */
  auditSummary: z.string().catch(""),
  // No `.max()` here on purpose: an exhaustive audit (Module 6E follow-up) plus a
  // second gap-fill pass can legitimately produce many items, and `.max(N).catch([])`
  // would EMPTY the entire array on overflow (too many → zero). The service caps the
  // merged, de-duplicated list to a generous ceiling instead.
  suggestions: z.array(OptimizerSuggestionSchema).catch([]),
  /** A short, plain-language note on the overall direction of the edits. */
  summary: z.string().catch(""),
});

export type OptimizerScorecardEntry = z.infer<typeof OptimizerScorecardEntrySchema>;
export type CareerSignal = z.infer<typeof CareerSignalSchema>;
export type OptimizerAISuggestion = z.infer<typeof OptimizerSuggestionSchema>;
export type OptimizerAIResult = z.infer<typeof OptimizerResultSchema>;
