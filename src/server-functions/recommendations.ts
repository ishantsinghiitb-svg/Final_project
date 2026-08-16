import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { GetRecommendationsResult } from "@/features/recommendations/types";
import { requireUser } from "@/server/supabase";
import { getAIRecommendations } from "@/server/ai/RecommendationsService";
import { accessToken, validate } from "./validation";

// ── AI Recommendations server function (Module 8B) ──
//
// Lives OUTSIDE src/server/** on purpose (same rationale as
// src/server-functions/ai.ts and src/server-functions/interviewPrep.ts):
// Vite's import-protection blocks client imports of any "server" path, so a
// createServerFn entry point the client calls directly must be defined here.
//
// No credit gate — this capability is free (see AI_CREDIT_COSTS.recommendations).

const GetRecommendationsSchema = z.object({ accessToken });

export const getRecommendations = createServerFn({ method: "POST" })
  .validator((data: unknown) => validate(GetRecommendationsSchema, data))
  .handler(async ({ data }): Promise<GetRecommendationsResult> => {
    const authed = await requireUser(data.accessToken);
    return getAIRecommendations(authed);
  });
