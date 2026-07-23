import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { aiClient } from "@/services/ai/AIClient";
import { AI_CAPABILITIES } from "@/features/ai/constants";
import { AnalysisRepository } from "@/repositories/AnalysisRepository";

const analysisRepo = new AnalysisRepository();

export const aiKeys = {
  all: ["ai"] as const,
  credits: (userId: string) => [...aiKeys.all, "credits", userId] as const,
  resumeMatch: (resumeId: string, jobId: string) =>
    [...aiKeys.all, "resume-match", resumeId, jobId] as const,
  resumeMatchHistory: (resumeId: string, jobId: string) =>
    [...aiKeys.all, "resume-match-history", resumeId, jobId] as const,
  atsScore: (resumeId: string, jobId: string) =>
    [...aiKeys.all, "ats-score", resumeId, jobId] as const,
  atsScoreHistory: (resumeId: string, jobId: string) =>
    [...aiKeys.all, "ats-score-history", resumeId, jobId] as const,
};

/**
 * Current AI credit balance (paywall-ready). The frontend can read
 * `featureLocked` / `creditsRemaining` / `upgradeRequired` to gate AI features
 * and show an upgrade screen.
 */
export function useAICredits() {
  const { user } = useAuth();
  return useQuery({
    queryKey: aiKeys.credits(user?.id ?? ""),
    queryFn: () => aiClient.getCredits(),
    enabled: Boolean(user),
    staleTime: 30 * 1_000,
  });
}

/**
 * Read-only peek at the latest Resume Match for (resumeId, jobId) — never
 * consumes a credit. Returns `null` analysis when nothing has been analyzed
 * yet, and `stale: true` when the resume or job has changed since the last
 * analysis (see ResumeMatchService.getResumeMatch).
 *
 * `resumeReady` defaults to true so existing callers that don't track resume
 * parse status are unaffected; pass `resume.parse_status === "ready"` to skip
 * the fetch entirely while a resume is still pending/processing/failed —
 * callers in that state can't analyze anyway, so there's nothing to show.
 */
export function useResumeMatch(
  resumeId: string | undefined,
  jobId: string | undefined,
  resumeReady = true,
) {
  return useQuery({
    queryKey: aiKeys.resumeMatch(resumeId ?? "", jobId ?? ""),
    queryFn: () => aiClient.getResumeMatch(resumeId!, jobId!),
    enabled: Boolean(resumeId) && Boolean(jobId) && resumeReady,
    staleTime: 30 * 1_000,
  });
}

/** Past analyses for this (resumeId, jobId) pair, newest first — the "View past analyses" link. */
export function useResumeMatchHistory(resumeId: string | undefined, jobId: string | undefined) {
  return useQuery({
    queryKey: aiKeys.resumeMatchHistory(resumeId ?? "", jobId ?? ""),
    queryFn: () => analysisRepo.listHistory(resumeId!, jobId!, AI_CAPABILITIES.RESUME_MATCH),
    enabled: Boolean(resumeId) && Boolean(jobId),
    staleTime: 60 * 1_000,
  });
}

/**
 * Analyze (or re-analyze, with forceRefresh) a Resume Match. The caller must
 * show the credit-confirmation dialog BEFORE invoking this — the mutation
 * itself never confirms, it only executes.
 */
export function useAnalyzeMatch(resumeId: string | undefined, jobId: string | undefined) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (forceRefresh: boolean) =>
      aiClient.analyzeResumeMatch(resumeId!, jobId!, forceRefresh),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: aiKeys.resumeMatch(resumeId ?? "", jobId ?? ""),
      });
      void queryClient.invalidateQueries({
        queryKey: aiKeys.resumeMatchHistory(resumeId ?? "", jobId ?? ""),
      });
      void queryClient.invalidateQueries({ queryKey: aiKeys.credits(user?.id ?? "") });
    },
  });
}

// ── ATS Compatibility (Module 6C) ──
//
// Same read/analyze split as Resume Match: the peek never charges a credit, and
// the mutation executes only after the caller has shown the credit-confirmation
// dialog. Keyed by (resumeId, jobId) so switching the resume shows that pair's
// cached analysis instantly with no AI call.

/**
 * Read-only peek at the latest ATS Compatibility analysis for (resumeId,
 * jobId) — never consumes a credit. Returns `null` analysis when nothing has
 * been analyzed yet, and `stale: true` when the resume or job changed since.
 */
export function useAtsScore(
  resumeId: string | undefined,
  jobId: string | undefined,
  resumeReady = true,
) {
  return useQuery({
    queryKey: aiKeys.atsScore(resumeId ?? "", jobId ?? ""),
    queryFn: () => aiClient.getAtsScore(resumeId!, jobId!),
    enabled: Boolean(resumeId) && Boolean(jobId) && resumeReady,
    staleTime: 30 * 1_000,
  });
}

/** Past ATS analyses for this (resumeId, jobId) pair, newest first. */
export function useAtsScoreHistory(resumeId: string | undefined, jobId: string | undefined) {
  return useQuery({
    queryKey: aiKeys.atsScoreHistory(resumeId ?? "", jobId ?? ""),
    queryFn: () => analysisRepo.listHistory(resumeId!, jobId!, AI_CAPABILITIES.ATS_SCORE),
    enabled: Boolean(resumeId) && Boolean(jobId),
    staleTime: 60 * 1_000,
  });
}

/**
 * Analyze (or re-analyze, with forceRefresh) ATS Compatibility. The caller must
 * show the credit-confirmation dialog BEFORE invoking this — the mutation never
 * confirms, it only executes.
 */
export function useAnalyzeAts(resumeId: string | undefined, jobId: string | undefined) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (forceRefresh: boolean) =>
      aiClient.analyzeAtsScore(resumeId!, jobId!, forceRefresh),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: aiKeys.atsScore(resumeId ?? "", jobId ?? ""),
      });
      void queryClient.invalidateQueries({
        queryKey: aiKeys.atsScoreHistory(resumeId ?? "", jobId ?? ""),
      });
      void queryClient.invalidateQueries({ queryKey: aiKeys.credits(user?.id ?? "") });
    },
  });
}
