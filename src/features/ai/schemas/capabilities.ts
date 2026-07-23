import { z } from "zod";

// ── Per-capability AI output schemas ──
//
// These are the analysis contracts each AI capability must satisfy. The AI
// Service validates every provider response against the capability's schema
// (with one repair-retry) before it is cached or returned. Defined now so the
// capability registry is complete and future phases (6B+) only wire the prompt.
// No capability is INVOKED in 6A (the engine ships no user-facing AI output).

// ── Resume Match (Module 6B) ──
//
// Public fields (overallScore/whatMatches/whatToImprove/summary) are the ONLY
// fields the product surfaces — dashboard and extension render nothing else.
// `matchLabel` is deliberately NOT part of this schema: it's derived
// deterministically from `overallScore` in code (see `matchLabelForScore` in
// ../matchLabel) so the label can never drift from the score and its
// thresholds can be retuned without a prompt/version change.
//
// `internal` carries the richer per-dimension reasoning the model already had
// to do to reach a calibrated score. It is stored (ai_analyses.result keeps
// the whole object) for future capabilities to reuse server-side, but no
// client response ever forwards it — see ResumeMatchService's mapping to
// ResumeMatchSummary. Every internal field has a `.catch()` fallback so a
// malformed/missing internal value never fails validation of the (load-
// bearing) public fields.

const DimensionSchema = z
  .object({
    score: z.number().int().min(0).max(100).catch(0),
    detail: z.string().catch(""),
  })
  .catch({ score: 0, detail: "" });

export const ResumeMatchInternalSchema = z
  .object({
    confidence: z.enum(["high", "medium", "low"]).catch("medium"),
    dimensions: z
      .object({
        experience: DimensionSchema,
        seniority: DimensionSchema,
        domain: DimensionSchema,
        education: DimensionSchema,
      })
      .catch({
        experience: { score: 0, detail: "" },
        seniority: { score: 0, detail: "" },
        domain: { score: 0, detail: "" },
        education: { score: 0, detail: "" },
      }),
    missingSkills: z
      .array(
        z.object({
          skill: z.string(),
          importance: z.enum(["required", "preferred"]).catch("preferred"),
          evidence: z.string().nullable().catch(null),
        }),
      )
      .max(10)
      .catch([]),
    missingKeywords: z.array(z.string()).max(15).catch([]),
    matchedKeywords: z.array(z.string()).max(15).catch([]),
    recommendation: z
      .object({
        shouldApply: z.enum(["apply", "stretch", "improve_first", "skip"]).catch("stretch"),
        rationale: z.string().catch(""),
      })
      .catch({ shouldApply: "stretch", rationale: "" }),
  })
  .catch({
    confidence: "medium",
    dimensions: {
      experience: { score: 0, detail: "" },
      seniority: { score: 0, detail: "" },
      domain: { score: 0, detail: "" },
      education: { score: 0, detail: "" },
    },
    missingSkills: [],
    missingKeywords: [],
    matchedKeywords: [],
    recommendation: { shouldApply: "stretch", rationale: "" },
  });

export const ResumeMatchResultSchema = z.object({
  overallScore: z.number().int().min(0).max(100),
  whatMatches: z.array(z.string()).max(5),
  whatToImprove: z.array(z.string()).max(5),
  summary: z.string(),
  internal: ResumeMatchInternalSchema,
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
