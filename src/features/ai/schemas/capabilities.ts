import { z } from "zod";
import { ImprovementActionSchema } from "./improvement";

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
  // ── Module 6E: organized, actionable improvement plan ──
  // "What prevents this from being an excellent match?" — ordered actions
  // across matches / missing / improve / add / remove / rewrite / move, each
  // with why/how/example. Additive + `.catch([])` so older cached analyses
  // (which have no plan) still parse.
  // No `.max()`: `.max(N).catch([])` empties the whole plan on overflow (too many
  // → zero). The service caps + de-duplicates instead (Module 6E final pass).
  improvementPlan: z.array(ImprovementActionSchema).catch([]),
  internal: ResumeMatchInternalSchema,
});
export type ResumeMatchResult = z.infer<typeof ResumeMatchResultSchema>;

// ── ATS Compatibility (Module 6C) ──
//
// This is the AI HALF of a hybrid score: the model evaluates ONLY the
// contextual dimensions (keyword coverage, skills/experience alignment,
// readability) plus the qualitative content (matched/missing keywords,
// strengths, risks, recommendations, summary). The deterministic parser owns
// formatting + section completeness, and the APPLICATION combines everything
// with fixed weights (see features/ai/atsScore.ts) into the final 0–100 score.
// The AI never returns the final number or a formatting score — that would let
// it invent an arbitrary ATS score, which the spec forbids.
//
// Every field carries a `.catch()` fallback (same defensive pattern as Resume
// Match) so a malformed/missing value from the model degrades gracefully
// instead of failing validation of the whole analysis.

const AtsComponentSchema = z
  .object({
    score: z.number().int().min(0).max(100).catch(0),
    detail: z.string().catch(""),
  })
  .catch({ score: 0, detail: "" });

export const AtsScoreResultSchema = z.object({
  // AI-scored components only (0–100 each). Formatting + section completeness
  // are computed deterministically by the application, never by the model.
  components: z
    .object({
      keywordCoverage: AtsComponentSchema,
      skillsAlignment: AtsComponentSchema,
      experienceAlignment: AtsComponentSchema,
      readability: AtsComponentSchema,
    })
    .catch({
      keywordCoverage: { score: 0, detail: "" },
      skillsAlignment: { score: 0, detail: "" },
      experienceAlignment: { score: 0, detail: "" },
      readability: { score: 0, detail: "" },
    }),
  matchedKeywords: z.array(z.string()).max(30).catch([]),
  missingKeywords: z.array(z.string()).max(30).catch([]),
  criticalMissingKeywords: z.array(z.string()).max(15).catch([]),
  strengths: z.array(z.string()).max(6).catch([]),
  atsRisks: z.array(z.string()).max(6).catch([]),
  recommendations: z.array(z.string()).max(6).catch([]),
  // ── Module 6E: "how to reach 95%+ ATS compatibility" plan ──
  // Ordered, concrete actions (keyword placement, sections, formatting, weak
  // bullets, restructures, additions/removals), each with why/how/example and
  // the expected ATS benefit. Additive + `.catch([])` for old cached rows.
  // No `.max()`: `.max(N).catch([])` empties the whole plan on overflow (too many
  // → zero). The service caps + de-duplicates instead (Module 6E final pass).
  improvementPlan: z.array(ImprovementActionSchema).catch([]),
  summary: z.string().catch(""),
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

// ── Mock Interview (Module 7C) ──
//
// A registry-completeness placeholder only, same relationship as
// InterviewPrepResultSchema above: the real orchestration
// (server/ai/MockInterviewAIService.ts) never reads this schema. It has THREE
// distinct real schemas of its own (features/mock-interview/schema.ts —
// planning, live turn, final report), one per phase, which don't fit a single
// registry `outputSchema` slot. This exists so `getCapability("mock_interview")`
// still returns a complete CapabilityDefinition for model/cost/version lookups.
export const MockInterviewResultSchema = z.object({
  message: z.string(),
});
export type MockInterviewResult = z.infer<typeof MockInterviewResultSchema>;
