// ── AI Feature Constants (Module 6A) ──
//
// Single place that names every AI capability, its credit cost, and its
// prompt/analysis versions. The capability registry (../capabilities) binds
// these to a provider/model/prompt/schema. Adding a capability = add an id
// here + a registry entry — no model names hardcoded anywhere else.

export const AI_CAPABILITIES = {
  RESUME_MATCH: "resume_match",
  ATS_SCORE: "ats_score",
  RESUME_OPTIMIZER: "resume_optimizer",
  COVER_LETTER: "cover_letter",
  // ⚠ EXPERIMENTAL — NOT A SHIPPED FEATURE. See EXPERIMENTAL_AI_CAPABILITIES.
  INTERVIEW_PREP: "interview_prep",
} as const;

export type AICapability = (typeof AI_CAPABILITIES)[keyof typeof AI_CAPABILITIES];

// ── Shipped vs experimental (Module 6 freeze) ──
//
// `interview_prep` has a registry entry, a prompt template, an output schema
// and version constants — but no server function, no client method and no UI.
// It has never been reachable by a user. Because it sits in the same registry
// as the four real capabilities, it read as shipped, and every
// `Record<AICapability, …>` in the codebase had to invent a value for it (which
// is how it acquired user-facing loading copy during 6G, for a screen that
// does not exist).
//
// The split below makes the distinction explicit and enforceable rather than a
// comment: anything user-facing is typed against `ShippedAICapability`, so
// surfacing an experimental capability is a compile error, not a review catch.
//
// It is kept rather than deleted because removing it would mean editing the
// frozen prompt module. Promoting it later = move the id into
// SHIPPED_AI_CAPABILITIES and flip `experimental` in the registry.

export const SHIPPED_AI_CAPABILITIES = [
  AI_CAPABILITIES.RESUME_MATCH,
  AI_CAPABILITIES.ATS_SCORE,
  AI_CAPABILITIES.RESUME_OPTIMIZER,
  AI_CAPABILITIES.COVER_LETTER,
] as const;

/** A capability a user can actually reach. Use this in any user-facing type. */
export type ShippedAICapability = (typeof SHIPPED_AI_CAPABILITIES)[number];

/** Registered but unreachable — no server function, no client, no UI. */
export const EXPERIMENTAL_AI_CAPABILITIES = [AI_CAPABILITIES.INTERVIEW_PREP] as const;

export type ExperimentalAICapability = (typeof EXPERIMENTAL_AI_CAPABILITIES)[number];

export function isShippedCapability(id: AICapability): id is ShippedAICapability {
  return (SHIPPED_AI_CAPABILITIES as readonly AICapability[]).includes(id);
}

export const AI_CAPABILITY_LABELS: Record<AICapability, string> = {
  resume_match: "Resume Match",
  ats_score: "ATS Score",
  resume_optimizer: "Resume Optimizer",
  cover_letter: "Cover Letter",
  // Experimental — this label exists only so the registry entry can be built;
  // it is never rendered, because nothing surfaces this capability.
  interview_prep: "Interview Preparation",
};

/** Credits consumed per generation. Configurable per capability. */
export const AI_CREDIT_COSTS: Record<AICapability, number> = {
  resume_match: 1,
  ats_score: 1,
  resume_optimizer: 1,
  cover_letter: 1,
  interview_prep: 1,
};

/**
 * Analysis version — bump when the *scoring / analysis logic* changes so old
 * cached analyses are not reused. Independent of prompt_version (which tracks
 * the prompt text) so either can move without the other.
 */
export const AI_ANALYSIS_VERSIONS: Record<AICapability, string> = {
  // v3 (6B refinement): recruiter-grade scoring calibration — realistic bands,
  // transferable-skill credit, required-vs-preferred weighting.
  // v4 (6E AI-quality pass): adds the structured `improvementPlan` (organized as
  // matches / missing / improve / add / remove / rewrite / move, with concrete
  // examples). Bumped so the earlier plan-less cached analyses are not reused.
  resume_match: "4",
  // v2 (6C): first real ATS Compatibility analysis (hybrid deterministic + AI).
  // v3 (6E AI-quality pass): adds the "path to 95%" `improvementPlan` (each item
  // why/how/example/expected-benefit). Bumped so plan-less cached rows are not reused.
  ats_score: "3",
  // v2 (6E AI-quality pass): audit-first, multi-pass, role-framework-driven
  // optimization with the full suggestion-kind set. Bumped off the "1" placeholder run.
  // v3 (6E quality follow-up): mandatory exhaustive ~34-dimension audit with an
  // explicit no-implicit-limit stopping condition (find every meaningful,
  // safe improvement, not a handful). Bumped so pre-exhaustive cached runs aren't reused.
  // v4 (6E final quality pass): TWO-PASS reasoning — an exhaustive audit followed
  // by a gap-fill verification pass that finds what the first pass missed, then
  // merged/de-duplicated. Bumped so single-pass cached runs aren't reused.
  // v5 (6E Transformation Engine): Role-Intelligence-driven, category-adaptive
  // transformation pipeline — benchmark + scorecard + readiness/potential, not a
  // generic audit. New output shape; bumped so pre-transformation runs aren't reused.
  // v6 (6E Transformation Coach): adds `careerSignals` (recruiter-expectation
  // signals, truthful resume-improvement vs build-this-experience split). New
  // output shape; bumped so pre-signals cached runs aren't reused.
  // v7 (6E coach polish): career signals gain waysToBuild + exampleIsTemplate;
  // recruiter-outcome reasoning + no-fabricated-example rules. New output shape.
  resume_optimizer: "7",
  // v2 (6E Phase 2 quality pass): the draft output shape changed — a
  // free-length `paragraphs` list replaces the fixed opening/body/closing
  // template, and an `internal` block carries the model's company/candidate/
  // intersection/narrative analysis plus its pre-return checks. Bumped so
  // pre-Phase-2 cached letters (old shape, generic quality) aren't reused.
  cover_letter: "2",
  interview_prep: "1",
};

