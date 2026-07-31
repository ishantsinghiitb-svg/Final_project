import { authService } from "@/services/AuthService";
import {
  endMockInterviewFn,
  generateMockInterviewReportFn,
  pauseMockInterviewFn,
  resumeMockInterviewFn,
  startMockInterviewFn,
  submitMockInterviewAnswerFn,
} from "@/server-functions/mockInterview";
import type {
  EndMockInterviewResult,
  GenerateReportResult,
  PauseResumeResult,
  StartMockInterviewParams,
  StartMockInterviewResult,
  SubmitAnswerParams,
  SubmitAnswerResult,
} from "@/features/mock-interview/types";

// ── MockInterviewAIClient (Module 7C · client facade) ──
//
// Thin wrapper over the studio's server functions (mirrors
// InterviewPrepAIClient / CoverLetterAIClient) — the server functions run
// where the provider keys live; this facade only injects the caller's
// Supabase access token. Non-AI reads (listing sessions, reading a
// transcript) do NOT go through here — see MockInterviewService.

async function accessToken(): Promise<string> {
  const session = await authService.getSession();
  const token = session?.access_token;
  if (!token) throw new Error("Not authenticated");
  return token;
}

export const mockInterviewAIClient = {
  /** Charges 5 AI Credits, once per session. The caller must show the cost confirmation first. */
  async start(params: StartMockInterviewParams): Promise<StartMockInterviewResult> {
    return startMockInterviewFn({
      data: {
        accessToken: await accessToken(),
        interviewId: params.interviewId,
        clientKey: params.clientKey,
        interviewerRole: params.interviewerRole,
        focus: params.focus,
        manualJobDescription: params.manualJobDescription,
        manualCompanyDescription: params.manualCompanyDescription,
      },
    });
  },

  /** Free — the server re-verifies the session is active on every call. */
  async submitAnswer(params: SubmitAnswerParams): Promise<SubmitAnswerResult> {
    return submitMockInterviewAnswerFn({
      data: {
        accessToken: await accessToken(),
        sessionId: params.sessionId,
        turnIndex: params.turnIndex,
        answer: params.answer,
        inputMode: params.inputMode,
      },
    });
  },

  async pause(sessionId: string): Promise<PauseResumeResult> {
    return pauseMockInterviewFn({ data: { accessToken: await accessToken(), sessionId } });
  },

  /** May auto-conclude the session server-side if it was paused past the resume window. */
  async resume(sessionId: string): Promise<PauseResumeResult> {
    return resumeMockInterviewFn({ data: { accessToken: await accessToken(), sessionId } });
  },

  async end(sessionId: string): Promise<EndMockInterviewResult> {
    return endMockInterviewFn({
      data: { accessToken: await accessToken(), sessionId, reason: "user_ended" },
    });
  },

  /** Free, and safe to call whenever status is concluded — a no-op if a report already exists unless `regenerate` is set. */
  async generateReport(sessionId: string, regenerate = false): Promise<GenerateReportResult> {
    return generateMockInterviewReportFn({
      data: { accessToken: await accessToken(), sessionId, regenerate },
    });
  },
};
