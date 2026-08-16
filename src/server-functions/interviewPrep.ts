import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type {
  GenerateInterviewAnswerResult,
  GenerateInterviewPrepResult,
} from "@/features/interview-prep/types";
import { requireUser } from "@/server/supabase";
import {
  generateInterviewAnswer,
  runInterviewPrepGeneration,
} from "@/server/ai/InterviewPrepAIService";
import { accessToken, freeText, uuid, validate } from "./validation";

// These three fields were previously unbounded free text sent straight into
// an AI prompt (the exact gap this closes). No existing numeric limit was
// declared anywhere for them, so the ceilings below are a deliberate,
// documented judgment call, not a discovered product constant:
//   - manualJobDescription reuses MAX_DESCRIPTION_LENGTH (60,000) from
//     src/server/jobIntelligence/crawl/validate/JobValidator.ts — the same
//     concept (a job posting's description text) already has a ceiling
//     there; this just applies it to the manually-pasted path too.
//   - manualCompanyDescription (10,000) and additionalContext (5,000) have
//     no prior precedent; both are generous multiples of what their
//     placeholder copy asks for (an "About the company" paragraph, a few
//     lines of interview context) without capping any realistic input.
const MANUAL_JOB_DESCRIPTION_MAX = 60_000;
const MANUAL_COMPANY_DESCRIPTION_MAX = 10_000;
const ADDITIONAL_CONTEXT_MAX = 5_000;

// ── Interview Preparation server functions (Module 7B) ──
//
// Lives OUTSIDE src/server/** on purpose (same rationale as
// src/server-functions/ai.ts and src/server-functions/coverLetter.ts): Vite's
// import-protection blocks client imports of any "server" path, so a
// createServerFn entry point the client calls directly must be defined here.
//
// Credit policy: Generate and the explicit Regenerate Entire Preparation are
// the only calls that charge (3 AI credits). Generating or regenerating an
// answer for any question is free once the preparation exists — the server
// re-verifies the editing session on every call.

const GeneratePrepSchema = z.object({
  accessToken,
  interviewId: uuid,
  manualJobDescription: freeText(MANUAL_JOB_DESCRIPTION_MAX, { optional: true }),
  manualCompanyDescription: freeText(MANUAL_COMPANY_DESCRIPTION_MAX, { optional: true }),
  additionalContext: freeText(ADDITIONAL_CONTEXT_MAX, { optional: true }),
});

export const generateInterviewPrep = createServerFn({ method: "POST" })
  .validator((data: unknown) => validate(GeneratePrepSchema, data))
  .handler(async ({ data }): Promise<GenerateInterviewPrepResult> => {
    const authed = await requireUser(data.accessToken);
    return runInterviewPrepGeneration(authed, {
      interviewId: data.interviewId,
      manualJobDescription: data.manualJobDescription,
      manualCompanyDescription: data.manualCompanyDescription,
      additionalContext: data.additionalContext,
    });
  });

const GenerateAnswerSchema = z.object({
  accessToken,
  interviewPrepId: uuid,
  // Question ids are server-assigned as `q-${index}` (see assignStableIds in
  // InterviewPrepAIService.ts), not a uuid — bounded loosely rather than
  // coupled to that exact format.
  questionId: z.string().min(1).max(50),
  regenerate: z.boolean().optional(),
});

export const generateInterviewAnswerFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => validate(GenerateAnswerSchema, data))
  .handler(async ({ data }): Promise<GenerateInterviewAnswerResult> => {
    const authed = await requireUser(data.accessToken);
    return generateInterviewAnswer(authed, {
      interviewPrepId: data.interviewPrepId,
      questionId: data.questionId,
      regenerate: data.regenerate,
    });
  });
