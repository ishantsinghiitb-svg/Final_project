import type { CareerCategoryId, OptimizeSectionId } from "./constants";
import type { OPTIMIZER_CHANGE_TYPES, OPTIMIZER_SECTION_KEYS } from "./schema";

// ── Resume Optimizer client-facing types (Module 6D) ──
//
// The shapes the Optimization Studio renders. The server assigns a stable `id`
// to every suggestion (index-based) so the client can track accept/reject
// without trusting the model to emit ids.

export type OptimizerSectionKey = (typeof OPTIMIZER_SECTION_KEYS)[number];
export type OptimizerChangeType = (typeof OPTIMIZER_CHANGE_TYPES)[number];

export type OptimizationSuggestion = {
  /** Stable id assigned server-side (e.g. "s-0"). */
  id: string;
  section: OptimizerSectionKey;
  target: string;
  current: string;
  suggested: string;
  reason: string;
  changeType: OptimizerChangeType;
};

/** The result of one optimization run — the data the review workspace loads. */
export type OptimizationResult = {
  /** Durable ai_analyses id, or an ephemeral uuid if persistence failed. */
  id: string;
  category: CareerCategoryId;
  sections: OptimizeSectionId[];
  suggestions: OptimizationSuggestion[];
  summary: string;
  cacheHit: boolean;
  createdAt: string;
};

export type OptimizeResumeResult =
  | { ok: true; result: OptimizationResult; credits: import("@/features/ai/types").AICreditStatus }
  | {
      ok: false;
      code: string;
      message: string;
      credits?: import("@/features/ai/types").AICreditStatus;
    };

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