/** Prompt version — bump when the prompt template text changes. */
export const AI_PROMPT_VERSIONS: Record<AICapability, string> = {
  // v3 (6B refinement): recruiter rubric + structured-section context + richer
  // plain-language output contract.
  // v4 (6E): "what prevents an excellent match" reframe + improvement-plan contract.
  // v5 (6E follow-up): per-dimension `detail` is now a 2-3 sentence expandable
  // diagnosis (what fits / what's missing / the opportunity) for the report's
  // Fit-Breakdown drill-down. Scoring bands unchanged, so analysis_version stays.
  // v6 (6E final quality pass): each improvement-plan item carries a `priority`
  // tier for the prioritized-checklist UX.
  resume_match: "6",
  // v2 (6C): real ATS Compatibility prompt (component-evaluation contract).
  // v3 (6E): "how to reach 95%" reframe + actionable improvement-plan contract.
  // v4 (6E follow-up): per-component `detail` is now a 2-3 sentence expandable
  // diagnosis (what's good / what's missing / the opportunity) for the report's
  // Layer-3 category drill-down. Scoring logic unchanged, so analysis_version stays.
  // v5 (6E final quality pass): each improvement-plan item carries a `priority` tier.
  ats_score: "5",
  // v2 (6E): audit-first multi-pass recruiter/ATS/PM reasoning + role frameworks.
  // v3 (6E follow-up): exhaustive ~34-dimension audit checklist + no-implicit-limit framing.
  // v4 (6E final quality pass): pass-1 prompt text unchanged; the gap-fill second
  // pass is a new template (analysis_version already bumped to invalidate cache).
  // v5 (6E Transformation Engine): pass-1 system prompt rewritten into the 6-phase
  // Role-Intelligence transformation pipeline with the expanded output contract.
  // v6 (6E Transformation Coach): adds the Career Signals phase (recruiter
  // expectations beyond the resume) with the truthful resume-vs-build rule.
  // v7 (6E coach polish): waysToBuild + exampleIsTemplate; recruiter-outcome
  // `reason`; safe (never-fabricated) examples; stronger overlap-merge rule.
  resume_optimizer: "7",
  // v2 (6E Phase 2 quality pass): the foundation-phase prompt is replaced by a
  // 5-phase reasoning pipeline (understand company → understand candidate →
  // find the intersection → choose ONE narrative → write), an explicit
  // truthfulness > custom instructions > posting > résumé priority ladder,
  // banned generic openings, anti-résumé-repetition rules, and a six-point
  // self-check the model must pass before returning. Applies to generation and
  // to every refinement action.
  cover_letter: "2",
  interview_prep: "1",
};

// ── Deterministic resume parser (independent of the AI engine) ──
// Bump on any change to parsing/section-detection logic — reuse-by-hash only
// reuses a cached parse when its parser_version matches, so a version bump
// makes already-uploaded resumes self-heal on the next (re)parse instead of
// serving a stale/incorrect analysis forever.
export const RESUME_PARSER_VERSION = "1.2.0";

// ── Structured, machine-readable codes returned in AI response envelopes ──
export const AI_RESULT_CODES = {
  OK: "ok",
  LIMIT_REACHED: "ai_limit_reached",
  VALIDATION_ERROR: "validation_error",
  PROVIDER_ERROR: "provider_error",
  CONFIG_ERROR: "config_error",
  UNKNOWN_ERROR: "unknown_error",
} as const;

export type AIResultCode = (typeof AI_RESULT_CODES)[keyof typeof AI_RESULT_CODES];
