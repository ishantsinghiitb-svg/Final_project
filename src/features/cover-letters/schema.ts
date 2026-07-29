import { z } from "zod";

// ── Cover Letter AI output schemas (Module 6E) ──
//
// Lives here rather than in features/ai/schemas/capabilities.ts for the same
// reason the optimizer keeps its own schema: the registry's `CoverLetterResultSchema`
// is the frozen 6A placeholder bound to `runCapability`, and the Studio runs a
// dedicated orchestration (see server/ai/CoverLetterAIService.ts). Nothing in
// the frozen AI engine changes.
//
// Two contracts:
//   • Draft   — a whole letter. `paragraphs` is a FREE-LENGTH list: the model
//               decides how many paragraphs the letter needs and how it flows.
//               Only the greeting and sign-off stay separate, because they are
//               structurally special (a salutation line and a closing block)
//               and keeping them distinct is what lets assembly stay
//               deterministic and lets sections.ts splice sections reliably.
//   • Rewrite — a single replacement span, for the section-level actions.
//
// Every field carries a `.catch()` fallback, matching the defensive pattern used
// by Resume Match / ATS: a malformed value degrades instead of failing the run
// the user already paid a credit for.
//
// ── Why `internal` comes first ──
// OpenAI structured outputs emit properties in schema order, so declaring the
// reasoning fields BEFORE the letter forces the model to work through the
// company → candidate → intersection → narrative analysis before it writes a
// word. It is chain-of-thought with a schema instead of a "think step by step"
// incantation. `internal` is stored in ai_analyses for quality debugging and is
// never shown to the user or pasted into the letter.

const DraftInternalSchema = z
  .object({
    /** Phase 1 — what the posting is really hiring for, in the model's words. */
    companyNeeds: z.string().catch(""),
    /** Phase 2 — the candidate's strongest relevant evidence. */
    candidateStrengths: z.string().catch(""),
    /** Phase 3 — the one-sentence answer to "why THIS candidate for THIS role?". */
    intersection: z.string().catch(""),
    /** Phase 4 — the single chosen through-line (Builder, Ownership, 0→1, …). */
    narrative: z.string().catch(""),
    /** Every custom instruction, restated with how it was honored (or why truthfulness overrode it). */
    instructionsApplied: z.array(z.string()).catch([]),
    /** The pre-return checklist. All must be true before the letter is returned. */
    checks: z
      .object({
        soundsHuman: z.boolean().catch(false),
        avoidsResumeRepetition: z.boolean().catch(false),
        everyParagraphTiedToJob: z.boolean().catch(false),
        customInstructionsFollowed: z.boolean().catch(false),
        avoidsGenericOpening: z.boolean().catch(false),
        everyStatementTruthful: z.boolean().catch(false),
      })
      .catch({
        soundsHuman: false,
        avoidsResumeRepetition: false,
        everyParagraphTiedToJob: false,
        customInstructionsFollowed: false,
        avoidsGenericOpening: false,
        everyStatementTruthful: false,
      }),
  })
  .catch({
    companyNeeds: "",
    candidateStrengths: "",
    intersection: "",
    narrative: "",
    instructionsApplied: [],
    checks: {
      soundsHuman: false,
      avoidsResumeRepetition: false,
      everyParagraphTiedToJob: false,
      customInstructionsFollowed: false,
      avoidsGenericOpening: false,
      everyStatementTruthful: false,
    },
  });

export const CoverLetterDraftSchema = z.object({
  /** Reasoning first — see the note above. Never rendered. */
  internal: DraftInternalSchema,
  /** "Dear Hiring Manager," — salutation line only. May be empty if none fits. */
  greeting: z.string().catch(""),
  /**
   * The letter body, one entry per paragraph. The model chooses how many —
   * there is no fixed opening/middle/closing split.
   */
  paragraphs: z.array(z.string()).catch([]),
  /** "Sincerely,\nJane Doe" — sign-off block. */
  signOff: z.string().catch(""),
  /** One short sentence describing what was written. Never part of the letter. */
  note: z.string().catch(""),
});

export type CoverLetterDraft = z.infer<typeof CoverLetterDraftSchema>;

export const CoverLetterRewriteSchema = z.object({
  /** Every custom instruction, restated with how this rewrite honors it. Never rendered. */
  instructionsApplied: z.array(z.string()).catch([]),
  /** The narrative the existing letter runs on, which this rewrite must preserve. */
  narrative: z.string().catch(""),
  /** The replacement text for the requested span. Plain prose, no labels. */
  text: z.string().catch(""),
  /** One short sentence describing the change. Never part of the letter. */
  note: z.string().catch(""),
});

export type CoverLetterRewrite = z.infer<typeof CoverLetterRewriteSchema>;

/** Assemble a validated draft into the Studio's plain-text letter. */
export function draftToText(draft: CoverLetterDraft): string {
  const parts = [draft.greeting, ...draft.paragraphs, draft.signOff];
  return parts
    .map((p) => p.replace(/\r\n/g, "\n").trim())
    .filter(Boolean)
    .join("\n\n");
}

// ── Explain AI Decisions (foundation refinement) ──
//
// A read-only insight into a letter that already exists — not a rewrite. The
// model re-derives plausible reasoning from the CURRENT text plus the resume
// and job (it has no memory of the original generation's internal reasoning),
// so each field is framed as "why this reads the way it does", never as a
// claimed recollection.
export const CoverLetterExplanationSchema = z.object({
  /** Why this tone/voice fits the letter as written. */
  toneReason: z.string().catch(""),
  /** Why the letter is organized the way it is (opening/body/closing choices). */
  structureReason: z.string().catch(""),
  /** Why these particular experiences/achievements were emphasized. */
  highlightsReason: z.string().catch(""),
  /** One or two sentences tying the above together. */
  summary: z.string().catch(""),
});

export type CoverLetterExplanation = z.infer<typeof CoverLetterExplanationSchema>;
