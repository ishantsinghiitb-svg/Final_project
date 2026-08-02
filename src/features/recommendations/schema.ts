import { z } from "zod";
import { RECOMMENDATION_CANDIDATE_TYPES } from "./types";

// ── AI Recommendations — structured output schema (Module 8B) ──
//
// The AI phrases copy for candidates the backend already chose and verified
// (see candidates.ts) — this schema only shapes HOW it may respond, never
// what it's allowed to claim. `.catch()` fallbacks throughout match every
// other capability's schema convention (features/ai/schemas/capabilities.ts):
// a malformed field degrades to an empty value rather than failing the
// whole parse, and an empty title/explanation/action is treated by the
// guardrail (prompt.ts) as a validation failure that falls back to the
// candidate's pre-written template.

const RecommendationDraftItemSchema = z.object({
  type: z.enum(RECOMMENDATION_CANDIDATE_TYPES).catch("resume_performance"),
  title: z.string().max(80).catch(""),
  explanation: z.string().max(500).catch(""),
  action: z.string().max(200).catch(""),
});

export const RecommendationsDraftSchema = z.object({
  // Bounded by the number of registered detector types, not a fixed 3 — the
  // engine no longer caps how many qualifying candidates it phrases; the UI
  // decides the top-3-then-"Show all" split (see AIRecommendationsCard.tsx).
  items: z
    .array(RecommendationDraftItemSchema)
    .max(RECOMMENDATION_CANDIDATE_TYPES.length)
    .catch([]),
});

export type RecommendationDraftItem = z.infer<typeof RecommendationDraftItemSchema>;
export type RecommendationsDraft = z.infer<typeof RecommendationsDraftSchema>;
