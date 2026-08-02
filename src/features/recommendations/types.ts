// ── AI Recommendations (Module 8B) ──
//
// Every recommendation traces back to deterministic backend metrics (see
// candidates.ts) — the AI's only role is phrasing. `facts` are the numbers
// and `entities` are the proper nouns a candidate is allowed to state; the
// guardrail (prompt.ts) rejects any AI output that states a number or name
// outside either whitelist, falling back to `fallback` instead.

/**
 * The known set of candidate types, as a runtime array so schema.ts (Zod
 * enum) and candidates.ts (detector registry) share one source of truth
 * instead of two lists that could drift apart. Extending the detector
 * registry with a new type means adding it here first.
 */
export const RECOMMENDATION_CANDIDATE_TYPES = [
  "resume_performance",
  "stale_applications",
  "interview_prep",
  "mock_interview",
  "goal_progress",
  "ats_improvement",
  "resume_linking",
] as const;

export type RecommendationCandidateType = (typeof RECOMMENDATION_CANDIDATE_TYPES)[number];

export type RecommendationCandidate = {
  type: RecommendationCandidateType;
  /** Lower shows first (both inline and in "Show all") — see RECOMMENDATION_DETECTORS order in candidates.ts. */
  priority: number;
  /** The ONLY numbers the AI may state for this candidate. */
  facts: Record<string, number>;
  /** The ONLY proper nouns (resume/competency/goal/company names) the AI may state for this candidate. */
  entities: string[];
  /** Used verbatim whenever the AI's phrasing fails the guardrail or the call fails/times out. */
  fallback: { title: string; explanation: string; action: string };
};

export type RecommendationItem = {
  type: RecommendationCandidateType;
  title: string;
  explanation: string;
  action: string;
  /** Whether this card's copy is the AI's (guardrail-validated) or the deterministic fallback. Not shown in the UI — useful for tests/debugging. */
  source: "ai" | "template";
};

export type GetRecommendationsResult =
  { ok: true; items: RecommendationItem[]; generatedAt: string } | { ok: false; message: string };
