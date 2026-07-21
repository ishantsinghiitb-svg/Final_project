import type { AICapability, AIResultCode } from "@/features/ai/constants";
import type { StructuredResume } from "@/features/ai/schemas";

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
