import { createServerFn } from "@tanstack/react-start";
import type { AICreditStatus, ResumeMatchSummary } from "@/features/ai/types";
import { requireUser } from "@/server/supabase";
import { AICreditService } from "@/server/ai/AICreditService";
import {
  getResumeMatch as fetchResumeMatch,
  analyzeResumeMatch as runResumeMatchAnalysis,
} from "@/server/ai/ResumeMatchService";

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

type CreditsInput = { accessToken: string };

export const getAICredits = createServerFn({ method: "POST" })
  .validator((data: CreditsInput) => data)
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

type GetResumeMatchInput = { accessToken: string; resumeId: string; jobId: string };

type GetResumeMatchResult =
  | {
      ok: true;
      analysis: ResumeMatchSummary | null;
      stale: boolean;
      resumeName: string | null;
      credits: AICreditStatus;
    }
  | { ok: false; code: string; message: string };

export const getResumeMatch = createServerFn({ method: "POST" })
  .validator((data: GetResumeMatchInput) => data)
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

type AnalyzeResumeMatchInput = {
  accessToken: string;
  resumeId: string;
  jobId: string;
  forceRefresh?: boolean;
};

type AnalyzeResumeMatchResult =
  | { ok: true; analysis: ResumeMatchSummary; cacheHit: boolean; credits: AICreditStatus }
  | { ok: false; code: string; message: string; credits?: AICreditStatus };

export const analyzeResumeMatch = createServerFn({ method: "POST" })
  .validator((data: AnalyzeResumeMatchInput) => data)
  .handler(async ({ data }): Promise<AnalyzeResumeMatchResult> => {
    const authed = await requireUser(data.accessToken);
    return runResumeMatchAnalysis(authed, data.resumeId, data.jobId, {
      forceRefresh: data.forceRefresh,
    });
  });
