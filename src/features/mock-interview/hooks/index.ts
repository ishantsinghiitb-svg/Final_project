import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { aiKeys } from "@/features/ai/hooks";
import { mockInterviewService } from "@/services/MockInterviewService";
import { mockInterviewAIClient } from "@/services/mockInterview/MockInterviewAIClient";
import type {
  EndMockInterviewResult,
  GenerateReportResult,
  MockInterviewTurn,
  PauseResumeResult,
  StartMockInterviewParams,
  StartMockInterviewResult,
  SubmitAnswerParams,
  SubmitAnswerResult,
} from "../types";

// ── Mock Interview Studio data hooks (Module 7C) ──
//
// useStartMockInterview is the ONLY hook in this module that invalidates the
// shared AI credits key — the client-side mirror of the single-charge-site
// invariant enforced server-side in MockInterviewAIService.ts. Every other
// mutation here is free and updates its session's cache directly from the
// server's response (setQueryData) rather than refetching, so the studio's
// UI reflects exactly what the server just decided without an extra round
// trip.

export const mockInterviewKeys = {
  all: ["mock-interview"] as const,
  sessionsByInterview: (interviewId: string) =>
    [...mockInterviewKeys.all, "by-interview", interviewId] as const,
  session: (sessionId: string) => [...mockInterviewKeys.all, "session", sessionId] as const,
  turns: (sessionId: string) => [...mockInterviewKeys.all, "turns", sessionId] as const,
};

/** Past + current mock interview sessions for an interview — the launcher's history list. */
export function useMockInterviewSessions(interviewId: string | undefined) {
  return useQuery({
    queryKey: mockInterviewKeys.sessionsByInterview(interviewId ?? ""),
    queryFn: () => mockInterviewService.listSessions(interviewId!),
    enabled: Boolean(interviewId),
    staleTime: 30 * 1_000,
  });
}

export function useMockInterviewSession(sessionId: string | undefined) {
  return useQuery({
    queryKey: mockInterviewKeys.session(sessionId ?? ""),
    queryFn: () => mockInterviewService.getSession(sessionId!),
    enabled: Boolean(sessionId),
    staleTime: 10 * 1_000,
  });
}

export function useMockInterviewTurns(sessionId: string | undefined) {
  return useQuery({
    queryKey: mockInterviewKeys.turns(sessionId ?? ""),
    queryFn: () => mockInterviewService.getTurns(sessionId!),
    enabled: Boolean(sessionId),
    staleTime: 10 * 1_000,
  });
}

// ── Start (charges 5 credits) ───────────────────────────────────────────

export function useStartMockInterview() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: StartMockInterviewParams): Promise<StartMockInterviewResult> =>
      mockInterviewAIClient.start(params),
    onSuccess: (res, params) => {
      if (!res.ok) return;
      queryClient.setQueryData(mockInterviewKeys.session(res.start.session.id), res.start.session);
      queryClient.setQueryData(mockInterviewKeys.turns(res.start.session.id), [
        res.start.openingTurn,
      ]);
      void queryClient.invalidateQueries({
        queryKey: mockInterviewKeys.sessionsByInterview(params.interviewId),
      });
      void queryClient.invalidateQueries({ queryKey: aiKeys.credits(user?.id ?? "") });
    },
  });
}

// ── Live turn (free) ────────────────────────────────────────────────────

export function useSubmitMockInterviewAnswer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: SubmitAnswerParams): Promise<SubmitAnswerResult> =>
      mockInterviewAIClient.submitAnswer(params),
    onSuccess: (res, params) => {
      if (!res.ok) return;
      queryClient.setQueryData(mockInterviewKeys.session(params.sessionId), res.submission.session);
      // Splice the mutation's OWN response turns into the cache directly,
      // synchronously — same convention as every other mutation here. An
      // async invalidateQueries()-triggered refetch would leave a real
      // window where isSubmitting has already flipped false (so the
      // composer re-enables) but the turns cache still shows the PREVIOUS
      // turn as unanswered, inviting the candidate to answer a question
      // that's already been superseded. If they do, the server's
      // idempotent-replay guard silently discards that second answer,
      // since it targets an already-answered turn_index.
      queryClient.setQueryData(
        mockInterviewKeys.turns(params.sessionId),
        (current?: MockInterviewTurn[]) => {
          const turns = current ? [...current] : [];
          const upsert = (turn: MockInterviewTurn) => {
            const idx = turns.findIndex((t) => t.id === turn.id);
            if (idx >= 0) turns[idx] = turn;
            else turns.push(turn);
          };
          upsert(res.submission.answeredTurn);
          if (res.submission.nextTurn) upsert(res.submission.nextTurn);
          return turns;
        },
      );
    },
  });
}

// ── Pause / Resume (free, no AI) ─────────────────────────────────────────

export function usePauseMockInterview() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (sessionId: string): Promise<PauseResumeResult> =>
      mockInterviewAIClient.pause(sessionId),
    onSuccess: (res, sessionId) => {
      if (!res.ok) return;
      queryClient.setQueryData(mockInterviewKeys.session(sessionId), res.session);
    },
  });
}

export function useResumeMockInterview() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (sessionId: string): Promise<PauseResumeResult> =>
      mockInterviewAIClient.resume(sessionId),
    onSuccess: (res, sessionId) => {
      if (!res.ok) return;
      queryClient.setQueryData(mockInterviewKeys.session(sessionId), res.session);
    },
  });
}

// ── End (free, user-initiated) ───────────────────────────────────────────

export function useEndMockInterview() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (sessionId: string): Promise<EndMockInterviewResult> =>
      mockInterviewAIClient.end(sessionId),
    onSuccess: (res, sessionId) => {
      if (!res.ok) return;
      queryClient.setQueryData(mockInterviewKeys.session(sessionId), res.session);
      void queryClient.invalidateQueries({
        queryKey: mockInterviewKeys.sessionsByInterview(res.session.interview_id),
      });
    },
  });
}

// ── Report (free, retryable) ─────────────────────────────────────────────

export function useGenerateMockInterviewReport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      sessionId,
      regenerate,
    }: {
      sessionId: string;
      regenerate?: boolean;
    }): Promise<GenerateReportResult> =>
      mockInterviewAIClient.generateReport(sessionId, regenerate),
    onSuccess: (res, { sessionId }) => {
      if (!res.ok) return;
      queryClient.setQueryData(mockInterviewKeys.session(sessionId), res.session);
    },
  });
}
