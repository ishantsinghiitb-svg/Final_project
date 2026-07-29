import type { AICapability, AIResultCode } from "@/features/ai/constants";
import type { StructuredResume, ImprovementAction } from "@/features/ai/schemas";
import type { MatchLabel } from "@/features/ai/matchLabel";
import type { AtsRating } from "@/features/ai/atsRating";
import type { AtsComponentKey, AtsComponentSource } from "@/features/ai/atsScore";

// ── AI credit status (paywall-ready) ──
//
// Returned by getAICredits and embedded in every AI response envelope so the
// frontend can detect exhaustion and (later) show an upgrade screen. No UI in
// 6A — only the backend + this response contract.
export type AICreditStatus = {
  plan: string;
  creditsTotal: number;
  creditsUsed: number;
  creditsRemaining: number;
  featureLocked: boolean; // creditsRemaining <= 0
  upgradeRequired: boolean; // MVP: same as featureLocked
};

// ── AI response envelope ──
//
// The AI Service NEVER throws for the exhaustion case — it returns a structured
// AILimitReached. Errors are also structured. Discriminate on `ok` + `code`.
export type AILimitReached = {
  ok: false;
  code: "ai_limit_reached";
  featureLocked: true;
  upgradeRequired: true;
  message: string;
  credits: AICreditStatus;
};

/**
 * The ONE failure envelope shape for every AI path (Module 6 freeze).
 *
 * Before this, each service, server function, hook and feature module
 * re-declared this object literal by hand — eight near-copies across nineteen
 * files. Adding `creditsRefunded` in 6G meant editing every one of them, and a
 * copy that had been missed would have silently dropped the field on the wire.
 *
 * Every field past `code` is optional, so a read-only path that has no credit
 * context to report simply omits them and still shares the type.
 *
 * `TCode` is the escape hatch for the engine itself, which knows its codes
 * exactly; the outer layers widen to `string` because they forward codes from
 * several sources (the engine, resume/job guards, cover-letter session guards).
 */
export type AIFailure<TCode extends string = string> = {
  ok: false;
  code: TCode;
  message: string;
  credits?: AICreditStatus;
  /**
   * True when this run is known to have cost the user nothing — either no
   * credit was ever charged, or the charge was refunded successfully.
   * `undefined` means the engine could not confirm either way (a refund that
   * exhausted its retries).
   *
   * Purely informational, added in Module 6G: the UI may only promise "no
   * credit was used" when this is `true`, so the reassurance in an error
   * message is never a guess. Nothing in the credits math reads it.
   */
  creditsRefunded?: boolean;
};

/** The engine's own failure, with its result codes narrowed to the known set. */
export type AIErrorResult = AIFailure<Exclude<AIResultCode, "ok" | "ai_limit_reached">>;

export type AISuccessMeta = {
  capability: AICapability;
  provider: string;
  model: string;
  cacheHit: boolean;
  promptVersion: string;
  analysisVersion: string;
  credits: AICreditStatus;
  // ── Module 6B additions ──
  // Exposed so callers that persist a durable result (e.g. ai_analyses) can
  // record the exact cache key + snapshot refs without re-building AIContext
  // (which would mean a second resume/job fetch for every analysis).
  inputHash: string;
  jobHash: string | null;
  resumeFileHash: string | null;
};

export type AISuccessResult<T> = {
  ok: true;
  code: "ok";
  data: T;
  meta: AISuccessMeta;
};

export type AIResult<T> = AISuccessResult<T> | AILimitReached | AIErrorResult;

export function isAILimitReached<T>(r: AIResult<T>): r is AILimitReached {
  return r.ok === false && r.code === "ai_limit_reached";
}

/**
 * Whether a failed run is KNOWN to have cost the user nothing, for a service
 * forwarding an engine failure into its own envelope (Module 6G).
 *
 * `undefined` for a success (nothing to say) and for a charge whose refund
 * exhausted its retries. A limit-reached result is always `true`: it fails at
 * the credit gate, before anything could be charged.
 */
export function creditsRefundedFor<T>(r: AIResult<T>): boolean | undefined {
  if (r.ok) return undefined;
  return r.code === "ai_limit_reached" ? true : r.creditsRefunded;
}

