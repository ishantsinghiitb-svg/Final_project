import { createServerFn } from "@tanstack/react-start";
import type { GetRecommendationsResult } from "@/features/recommendations/types";
import { requireUser } from "@/server/supabase";
import { getAIRecommendations } from "@/server/ai/RecommendationsService";

// ── AI Recommendations server function (Module 8B) ──
//
// Lives OUTSIDE src/server/** on purpose (same rationale as
// src/server-functions/ai.ts and src/server-functions/interviewPrep.ts):
// Vite's import-protection blocks client imports of any "server" path, so a
// createServerFn entry point the client calls directly must be defined here.
//
// No credit gate — this capability is free (see AI_CREDIT_COSTS.recommendations).

type GetRecommendationsInput = { accessToken: string };

export const getRecommendations = createServerFn({ method: "POST" })
  .validator((data: GetRecommendationsInput) => data)
  .handler(async ({ data }): Promise<GetRecommendationsResult> => {
    const authed = await requireUser(data.accessToken);
    return getAIRecommendations(authed);
  });
