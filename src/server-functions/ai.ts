import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type {
  AICreditStatus,
  AIFailure,
  AtsScoreSummary,
  ResumeMatchSummary,
} from "@/features/ai/types";
import { requireUser } from "@/server/supabase";
import { AICreditService } from "@/server/ai/AICreditService";
import {
  getResumeMatch as fetchResumeMatch,
  analyzeResumeMatch as runResumeMatchAnalysis,
} from "@/server/ai/ResumeMatchService";
import {
  getAtsScore as fetchAtsScore,
  analyzeAtsScore as runAtsScoreAnalysis,
} from "@/server/ai/AtsScoreService";
import { accessToken, uuid, validate } from "./validation";

// ── AI server functions (Module 6A credits + Module 6B Resume Match) ──
//
// This file lives OUTSIDE src/server/** on purpose: the project's Vite config
// blocks any client import whose path contains a "server" directory segment
// (importProtection.client.files: "**/server/**"). createServerFn entry points
// the CLIENT calls directly must be defined here — see src/server-functions/resume.ts
// for the full rationale.
//
// getAICredits exposes the caller's credit balance so the frontend can detect
// exhaustion / show an upgrade screen later.

const CreditsSchema = z.object({ accessToken });

export const getAICredits = createServerFn({ method: "POST" })
  .validator((data: unknown) => validate(CreditsSchema, data))
  .handler(async ({ data }): Promise<AICreditStatus> => {
    const { supabase } = await requireUser(data.accessToken);
    return new AICreditService(supabase).getStatus();
  });

// ── Resume Match (Module 6B) ──
//
// Two distinct entry points, matching the product rule "viewing never
// charges, only Analyze/Re-analyze does":
//   • getResumeMatch     — read-only peek (0 credits, no provider call). Also
//     recomputes the current input hash (via the server-only ContextBuilder)
//     to report whether the stored result is stale.
//   • analyzeResumeMatch — the credit-gated generation path. The client must
//     have already shown the "this will use 1 AI Credit" confirmation before
//     calling this; the server does not re-confirm.
//
// Both strip the AI's richer `internal` reasoning before responding — the
// product only ever surfaces overallScore/matchLabel/whatMatches/
// whatToImprove/summary. `internal` still lives in the `ai_analyses.result`
// column for future capabilities to read server-side.

const GetResumeMatchSchema = z.object({ accessToken, resumeId: uuid, jobId: uuid });

type GetResumeMatchResult =
  | {
      ok: true;
      analysis: ResumeMatchSummary | null;
      stale: boolean;
      resumeName: string | null;
      credits: AICreditStatus;
    }
  | AIFailure;

export const getResumeMatch = createServerFn({ method: "POST" })
  .validator((data: unknown) => validate(GetResumeMatchSchema, data))
  .handler(async ({ data }): Promise<GetResumeMatchResult> => {
    const authed = await requireUser(data.accessToken);
    try {
      const [match, credits] = await Promise.all([
        fetchResumeMatch(authed, data.resumeId, data.jobId),
        new AICreditService(authed.supabase).getStatus(),
      ]);
      return { ok: true, ...match, credits };
    } catch (err) {
      return {
        ok: false,
        code: "error",
        message: err instanceof Error ? err.message : "Failed to load your resume match.",
      };
    }
  });

const AnalyzeResumeMatchSchema = z.object({
  accessToken,
  resumeId: uuid,
  jobId: uuid,
  forceRefresh: z.boolean().optional(),
});

type AnalyzeResumeMatchResult =
  | { ok: true; analysis: ResumeMatchSummary; cacheHit: boolean; credits: AICreditStatus }
  | AIFailure;

export const analyzeResumeMatch = createServerFn({ method: "POST" })
  .validator((data: unknown) => validate(AnalyzeResumeMatchSchema, data))
  .handler(async ({ data }): Promise<AnalyzeResumeMatchResult> => {
    const authed = await requireUser(data.accessToken);
    return runResumeMatchAnalysis(authed, data.resumeId, data.jobId, {
      forceRefresh: data.forceRefresh,
    });
  });

// ── ATS Compatibility (Module 6C) ──
//
// Same two-entry-point shape as Resume Match ("viewing never charges, only
// Analyze/Re-analyze does"):
//   • getAtsScore     — read-only peek (0 credits, no provider call); also
//     recomputes the current input hash to report staleness.
//   • analyzeAtsScore — the credit-gated generation path (hybrid: deterministic
//     parser checks + AI component evaluations, combined server-side). The
//     client must show the "this will use 1 AI Credit" confirmation first.

const GetAtsScoreSchema = z.object({ accessToken, resumeId: uuid, jobId: uuid });

type GetAtsScoreResult =
  | {
      ok: true;
      analysis: AtsScoreSummary | null;
      stale: boolean;
      resumeName: string | null;
      credits: AICreditStatus;
    }
  | AIFailure;

export const getAtsScore = createServerFn({ method: "POST" })
  .validator((data: unknown) => validate(GetAtsScoreSchema, data))
  .handler(async ({ data }): Promise<GetAtsScoreResult> => {
    const authed = await requireUser(data.accessToken);
    try {
      const [ats, credits] = await Promise.all([
        fetchAtsScore(authed, data.resumeId, data.jobId),
        new AICreditService(authed.supabase).getStatus(),
      ]);
      return { ok: true, ...ats, credits };
    } catch (err) {
      return {
        ok: false,
        code: "error",
        message: err instanceof Error ? err.message : "Failed to load your ATS analysis.",
      };
    }
  });

const AnalyzeAtsScoreSchema = z.object({
  accessToken,
  resumeId: uuid,
  jobId: uuid,
  forceRefresh: z.boolean().optional(),
});

type AnalyzeAtsScoreResult =
  { ok: true; analysis: AtsScoreSummary; cacheHit: boolean; credits: AICreditStatus } | AIFailure;

export const analyzeAtsScore = createServerFn({ method: "POST" })
  .validator((data: unknown) => validate(AnalyzeAtsScoreSchema, data))
  .handler(async ({ data }): Promise<AnalyzeAtsScoreResult> => {
    const authed = await requireUser(data.accessToken);
    return runAtsScoreAnalysis(authed, data.resumeId, data.jobId, {
      forceRefresh: data.forceRefresh,
    });
  });
