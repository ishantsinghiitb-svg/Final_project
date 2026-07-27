import type { CareerCategory } from "./constants";
import { getCategoryFramework } from "./constants";

// ── Role Intelligence Layer (Module 6E · Resume Transformation Engine) ──
//
// The reusable layer that turns "optimize for category X" into "review this
// resume as the domain expert who HIRES for X." It is what makes the optimizer
// a transformation engine rather than a generic reviewer: every category gets
// its own benchmark (what a top-1% resume looks like) and its own evaluation
// rubric, so a Product Management run and a Finance run reason like two
// different experts.
//
// Category-adaptive BY DESIGN, never hardcoded per role:
//   • Built-in category → seed the rubric from CATEGORY_FRAMEWORKS (constants).
//   • General / custom / any future target → instruct the model to DERIVE the
//     rubric for that specific target.
// So adding or changing a category is a DATA change (constants), not a new
// prompt — this layer supports any category, present or future, unchanged.

/**
 * PHASE 1 (Role Intelligence) + PHASE 2 (Category Evaluation Framework) as a
 * single silent-reasoning block. The model builds the category benchmark and
 * the scorecard rubric here; it is instructed not to output this reasoning
 * directly (it becomes the benchmark the rest of the pipeline measures against).
 */
export function buildRoleIntelligenceBlock(category: CareerCategory): string {
  const framework = getCategoryFramework(category.id);

  const rubricSeed =
    framework.length > 0
      ? [
          `Seed rubric dimensions for ${category.label} — adapt and EXTEND these the way a real domain`,
          "expert would (add what's missing, drop what doesn't apply):",
          ...framework.map((f) => `• ${f}`),
        ].join("\n")
      : [
          `Derive the rubric dimensions yourself for "${category.label}". Determine the specific competencies,`,
          "evidence, terminology, and impact a hiring manager for THIS exact target weights most — do not fall",
          "back on a generic resume rubric.",
        ].join("\n");

  return [
    "════════ ROLE INTELLIGENCE (reason silently — this is your BENCHMARK, do NOT output it) ════════",
    "",
    `PHASE 1 — Become the recruiter, hiring manager, and professional resume writer who hires for ${category.label}.`,
    "Before reading the résumé, define what a TOP 1% resume in THIS category looks like. Work out, for this",
    "category specifically:",
    "• Recruiter expectations and hiring-manager expectations",
    "• Core competencies and the evidence expected for each",
    "• The storytelling style and narrative that wins",
    "• The typical section hierarchy (what leads, what's de-emphasized)",
    "• Keywords, business language, and technical language of the field",
    "• Leadership and metrics expectations",
    "• The common weaknesses in resumes for this category",
    "• The typical reasons resumes here get REJECTED, and the reasons they get SHORTLISTED",
    "This benchmark is CATEGORY-SPECIFIC: it must look completely different from another category's benchmark.",
    "",
    "PHASE 2 — Build the CATEGORY EVALUATION FRAMEWORK: the rubric of dimensions that actually matter for this",
    "category. These become the `scorecard` you score in Phase 3.",
    rubricSeed,
    "The rubric MUST be specific to this category — a Finance, HR, Consulting, Data, or Design rubric would be",
    "entirely different. Never reuse a one-size-fits-all rubric.",
  ].join("\n");
}
