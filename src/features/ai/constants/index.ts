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
  INTERVIEW_PREP: "interview_prep",
} as const;

export type AICapability = (typeof AI_CAPABILITIES)[keyof typeof AI_CAPABILITIES];

export const AI_CAPABILITY_LABELS: Record<AICapability, string> = {
  resume_match: "Resume Match",
  ats_score: "ATS Score",
  resume_optimizer: "Resume Optimizer",
  cover_letter: "Cover Letter",
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
  resume_match: "1",
  ats_score: "1",
  resume_optimizer: "1",
  cover_letter: "1",
  interview_prep: "1",
};

/** Prompt version — bump when the prompt template text changes. */
export const AI_PROMPT_VERSIONS: Record<AICapability, string> = {
  resume_match: "1",
  ats_score: "1",
  resume_optimizer: "1",
  cover_letter: "1",
  interview_prep: "1",
};

// ── Deterministic resume parser (independent of the AI engine) ──
// Bump on any change to parsing/section-detection logic — reuse-by-hash only
// reuses a cached parse when its parser_version matches, so a version bump
// makes already-uploaded resumes self-heal on the next (re)parse instead of
// serving a stale/incorrect analysis forever.
export const RESUME_PARSER_VERSION = "1.1.0";

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
