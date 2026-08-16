import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  CAREER_CATEGORIES,
  CUSTOM_CATEGORY_MAX_LENGTH,
  OPTIMIZE_SECTIONS,
  type CareerCategoryId,
  type OptimizeSectionId,
} from "@/features/optimizer/constants";
import type { OptimizeResumeResult } from "@/features/optimizer/types";
import { requireUser } from "@/server/supabase";
import { optimizeResume as runOptimize } from "@/server/ai/ResumeOptimizerService";
import { accessToken, uuid, validate } from "./validation";

// Derived from the catalogues themselves (the single source of truth the
// picker UI and the prompt builder already share) so a new category/section
// needs no matching edit here.
const CategorySchema = z.enum(
  CAREER_CATEGORIES.map((c) => c.id) as [CareerCategoryId, ...CareerCategoryId[]],
);
const SectionSchema = z.enum(
  OPTIMIZE_SECTIONS.map((s) => s.id) as [OptimizeSectionId, ...OptimizeSectionId[]],
);

// ── Resume Optimizer server function (Module 6D) ──
//
// Lives OUTSIDE src/server/** on purpose (same rationale as src/server-functions/ai.ts):
// the Vite import-protection blocks client imports of any "server" path, so the
// createServerFn entry point the client calls directly must be defined here. The
// framework still splits the handler + everything it imports from src/server/**
// into the server-only bundle.
//
// One credit-gated entry point. The client shows the "this uses 1 AI Credit"
// confirmation BEFORE calling — the server never re-confirms, it only executes.

// Exported for direct schema-level testing — see the note in coverLetter.ts.
export const OptimizeSchema = z.object({
  accessToken,
  resumeId: uuid,
  category: CategorySchema,
  /** Required (and used) only when `category` is "other" — the user's free-text career target. */
  customCategory: z.string().max(CUSTOM_CATEGORY_MAX_LENGTH).optional(),
  // Empty is valid — resolveTargetSections treats it the same as "full".
  sections: z.array(SectionSchema),
  forceRefresh: z.boolean().optional(),
});

export const optimizeResume = createServerFn({ method: "POST" })
  .validator((data: unknown) => validate(OptimizeSchema, data))
  .handler(async ({ data }): Promise<OptimizeResumeResult> => {
    const authed = await requireUser(data.accessToken);
    const res = await runOptimize(authed, {
      resumeId: data.resumeId,
      category: data.category,
      customCategory: data.customCategory,
      sections: data.sections,
      forceRefresh: data.forceRefresh,
    });
    if (!res.ok) {
      return {
        ok: false,
        code: res.code,
        message: res.message,
        credits: res.credits,
        creditsRefunded: res.creditsRefunded,
      };
    }
    return { ok: true, result: res.result, credits: res.credits };
  });
