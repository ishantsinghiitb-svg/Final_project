import type { AICapability, AIResultCode } from "@/features/ai/constants";
import type { StructuredResume } from "@/features/ai/schemas";
import type { MatchLabel } from "@/features/ai/matchLabel";

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

export type AIErrorResult = {
  ok: false;
  code: Exclude<AIResultCode, "ok" | "ai_limit_reached">;
  message: string;
  credits?: AICreditStatus;
};

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

// ── Resume Match — client-facing summary (Module 6B) ──
//
// The ONLY shape the product surfaces for a match result. Deliberately
// narrower than ResumeMatchResult (features/ai/schemas) — richer per-
// dimension/confidence detail lives in `internal` and is never sent to a
// client. `matchLabel` is derived (see matchLabel.ts), never AI-generated.
export type ResumeMatchSummary = {
  id: string;
  overallScore: number;
  matchLabel: MatchLabel;
  whatMatches: string[];
  whatToImprove: string[];
  summary: string;
  createdAt: string;
};
