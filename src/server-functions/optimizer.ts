import { createServerFn } from "@tanstack/react-start";
import type { CareerCategoryId, OptimizeSectionId } from "@/features/optimizer/constants";
import type { OptimizeResumeResult } from "@/features/optimizer/types";
import { requireUser } from "@/server/supabase";
import { optimizeResume as runOptimize } from "@/server/ai/ResumeOptimizerService";

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

type OptimizeInput = {
  accessToken: string;
  resumeId: string;
  category: CareerCategoryId;
  /** Required (and used) only when `category` is "other" — the user's free-text career target. */
  customCategory?: string;
  sections: OptimizeSectionId[];
  forceRefresh?: boolean;
};

export const optimizeResume = createServerFn({ method: "POST" })
  .validator((data: OptimizeInput) => data)
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
      return { ok: false, code: res.code, message: res.message, credits: res.credits };
    }
    return { ok: true, result: res.result, credits: res.credits };
  });
