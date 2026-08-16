import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
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
import { MOCK_INTERVIEW_MAX_ANSWER_CHARS } from "@/features/mock-interview/constants";
import { INTERVIEWER_ROLES } from "@/features/mock-interview/interviewerRoles";
import { accessToken, freeText, uuid, validate } from "./validation";

// Same reasoning as interviewPrep.ts for the two manual-context fields — no
// prior numeric limit existed, so these reuse that file's judgment call
// rather than inventing a third, different number for the same concept.
const MANUAL_JOB_DESCRIPTION_MAX = 60_000;
const MANUAL_COMPANY_DESCRIPTION_MAX = 10_000;
const FOCUS_MAX = 500;

// Derived from the role catalogue itself so this can't drift from the
// roles actually offered — a role rename/addition needs no matching edit here.
const InterviewerRoleSchema = z.enum(INTERVIEWER_ROLES.map((r) => r.id) as [string, ...string[]]);
const InputModeSchema = z.enum(["voice", "text", "mixed", "skipped"]);
const sessionId = uuid;

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

// Exported for direct schema-level testing — see the note in coverLetter.ts.
export const StartSchema = z.object({
  accessToken,
  interviewId: uuid,
  // crypto.randomUUID() at the call site (MockInterviewLauncher.tsx) — the
  // idempotency key that lets a retried Start return the existing session.
  clientKey: uuid,
  interviewerRole: InterviewerRoleSchema,
  focus: freeText(FOCUS_MAX, { optional: true }),
  manualJobDescription: freeText(MANUAL_JOB_DESCRIPTION_MAX, { optional: true }),
  manualCompanyDescription: freeText(MANUAL_COMPANY_DESCRIPTION_MAX, { optional: true }),
});

export const startMockInterviewFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => validate(StartSchema, data))
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

export const SubmitAnswerSchema = z.object({
  accessToken,
  sessionId,
  turnIndex: z.number().int().min(0),
  // Not .min(1) — a "skipped" turn legitimately submits an empty answer.
  answer: z.string().max(MOCK_INTERVIEW_MAX_ANSWER_CHARS),
  inputMode: InputModeSchema,
});

export const submitMockInterviewAnswerFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => validate(SubmitAnswerSchema, data))
  .handler(async ({ data }): Promise<SubmitAnswerResult> => {
    const authed = await requireUser(data.accessToken);
    return submitAnswer(authed, {
      sessionId: data.sessionId,
      turnIndex: data.turnIndex,
      answer: data.answer,
      inputMode: data.inputMode,
    });
  });

const SessionIdSchema = z.object({ accessToken, sessionId });

export const pauseMockInterviewFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => validate(SessionIdSchema, data))
  .handler(async ({ data }): Promise<PauseResumeResult> => {
    const authed = await requireUser(data.accessToken);
    return pauseMockInterview(authed, data.sessionId);
  });

export const resumeMockInterviewFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => validate(SessionIdSchema, data))
  .handler(async ({ data }): Promise<PauseResumeResult> => {
    const authed = await requireUser(data.accessToken);
    return resumeMockInterview(authed, data.sessionId);
  });

const EndSchema = z.object({ accessToken, sessionId, reason: z.literal("user_ended") });

export const endMockInterviewFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => validate(EndSchema, data))
  .handler(async ({ data }): Promise<EndMockInterviewResult> => {
    const authed = await requireUser(data.accessToken);
    return endMockInterview(authed, { sessionId: data.sessionId, reason: data.reason });
  });

const GenerateReportSchema = z.object({
  accessToken,
  sessionId,
  regenerate: z.boolean().optional(),
});

export const generateMockInterviewReportFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => validate(GenerateReportSchema, data))
  .handler(async ({ data }): Promise<GenerateReportResult> => {
    const authed = await requireUser(data.accessToken);
    return generateMockInterviewReport(authed, data.sessionId, data.regenerate ?? false);
  });
