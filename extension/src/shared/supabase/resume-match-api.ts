import { getSupabaseClient } from "./client";
import { matchLabelForScore } from "../matchLabel";
import type { ResumeOption } from "../messaging/types";

export type { ResumeOption };

/**
 * Read-only access to the user's default resume + their latest cached
 * Resume Match for a job (Module 6B). Deliberately narrow, same discipline
 * as jobs-api.ts: a small, separate mirror of the main app's
 * AnalysisRepository rather than importing across the bundle boundary.
 *
 * Never generates an analysis — the extension has no provider key and must
 * not have one. "Analyze Match" always deep-links to the dashboard, where
 * the actual AI call (with its credit-confirmation dialog) happens; this
 * module only ever reads what's already there.
 */

export type ResumeMatchSummary = {
  score: number;
  label: string;
};

/**
 * The user's analyzable resumes (parse_status = ready), default first then
 * most-recent — the same ordering the dashboard resume list uses. Only ready
 * resumes are offered: a non-ready resume has no cached match and can't be
 * analyzed, so it would be a dead option in the selector. Returns [] when the
 * user has no ready resume.
 */
export async function getUserResumes(userId: string): Promise<ResumeOption[]> {
  const { data, error } = await getSupabaseClient()
    .from("resumes")
    .select("id, name, is_default, parse_status")
    .eq("user_id", userId)
    .order("is_default", { ascending: false })
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data ?? [])
    .filter((r) => (r.parse_status as string | null) === "ready")
    .map((r) => ({
      id: r.id as string,
      name: (r.name as string | null) ?? "Resume",
      isDefault: Boolean(r.is_default),
    }));
}

/**
 * The caller's remaining AI credits (Module 6C). Read-only via RLS
 * (`user_ai_usage_select_own`); returns null when the usage row doesn't exist
 * yet (the user hasn't touched an AI feature). Never mutates credits — spending
 * happens only through the dashboard's consume RPC.
 */
export async function getAiCreditsRemaining(): Promise<number | null> {
  const { data, error } = await getSupabaseClient()
    .from("user_ai_usage")
    .select("credits_remaining")
    .maybeSingle();
  if (error) throw error;
  const remaining = (data?.credits_remaining as number | null | undefined) ?? null;
  return remaining;
}

/** The resume that would be used if the user analyzed a match right now. */
export async function getDefaultResumeId(userId: string): Promise<string | null> {
  const { data, error } = await getSupabaseClient()
    .from("resumes")
    .select("id")
    .eq("user_id", userId)
    .eq("is_default", true)
    .maybeSingle();
  if (error) throw error;
  return (data?.id as string | undefined) ?? null;
}

// Mirrors AI_CAPABILITIES.RESUME_MATCH (src/features/ai/constants) — a bare
// literal because the extension can't import across the bundle boundary. If
// that constant's value ever changes in the main app, update this too.
const RESUME_MATCH_CAPABILITY = "resume_match";

/** Latest cached match for (resumeId, globalJobId) — never triggers a generation. */
export async function getLatestResumeMatch(
  resumeId: string,
  globalJobId: string,
): Promise<ResumeMatchSummary | null> {
  const { data, error } = await getSupabaseClient()
    .from("ai_analyses")
    .select("score")
    .eq("resume_id", resumeId)
    .eq("job_id", globalJobId)
    .eq("capability", RESUME_MATCH_CAPABILITY)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data || data.score == null) return null;

  const score = data.score as number;
  return { score, label: matchLabelForScore(score) };
}
