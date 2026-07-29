import type { AICreditStatus, AIFailure } from "@/features/ai/types";
import type { CoverLetterExplanation } from "./schema";
import type { CoverLetterAIAction, CoverLetterLength, CoverLetterTone } from "./constants";

export type { CoverLetterExplanation } from "./schema";

// ── Cover Letter Studio domain types (Module 6E) ──
//
// The wire shape between the server AI service, the server function and the
// client. Deliberately text-first: the AI returns a structured letter, but the
// SOURCE OF TRUTH the Studio stores and edits is plain text — the user must be
// able to rewrite any part of it freely, which a stored structure could not
// survive. Sections are recovered deterministically when needed (see sections.ts).

/** What an AI generation / action produces. */
export type CoverLetterGeneration = {
  /** The full letter as plain text — what lands in the editor. */
  content: string;
  tone: CoverLetterTone;
  length: CoverLetterLength;
  /** One line explaining what the model did — shown as a toast, not stored copy. */
  note: string;
  /** ai_analyses row id for this run (provenance on the saved version). */
  analysisId: string | null;
  model: string;
  promptVersion: string;
  analysisVersion: string;
  cacheHit: boolean;
  /** Whether this specific call charged a credit — false when covered by the editing session. */
  creditsCharged: number;
  /** Wall-clock time the provider call took, in milliseconds. */
  generationMs: number;
  /**
   * A fresh editing-session id when this call opened/rotated one (the first
   * generation, or an explicit Regenerate Entire Letter) — null for every free
   * refinement action, which reuses the session already active on the document
   * without changing it.
   */
  sessionId: string | null;
};

export type GenerateCoverLetterParams = {
  resumeId: string;
  jobId: string;
  tone: CoverLetterTone;
  length: CoverLetterLength;
  customInstructions?: string;
  /** Always true for an explicit Regenerate — a fresh letter, never a cache replay. */
  forceRefresh?: boolean;
};

export type CoverLetterActionParams = {
  /**
   * The document this action applies to — required so the server can verify an
   * active editing session before waiving the credit charge. Absent only for
   * the very first generation, where the document doesn't exist yet.
   */
  coverLetterId: string;
  action: CoverLetterAIAction;
  /** The letter as it stands in the editor right now (edits included). */
  content: string;
  resumeId: string;
  jobId: string;
  tone: CoverLetterTone;
  length: CoverLetterLength;
  customInstructions?: string;
  /** Target tone for `change_tone`. */
  targetTone?: CoverLetterTone;
  /** Target length for `change_length`. */
  targetLength?: CoverLetterLength;
};

/** Structured envelope returned by both server functions. */
export type CoverLetterAIResult =
  { ok: true; generation: CoverLetterGeneration; credits: AICreditStatus } | AIFailure;

// ── Explain AI Decisions (foundation refinement) ──
//
// A read-only insight action, not a rewrite: it explains the tone, structure
// and highlighted experience reflected in the CURRENT letter text. Free
// whenever an editing session is active, same as the other refinement actions.
export type ExplainCoverLetterParams = {
  coverLetterId: string;
  content: string;
  resumeId: string;
  jobId: string;
  tone: CoverLetterTone;
  length: CoverLetterLength;
  customInstructions?: string;
};

export type ExplainCoverLetterResult =
  | { ok: true; explanation: CoverLetterExplanation }
  // Explain is always free (session-covered), so its failure carries no credit
  // fields — they stay unset rather than the type being a different shape.
  | AIFailure;

// ── Editor statistics (deterministic, no AI, no credits) ──
export type LetterStats = {
  wordCount: number;
  charCount: number;
  charCountNoSpaces: number;
  paragraphCount: number;
  /** Reading time in seconds, at 200 wpm. */
  readingSeconds: number;
};

// ── Section model (derived, never stored) ──
export type LetterSectionId = "greeting" | "intro" | "body" | "closing";

export type LetterSections = {
  /** "Dear Hiring Manager," — may be empty if the user removed it. */
  greeting: string;
  /** First substantive paragraph. */
  intro: string;
  /** Everything between intro and closing, blank-line separated. */
  body: string;
  /** Final paragraph plus any sign-off lines. */
  closing: string;
};
