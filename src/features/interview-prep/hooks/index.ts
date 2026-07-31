import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { aiKeys } from "@/features/ai/hooks";
import { interviewPrepService } from "@/services/InterviewPrepService";
import { interviewPrepAIClient } from "@/services/interviewPrep/InterviewPrepAIClient";
import type {
  GenerateInterviewAnswerResult,
  GenerateInterviewPrepParams,
  GenerateInterviewPrepResult,
  InterviewPrep,
  InterviewPrepAnswer,
  InterviewPrepProgress,
} from "../types";

// ── Interview Preparation hooks (Module 7B) ──
//
// The Generate/Regenerate mutation invalidates the shared AI credits key
// (parallel to useCreateCoverLetter / useAnalyzeMatch / useOptimizeResume) —
// it's the only mutation in this feature that ever spends one. Generating or
// regenerating a per-question answer, checklist progress, and hand edits to an
// answer are all free and never touch the credits query.
//
// Every mutation below updates its cache directly from the server's own
// response (setQueryData) rather than invalidating and refetching — same
// convention as Module 7C's mock-interview hooks, adopted here after a 7E
// audit found the async-refetch version of this exact pattern (busy state
// clears before the refetch lands, so the UI briefly shows stale data as if
// it were current) already caused a real bug in 7C.

/** Replaces one answer by question_id, or appends it if it's new — mirrors the DB's own `(interview_prep_id, question_id)` upsert. */
function upsertAnswer(current: InterviewPrepAnswer[] | undefined, answer: InterviewPrepAnswer) {
  const answers = current ? [...current] : [];
  const idx = answers.findIndex((a) => a.question_id === answer.question_id);
  if (idx >= 0) answers[idx] = answer;
  else answers.push(answer);
  return answers;
}

export const interviewPrepKeys = {
  all: ["interview-prep"] as const,
  byInterview: (interviewId: string) =>
    [...interviewPrepKeys.all, "by-interview", interviewId] as const,
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
      queryClient.setQueryData(
        interviewPrepKeys.byInterview(params.interviewId),
        res.generation.prep,
      );
      // Server-side, a regenerate deletes every prior per-question answer for
      // this prep id before returning (InterviewPrepAIService.ts) — a
      // first-time generation has none either, so `[]` is the correct current
      // truth in both cases, not a guess.
      queryClient.setQueryData(interviewPrepKeys.answers(res.generation.prep.id), []);
      void queryClient.invalidateQueries({ queryKey: aiKeys.credits(user?.id ?? "") });
    },
  });
}

// ── Per-question answers (free, session-gated) ──────────────────────────

export type GenerateAnswerArgs = {
  interviewPrepId: string;
  questionId: string;
  regenerate?: boolean;
};

export function useGenerateInterviewAnswer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args: GenerateAnswerArgs): Promise<GenerateInterviewAnswerResult> =>
      interviewPrepAIClient.generateAnswer({
        interviewPrepId: args.interviewPrepId,
        questionId: args.questionId,
        regenerate: args.regenerate,
      }),
    onSuccess: (res, args) => {
      if (!res.ok) return;
      queryClient.setQueryData<InterviewPrepAnswer[]>(
        interviewPrepKeys.answers(args.interviewPrepId),
        (current) => upsertAnswer(current, res.answer),
      );
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
    onSuccess: (res, { interviewPrepId }) => {
      queryClient.setQueryData<InterviewPrepAnswer[]>(
        interviewPrepKeys.answers(interviewPrepId),
        (current) => upsertAnswer(current, res),
      );
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
    // Optimistic: the checklist checkbox has no per-item pending/disabled
    // state, so a second toggle can fire before the first's response lands.
    // Without patching the cache immediately, both toggles would compute
    // their `next` array from the same stale `progress` and the second write
    // would silently overwrite the first (a real lost-update, not just a
    // display flicker — found in the 7E cache audit). Reading straight off
    // the live cache for `next` (rather than a frozen `context` snapshot) is
    // what makes two rapid, DIFFERENT toggles compose correctly instead of
    // one clobbering the other; rollback below still restores exactly what
    // was there before THIS mutation's own optimistic write.
    onMutate: async ({ id, interviewId, progress }) => {
      await queryClient.cancelQueries({ queryKey: interviewPrepKeys.byInterview(interviewId) });
      const previous = queryClient.getQueryData<InterviewPrep | null>(
        interviewPrepKeys.byInterview(interviewId),
      );
      queryClient.setQueryData<InterviewPrep | null>(
        interviewPrepKeys.byInterview(interviewId),
        (current) => (current && current.id === id ? { ...current, progress } : current),
      );
      return { previous };
    },
    onError: (_err, { interviewId }, context) => {
      if (context)
        queryClient.setQueryData(interviewPrepKeys.byInterview(interviewId), context.previous);
    },
    onSuccess: (res, { interviewId }) => {
      queryClient.setQueryData(interviewPrepKeys.byInterview(interviewId), res);
    },
  });
}
