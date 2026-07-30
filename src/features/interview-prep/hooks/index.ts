import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { aiKeys } from "@/features/ai/hooks";
import { interviewPrepService } from "@/services/InterviewPrepService";
import { interviewPrepAIClient } from "@/services/interviewPrep/InterviewPrepAIClient";
import type {
  GenerateInterviewAnswerResult,
  GenerateInterviewPrepParams,
  GenerateInterviewPrepResult,
  InterviewPrepProgress,
} from "../types";

// ── Interview Preparation hooks (Module 7B) ──
//
// The Generate/Regenerate mutation invalidates the shared AI credits key
// (parallel to useCreateCoverLetter / useAnalyzeMatch / useOptimizeResume) —
// it's the only mutation in this feature that ever spends one. Generating or
// regenerating a per-question answer, checklist progress, and hand edits to an
// answer are all free and never touch the credits query.

export const interviewPrepKeys = {
  all: ["interview-prep"] as const,
  byInterview: (interviewId: string) => [...interviewPrepKeys.all, "by-interview", interviewId] as const,
  answers: (prepId: string) => [...interviewPrepKeys.all, "answers", prepId] as const,
};

/** The generated workspace for an interview — null until the first generation. */
export function useInterviewPrep(interviewId: string | undefined) {
  return useQuery({
    queryKey: interviewPrepKeys.byInterview(interviewId ?? ""),
    queryFn: () => interviewPrepService.getPrep(interviewId!),
    enabled: Boolean(interviewId),
    staleTime: 30 * 1_000,
  });
}

/** Every generated/edited answer for a preparation, keyed by question id on the client. */
export function useInterviewPrepAnswers(interviewPrepId: string | undefined) {
  return useQuery({
    queryKey: interviewPrepKeys.answers(interviewPrepId ?? ""),
    queryFn: () => interviewPrepService.getAnswers(interviewPrepId!),
    enabled: Boolean(interviewPrepId),
    staleTime: 30 * 1_000,
  });
}

// ── Generation (charges credits) ────────────────────────────────────────

/**
 * Generate — or, when a preparation already exists for this interview,
 * Regenerate Entire Preparation. The caller must show the "3 AI Credits"
 * confirmation before invoking this; the mutation only executes, it never
 * confirms. A successful regenerate also clears prior per-question answers
 * server-side, so the answers query is invalidated alongside the prep query.
 */
export function useGenerateInterviewPrep() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: GenerateInterviewPrepParams): Promise<GenerateInterviewPrepResult> =>
      interviewPrepAIClient.generate(params),
    onSuccess: (res, params) => {
      if (!res.ok) return;
      void queryClient.invalidateQueries({
        queryKey: interviewPrepKeys.byInterview(params.interviewId),
      });
      void queryClient.invalidateQueries({
        queryKey: interviewPrepKeys.answers(res.generation.prep.id),
      });
      void queryClient.invalidateQueries({ queryKey: aiKeys.credits(user?.id ?? "") });
    },
  });
}

// ── Per-question answers (free, session-gated) ──────────────────────────

export type GenerateAnswerArgs = { interviewPrepId: string; questionId: string; regenerate?: boolean };

export function useGenerateInterviewAnswer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args: GenerateAnswerArgs): Promise<GenerateInterviewAnswerResult> =>
      interviewPrepAIClient.generateAnswer({
        interviewPrepId: args.interviewPrepId,
        questionId: args.questionId,
        regenerate: args.regenerate,
      }),
    onSuccess: (_res, args) => {
      void queryClient.invalidateQueries({ queryKey: interviewPrepKeys.answers(args.interviewPrepId) });
    },
  });
}

export function useUpdateInterviewAnswerText() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      interviewPrepId,
      questionId,
      answer,
    }: {
      interviewPrepId: string;
      questionId: string;
      answer: string;
    }) => interviewPrepService.updateAnswerText(interviewPrepId, questionId, answer),
    onSuccess: (_res, { interviewPrepId }) => {
      void queryClient.invalidateQueries({ queryKey: interviewPrepKeys.answers(interviewPrepId) });
    },
  });
}

// ── Progress (free, no AI) ───────────────────────────────────────────────

export function useUpdateInterviewPrepProgress() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      interviewId,
      progress,
    }: {
      id: string;
      interviewId: string;
      progress: InterviewPrepProgress;
    }) => interviewPrepService.updateProgress(id, progress),
    onSuccess: (_res, { interviewId }) => {
      void queryClient.invalidateQueries({ queryKey: interviewPrepKeys.byInterview(interviewId) });
    },
  });
}
