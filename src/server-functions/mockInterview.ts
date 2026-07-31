import { createServerFn } from "@tanstack/react-start";
import type {
  EndMockInterviewResult,
  GenerateReportResult,
  PauseResumeResult,
  StartMockInterviewResult,
  SubmitAnswerResult,
} from "@/features/mock-interview/types";
import { requireUser } from "@/server/supabase";
import {
  endMockInterview,
  generateMockInterviewReport,
  pauseMockInterview,
  resumeMockInterview,
  startMockInterview,
  submitAnswer,
} from "@/server/ai/MockInterviewAIService";

// ── Mock Interview Studio server functions (Module 7C) ──
//
// Lives OUTSIDE src/server/** on purpose (same rationale as
// server-functions/interviewPrep.ts and coverLetter.ts): Vite's import
// protection blocks a client import of any "server" path, so the
// createServerFn entry points the client calls directly must live here.
//
// Credit policy: startMockInterviewFn is the ONLY entry point below that
// spends credits (5, once per session). Every other call — submit an answer,
// pause, resume, end, generate the report — is free and re-verifies the
// session's state server-side on every invocation; none of them trust
// anything the client claims about session status or elapsed time.

type StartInput = {
  accessToken: string;
  interviewId: string;
  clientKey: string;
  interviewerRole: string;
  focus?: string;
  manualJobDescription?: string;
  manualCompanyDescription?: string;
};

export const startMockInterviewFn = createServerFn({ method: "POST" })
  .validator((data: StartInput) => data)
  .handler(async ({ data }): Promise<StartMockInterviewResult> => {
    const authed = await requireUser(data.accessToken);
    return startMockInterview(authed, {
      interviewId: data.interviewId,
      clientKey: data.clientKey,
      interviewerRole: data.interviewerRole,
      focus: data.focus,
      manualJobDescription: data.manualJobDescription,
      manualCompanyDescription: data.manualCompanyDescription,
    });
  });

type SubmitAnswerInput = {
  accessToken: string;
  sessionId: string;
  turnIndex: number;
  answer: string;
  inputMode: "voice" | "text" | "mixed" | "skipped";
};

export const submitMockInterviewAnswerFn = createServerFn({ method: "POST" })
  .validator((data: SubmitAnswerInput) => data)
  .handler(async ({ data }): Promise<SubmitAnswerResult> => {
    const authed = await requireUser(data.accessToken);
    return submitAnswer(authed, {
      sessionId: data.sessionId,
      turnIndex: data.turnIndex,
      answer: data.answer,
      inputMode: data.inputMode,
    });
  });

type SessionIdInput = { accessToken: string; sessionId: string };

export const pauseMockInterviewFn = createServerFn({ method: "POST" })
  .validator((data: SessionIdInput) => data)
  .handler(async ({ data }): Promise<PauseResumeResult> => {
    const authed = await requireUser(data.accessToken);
    return pauseMockInterview(authed, data.sessionId);
  });

export const resumeMockInterviewFn = createServerFn({ method: "POST" })
  .validator((data: SessionIdInput) => data)
  .handler(async ({ data }): Promise<PauseResumeResult> => {
    const authed = await requireUser(data.accessToken);
    return resumeMockInterview(authed, data.sessionId);
  });

type EndInput = SessionIdInput & { reason: "user_ended" };

export const endMockInterviewFn = createServerFn({ method: "POST" })
  .validator((data: EndInput) => data)
  .handler(async ({ data }): Promise<EndMockInterviewResult> => {
    const authed = await requireUser(data.accessToken);
    return endMockInterview(authed, { sessionId: data.sessionId, reason: data.reason });
  });

type GenerateReportInput = SessionIdInput & { regenerate?: boolean };

export const generateMockInterviewReportFn = createServerFn({ method: "POST" })
  .validator((data: GenerateReportInput) => data)
  .handler(async ({ data }): Promise<GenerateReportResult> => {
    const authed = await requireUser(data.accessToken);
    return generateMockInterviewReport(authed, data.sessionId, data.regenerate ?? false);
  });