// ── AI Context primitives (built by ContextBuilder, reused by every capability) ──
//
// Match / ATS / Cover Letter / Interview Prep all compose the SAME primitives,
// which is what makes context reuse + caching cheap.
export type ResumeContext = {
  resumeId: string;
  fileHash: string | null;
  parserVersion: string;
  structured: StructuredResume;
  rawText: string;
};

export type JobContext = {
  jobId: string | null;
  jobHash: string; // deterministic hash of the snapshot below
  snapshot: JobSnapshot; // captured at analysis time — edits don't rewrite history
};

export type JobSnapshot = {
  role: string | null;
  companyName: string | null;
  location: string | null;
  employmentType: string | null;
  workMode: string | null;
  experienceLevel: string | null;
  description: string | null;
  requirements: string[];
  responsibilities: string[];
  skills: string[];
};

export type UserContext = {
  userId: string;
  targetRole: string | null;
  location: string | null;
};

export type AIContext = {
  resume?: ResumeContext;
  job?: JobContext;
  user?: UserContext;
};

// ── Resume Match — client-facing summary (Module 6B, extended in 6C polish) ──
//
// The shape the DASHBOARD surfaces for a match result (the extension defines
// its own, separate `ResumeMatchSummary` and never imports this one — see
// extension/src/shared/messaging/types.ts). `matchLabel` is derived (see
// matchLabel.ts), never AI-generated.
//
// `dimensions`/`missingSkills`/`missingKeywords`/`matchedKeywords`/
// `recommendation` were added for the Module 6C polish pass's full "View Full
// Report" dialog. They surface data the AI already computes and that was
// already being stored in `ai_analyses.result.internal` (see
// ResumeMatchInternalSchema) — no new AI call, no scoring change, no prompt
// change. Only the dashboard's read-side mapping now forwards fields it
// previously stopped at `internal`.
export type ResumeMatchDimension = { score: number; detail: string };

export type ResumeMatchMissingSkill = {
  skill: string;
  importance: "required" | "preferred";
  evidence: string | null;
};

export type ResumeMatchRecommendation = {
  shouldApply: "apply" | "stretch" | "improve_first" | "skip";
  rationale: string;
};

export type ResumeMatchSummary = {
  id: string;
  overallScore: number;
  matchLabel: MatchLabel;
  whatMatches: string[];
  whatToImprove: string[];
  summary: string;
  createdAt: string;
  dimensions: {
    experience: ResumeMatchDimension;
    education: ResumeMatchDimension;
    domain: ResumeMatchDimension;
  };
  missingSkills: ResumeMatchMissingSkill[];
  missingKeywords: string[];
  matchedKeywords: string[];
  recommendation: ResumeMatchRecommendation;
  // ── Module 6E: organized, actionable improvement plan (may be empty for legacy analyses). ──
  improvementPlan: ImprovementAction[];
};

// ── ATS Compatibility — client-facing summary (Module 6C) ──
//
// The ONLY shape the product surfaces for an ATS analysis. It is the combined
// output of the deterministic parser (formatting + section completeness) and
// the AI (keyword/skills/experience/readability + qualitative content), already
// merged and weighted by the application (see server/ai/AtsScoreService). Like
// Resume Match, `rating` is derived from the score in code (see atsRating.ts),
// never AI-generated, and the AI's richer internal reasoning is never forwarded.
export type AtsBreakdownItem = {
  key: AtsComponentKey;
  label: string;
  /** Whole-number percentage weight of this component in the final score. */
  weightPct: number;
  source: AtsComponentSource; // "ai" | "deterministic"
  score: number; // 0–100
  detail: string;
};

export type AtsScoreSummary = {
  id: string;
  overallScore: number; // 0–100 final weighted ATS Compatibility score
  rating: AtsRating;
  breakdown: AtsBreakdownItem[]; // the six weighted components, in display order
  matchedKeywords: string[];
  missingKeywords: string[];
  criticalMissingKeywords: string[];
  strengths: string[];
  atsRisks: string[]; // deterministic formatting risks + AI content risks, merged
  recommendations: string[];
  // ── Module 6E: "path to 95%" improvement plan (may be empty for legacy analyses). ──
  improvementPlan: ImprovementAction[];
  summary: string;
  createdAt: string;
};
