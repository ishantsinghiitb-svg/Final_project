import { createServerFn } from "@tanstack/react-start";
import type {
  CoverLetterAIAction,
  CoverLetterLength,
  CoverLetterTone,
} from "@/features/cover-letters/constants";
import type { CoverLetterAIResult, ExplainCoverLetterResult } from "@/features/cover-letters/types";
import { requireUser } from "@/server/supabase";
import { explainCoverLetterAI, runCoverLetterAI } from "@/server/ai/CoverLetterAIService";

// ── Cover Letter Studio server functions (Module 6E) ──
//
// Lives OUTSIDE src/server/** on purpose (same rationale as src/server-functions/ai.ts
// and src/server-functions/optimizer.ts): the Vite import-protection blocks client
// imports of any "server" path, so a createServerFn entry point the client calls
// directly must be defined here. The framework still splits the handler — and
// everything it imports from src/server/** — into the server-only bundle.
//
// Credit policy — editing session model: Generate and the explicit Regenerate
// Entire Letter action are the only calls that charge (1 AI credit, shown as a
// confirmation BEFORE calling). Every other action reuses the session that
// call opened and is free — the server re-verifies the session on every call,
// so the client showing "free" is never the thing granting it.

type GenerateInput = {
  accessToken: string;
  resumeId: string;
  jobId: string;
  tone: CoverLetterTone;
  length: CoverLetterLength;
  customInstructions?: string;
  /** Set when the user explicitly asks for a fresh letter rather than the first one. */
  forceRefresh?: boolean;
};

export const generateCoverLetter = createServerFn({ method: "POST" })
  .validator((data: GenerateInput) => data)
  .handler(async ({ data }): Promise<CoverLetterAIResult> => {
    const authed = await requireUser(data.accessToken);
    return runCoverLetterAI(authed, {
      resumeId: data.resumeId,
      jobId: data.jobId,
      tone: data.tone,
      length: data.length,
      customInstructions: data.customInstructions,
      forceRefresh: data.forceRefresh,
    });
  });

type ActionInput = {
  accessToken: string;
  /** The document this action applies to — required so the server can check its session. */
  coverLetterId: string;
  action: CoverLetterAIAction;
  /** The letter as it stands in the editor, edits included. */
  content: string;
  resumeId: string;
  jobId: string;
  tone: CoverLetterTone;
  length: CoverLetterLength;
  customInstructions?: string;
  /** Target tone for `change_tone` — becomes the letter's tone going forward. */
  targetTone?: CoverLetterTone;
  /** Target length for `change_length` — becomes the letter's length going forward. */
  targetLength?: CoverLetterLength;
};

export const runCoverLetterAction = createServerFn({ method: "POST" })
  .validator((data: ActionInput) => data)
  .handler(async ({ data }): Promise<CoverLetterAIResult> => {
    const authed = await requireUser(data.accessToken);
    return runCoverLetterAI(authed, {
      coverLetterId: data.coverLetterId,
      resumeId: data.resumeId,
      jobId: data.jobId,
      // Change-tone / change-length REPLACE the active setting: the prompt is
      // built from the target, and the returned generation reports it back so
      // the document's stored settings stay truthful about the letter's voice.
      tone: data.targetTone ?? data.tone,
      length: data.targetLength ?? data.length,
      customInstructions: data.customInstructions,
      action: data.action,
      content: data.content,
      // An AI action is never served from cache — the user asked for a change.
      forceRefresh: true,
    });
  });

type ExplainInput = {
  accessToken: string;
  coverLetterId: string;
  content: string;
  resumeId: string;
  jobId: string;
  tone: CoverLetterTone;
  length: CoverLetterLength;
  customInstructions?: string;
};

export const explainCoverLetter = createServerFn({ method: "POST" })
  .validator((data: ExplainInput) => data)
  .handler(async ({ data }): Promise<ExplainCoverLetterResult> => {
    const authed = await requireUser(data.accessToken);
    return explainCoverLetterAI(authed, {
      coverLetterId: data.coverLetterId,
      content: data.content,
      resumeId: data.resumeId,
      jobId: data.jobId,
      tone: data.tone,
      length: data.length,
      customInstructions: data.customInstructions,
    });
  });
