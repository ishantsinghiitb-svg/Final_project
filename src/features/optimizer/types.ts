import type { CareerCategoryId, OptimizeSectionId } from "./constants";
import type {
  OPTIMIZER_CHANGE_TYPES,
  OPTIMIZER_SECTION_KEYS,
  OPTIMIZER_SEVERITIES,
  OPTIMIZER_SUGGESTION_KINDS,
  OptimizerScorecardEntry,
  CareerSignal,
} from "./schema";

export type { OptimizerScorecardEntry, CareerSignal } from "./schema";

// ── Resume Optimizer client-facing types (Module 6D) ──
//
// The shapes the Optimization Studio renders. The server assigns a stable `id`
// to every suggestion (index-based) so the client can track accept/reject
// without trusting the model to emit ids.

export type OptimizerSectionKey = (typeof OPTIMIZER_SECTION_KEYS)[number];
export type OptimizerChangeType = (typeof OPTIMIZER_CHANGE_TYPES)[number];
export type OptimizerSuggestionKind = (typeof OPTIMIZER_SUGGESTION_KINDS)[number];
export type OptimizerSeverity = (typeof OPTIMIZER_SEVERITIES)[number];

export type OptimizationSuggestion = {
  /** Stable id assigned server-side (e.g. "s-0"). */
  id: string;
  kind: OptimizerSuggestionKind;
  section: OptimizerSectionKey;
  target: string;
  /** The imperative "what to do" headline. */
  action: string;
  current: string;
  suggested: string;
  reason: string;
  /** How to make the change (actionable instruction). */
  how: string;
  benefit: string;
  example: string | null;
  changeType: OptimizerChangeType;
  severity: OptimizerSeverity;
  moveSection: string | null;
  beforeSection: string | null;
  removeSection: string | null;
  renameTo: string | null;
};

/** The result of one optimization run — the data the review workspace loads. */
export type OptimizationResult = {
  /** Durable ai_analyses id, or an ephemeral uuid if persistence failed. */
  id: string;
  category: CareerCategoryId;
  /** Resolved display label — the built-in category label, or the user's custom text when category is "other". */
  categoryLabel: string;
  sections: OptimizeSectionId[];
  // ── Transformation Engine (Module 6E) — the category-adaptive roadmap header ──
  /** What a top-1% resume in this category looks like (the benchmark). */
  benchmark: string;
  /** How ready the resume is today for a strong role in this category (0-100). */
  readiness: number;
  /** The realistic ceiling after truthful changes (0-100). */
  transformationPotential: number;
  /** The category-adaptive rubric, scored. */
  scorecard: OptimizerScorecardEntry[];
  /** Category-specific strengths. */
  categoryStrengths: string[];
  /** Category-specific gaps. */
  categoryGaps: string[];
  /** Recruiter-expected signals for this category (question 2 — educate, never fabricate). */
  careerSignals: CareerSignal[];
  /** The recruiter-style audit verdict shown above the suggestions. */
  auditSummary: string;
  suggestions: OptimizationSuggestion[];
  summary: string;
  cacheHit: boolean;
  createdAt: string;
};

export type OptimizeResumeResult =
  | { ok: true; result: OptimizationResult; credits: import("@/features/ai/types").AICreditStatus }
  | import("@/features/ai/types").AIFailure;

/** A saved resume version produced by the studio (row in resume_versions). */
export type SavedResumeVersion = {
  id: string;
  resumeId: string;
  versionNumber: number;
  name: string;
  createdAt: string;
};

/** The decision a user has made about a single suggestion in the review UI. */
export type SuggestionDecision = "pending" | "accepted" | "rejected";

// ── Durable optimizer change history (Module 6E) ──
//
// Persisted verbatim into `resume_versions.optimization` so a user can reopen
// an optimized version months later and see exactly what the AI proposed and
// what they decided — accepted AND rejected, with the original text, the
// suggested text, the reason, the type, and the benefit.
export type OptimizationChange = {
  decision: "accepted" | "rejected";
  kind: OptimizerSuggestionKind;
  section: OptimizerSectionKey;
  target: string;
  action: string;
  current: string;
  suggested: string;
  reason: string;
  how: string;
  benefit: string;
  example: string | null;
  changeType: OptimizerChangeType;
};

export type OptimizationRecord = {
  category: CareerCategoryId;
  categoryLabel: string;
  /** When the version was saved. */
  savedAt: string;
  auditSummary: string;
  changes: OptimizationChange[];
};
