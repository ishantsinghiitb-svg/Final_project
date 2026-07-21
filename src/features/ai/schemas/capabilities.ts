import { z } from "zod";

// ── Per-capability AI output schemas ──
//
// These are the analysis contracts each AI capability must satisfy. The AI
// Service validates every provider response against the capability's schema
// (with one repair-retry) before it is cached or returned. Defined now so the
// capability registry is complete and future phases (6B+) only wire the prompt.
// No capability is INVOKED in 6A (the engine ships no user-facing AI output).

export const ResumeMatchResultSchema = z.object({
  score: z.number(), // 0–100 overall match
  summary: z.string(),
  strengths: z.array(z.string()),
  gaps: z.array(z.string()),
  matchedKeywords: z.array(z.string()),
  missingKeywords: z.array(z.string()),
});
export type ResumeMatchResult = z.infer<typeof ResumeMatchResultSchema>;

export const AtsScoreResultSchema = z.object({
  score: z.number(), // 0–100 ATS-friendliness
  breakdown: z.array(
    z.object({
      category: z.string(),
      score: z.number(),
      detail: z.string(),
    }),
  ),
  issues: z.array(z.string()),
});
export type AtsScoreResult = z.infer<typeof AtsScoreResultSchema>;

export const ResumeOptimizerResultSchema = z.object({
  suggestions: z.array(
    z.object({
      section: z.string(),
      current: z.string().nullable(),
      suggestion: z.string(),
      rationale: z.string(),
    }),
  ),
});
export type ResumeOptimizerResult = z.infer<typeof ResumeOptimizerResultSchema>;

export const CoverLetterResultSchema = z.object({
  content: z.string(),
  tone: z.string(),
});
export type CoverLetterResult = z.infer<typeof CoverLetterResultSchema>;

export const InterviewPrepResultSchema = z.object({
  questions: z.array(
    z.object({
      question: z.string(),
      category: z.string(),
      suggestedAnswer: z.string().nullable(),
    }),
  ),
});
export type InterviewPrepResult = z.infer<typeof InterviewPrepResultSchema>;
