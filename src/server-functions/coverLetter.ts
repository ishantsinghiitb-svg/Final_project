import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  COVER_LETTER_AI_ACTIONS,
  COVER_LETTER_LENGTHS,
  COVER_LETTER_TONES,
  MAX_CUSTOM_INSTRUCTIONS,
  MAX_LETTER_CHARS,
  type CoverLetterAIAction,
  type CoverLetterLength,
  type CoverLetterTone,
} from "@/features/cover-letters/constants";
import type { CoverLetterAIResult, ExplainCoverLetterResult } from "@/features/cover-letters/types";
import { requireUser } from "@/server/supabase";
import { explainCoverLetterAI, runCoverLetterAI } from "@/server/ai/CoverLetterAIService";
import { accessToken, uuid, validate } from "./validation";

// Enum values are derived from the constants module (the single source of
// truth the prompt builder/UI/DB check constraints already share) rather
// than re-listed here, so the two can't drift.
const ToneSchema = z.enum(
  Object.values(COVER_LETTER_TONES) as [CoverLetterTone, ...CoverLetterTone[]],
);
const LengthSchema = z.enum(
  Object.values(COVER_LETTER_LENGTHS) as [CoverLetterLength, ...CoverLetterLength[]],
);
const ActionSchema = z.enum(
  Object.values(COVER_LETTER_AI_ACTIONS) as [CoverLetterAIAction, ...CoverLetterAIAction[]],
);
// Matches the existing enforced ceilings (sanitizeCustomInstructions / the
// letter-content safety cap) — a hard reject here, not a new invented limit.
const customInstructions = z.string().max(MAX_CUSTOM_INSTRUCTIONS).optional();
const letterContent = z.string().min(1).max(MAX_LETTER_CHARS);

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

// Exported for direct schema-level testing (coverLetter.test.ts) — the
// createServerFn RPC dispatch itself isn't practically unit-testable outside
// a real request context, so tests exercise the validation contract these
// feed into `.validator()`.
export const GenerateSchema = z.object({
  accessToken,
  resumeId: uuid,
  jobId: uuid,
  tone: ToneSchema,
  length: LengthSchema,
  customInstructions,
  /** Set when the user explicitly asks for a fresh letter rather than the first one. */
  forceRefresh: z.boolean().optional(),
});

export const generateCoverLetter = createServerFn({ method: "POST" })
  .validator((data: unknown) => validate(GenerateSchema, data))
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

export const ActionSchemaInput = z.object({
  accessToken,
  /** The document this action applies to — required so the server can check its session. */
  coverLetterId: uuid,
  action: ActionSchema,
  /** The letter as it stands in the editor, edits included. */
  content: letterContent,
  resumeId: uuid,
  jobId: uuid,
  tone: ToneSchema,
  length: LengthSchema,
  customInstructions,
  /** Target tone for `change_tone` — becomes the letter's tone going forward. */
  targetTone: ToneSchema.optional(),
  /** Target length for `change_length` — becomes the letter's length going forward. */
  targetLength: LengthSchema.optional(),
});

export const runCoverLetterAction = createServerFn({ method: "POST" })
  .validator((data: unknown) => validate(ActionSchemaInput, data))
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

const ExplainSchema = z.object({
  accessToken,
  coverLetterId: uuid,
  content: letterContent,
  resumeId: uuid,
  jobId: uuid,
  tone: ToneSchema,
  length: LengthSchema,
  customInstructions,
});

export const explainCoverLetter = createServerFn({ method: "POST" })
  .validator((data: unknown) => validate(ExplainSchema, data))
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
