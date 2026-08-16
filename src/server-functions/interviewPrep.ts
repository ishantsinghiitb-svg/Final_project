import { createServerFn } from "@tanstack/react-start";
import type {
  GenerateInterviewAnswerResult,
  GenerateInterviewPrepResult,
} from "@/features/interview-prep/types";
import { requireUser } from "@/server/supabase";
import {
  generateInterviewAnswer,
  runInterviewPrepGeneration,
} from "@/server/ai/InterviewPrepAIService";

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

type GeneratePrepInput = {
  accessToken: string;
  interviewId: string;
  manualJobDescription?: string;
  manualCompanyDescription?: string;
  additionalContext?: string;
};

export const generateInterviewPrep = createServerFn({ method: "POST" })
  .validator((data: GeneratePrepInput) => data)
  .handler(async ({ data }): Promise<GenerateInterviewPrepResult> => {
    const authed = await requireUser(data.accessToken);
    return runInterviewPrepGeneration(authed, {
      interviewId: data.interviewId,
      manualJobDescription: data.manualJobDescription,
      manualCompanyDescription: data.manualCompanyDescription,
      additionalContext: data.additionalContext,
    });
  });

type GenerateAnswerInput = {
  accessToken: string;
  interviewPrepId: string;
  questionId: string;
  regenerate?: boolean;
};

export const generateInterviewAnswerFn = createServerFn({ method: "POST" })
  .validator((data: GenerateAnswerInput) => data)
  .handler(async ({ data }): Promise<GenerateInterviewAnswerResult> => {
    const authed = await requireUser(data.accessToken);
    return generateInterviewAnswer(authed, {
      interviewPrepId: data.interviewPrepId,
      questionId: data.questionId,
      regenerate: data.regenerate,
    });
  });
