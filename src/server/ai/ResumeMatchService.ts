import { getCapability } from "@/features/ai/capabilities";
import { AI_CAPABILITIES } from "@/features/ai/constants";
import { matchLabelForScore } from "@/features/ai/matchLabel";
import { ResumeMatchResultSchema, type ResumeMatchResult } from "@/features/ai/schemas";
import type { AICreditStatus, AIContext, ResumeMatchSummary } from "@/features/ai/types";
import type { Json } from "@/types/database";
import type { AuthedContext } from "@/server/supabase";
import { ContextBuilder } from "./ContextBuilder";
import { computeInputHash, runCapability } from "./AIService";

// ── Resume Match Service (Module 6B) ──
//
// Thin orchestration on top of the reused AI engine (runCapability). Owns the
// two things the engine intentionally does NOT: the durable `ai_analyses`
// history row, and the "is my last result still current?" staleness peek —
// both of which are specific to how Resume Match is displayed, not something
// every capability needs.

export type GetMatchResult = {
  analysis: ResumeMatchSummary | null;
  /** True when the resume or job has changed since this analysis ran (recomputed input_hash no longer matches). */
  stale: boolean;
  resumeName: string | null;
};

export type AnalyzeMatchResult =
  | { ok: true; analysis: ResumeMatchSummary; cacheHit: boolean; credits: AICreditStatus }
  | { ok: false; code: string; message: string; credits?: AICreditStatus };

function toSummary(row: { id: string; result: Json; created_at: string }): ResumeMatchSummary {
  // ai_analyses is a Module 6B table — every row was written by the current
  // engine under the current schema, so a strict parse is safe today. If a
  // future analysis_version bump changes this shape, that bump is the right
  // place to add a tolerant/legacy read path — not before it's needed.
  const data = ResumeMatchResultSchema.parse(row.result);
  return {
    id: row.id,
    overallScore: data.overallScore,
    matchLabel: matchLabelForScore(data.overallScore),
    whatMatches: data.whatMatches,
    whatToImprove: data.whatToImprove,
    summary: data.summary,
    createdAt: row.created_at,
  };
}

/**
 * Read-only peek — 0 credits, no provider call. Returns the latest analysis
 * for this (resume, job) pair plus whether it's stale (resume re-parsed or
 * job snapshot changed since).
 */
export async function getResumeMatch(
  authed: AuthedContext,
  resumeId: string,
  jobId: string,
): Promise<GetMatchResult> {
  const { supabase: sb, user } = authed;
  const cap = getCapability(AI_CAPABILITIES.RESUME_MATCH);

  const { data: resumeRow, error: resumeErr } = await sb
    .from("resumes")
    .select("name")
    .eq("id", resumeId)
    .maybeSingle();
  if (resumeErr) throw resumeErr;

  const { data: latest, error } = await sb
    .from("ai_analyses")
    .select("id, input_hash, result, created_at")
    .eq("user_id", user.id)
    .eq("resume_id", resumeId)
    .eq("job_id", jobId)
    .eq("capability", AI_CAPABILITIES.RESUME_MATCH)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;

  if (!latest) {
    return { analysis: null, stale: false, resumeName: resumeRow?.name ?? null };
  }

  let stale = false;
  try {
    const builder = new ContextBuilder(sb);
    const ctx: AIContext = { user: await builder.buildUserContext(user.id) };
    ctx.resume = await builder.buildResumeContext(resumeId);
    ctx.job = await builder.buildJobContext(jobId);
    const currentInputHash = await computeInputHash(AI_CAPABILITIES.RESUME_MATCH, ctx, cap);
    stale = currentInputHash !== latest.input_hash;
  } catch {
    // Couldn't rebuild context (resume/job missing or unreadable) — flag
    // conservatively rather than silently claiming the result is fresh.
    stale = true;
  }

  return {
    analysis: toSummary(latest),
    stale,
    resumeName: resumeRow?.name ?? null,
  };
}

/**
 * Generate (or re-generate, with forceRefresh) a match analysis. Charges a
 * credit unless the engine serves an identical-input cache hit. Every
 * successful call appends a new `ai_analyses` row — this is the durable
 * history the Match card and "View past analyses" read from.
 */
export async function analyzeResumeMatch(
  authed: AuthedContext,
  resumeId: string,
  jobId: string,
  options: { forceRefresh?: boolean } = {},
): Promise<AnalyzeMatchResult> {
  const { supabase: sb, user } = authed;

  let resumeRow: { parse_status: string } | null;
  try {
    const { data, error } = await sb
      .from("resumes")
      .select("parse_status")
      .eq("id", resumeId)
      .maybeSingle();
    if (error) throw error;
    resumeRow = data;
  } catch (err) {
    return {
      ok: false,
      code: "error",
      message: err instanceof Error ? err.message : "Failed to load your resume.",
    };
  }

  if (!resumeRow) {
    return { ok: false, code: "resume_not_found", message: "Resume not found." };
  }
  if (resumeRow.parse_status !== "ready") {
    return {
      ok: false,
      code: "resume_not_ready",
      message: "Finish resume parsing before analyzing a match.",
    };
  }

  const result = await runCapability({
    capability: AI_CAPABILITIES.RESUME_MATCH,
    authed,
    resumeId,
    jobId,
    forceRefresh: options.forceRefresh,
  });

  if (!result.ok) {
    return { ok: false, code: result.code, message: result.message, credits: result.credits };
  }

  // The AI call already succeeded — and unless this was a cache hit, the user
  // was already charged for it inside runCapability. A persistence failure
  // below must never erase a result the user already paid for, so this never
  // rethrows: on failure it falls back to an ephemeral id/timestamp so the
  // result still renders. It just won't appear in "View past analyses" (no
  // durable row was written) — acceptable, since the next successful analyze
  // persists normally; the alternative (throwing away a paid-for result) is not.
  const data = result.data as ResumeMatchResult;
  let analysisId: string;
  let createdAt: string;
  try {
    const { data: inserted, error: insertErr } = await sb
      .from("ai_analyses")
      .insert({
        user_id: user.id,
        capability: AI_CAPABILITIES.RESUME_MATCH,
        resume_id: resumeId,
        job_id: jobId,
        resume_file_hash: result.meta.resumeFileHash,
        job_hash: result.meta.jobHash,
        input_hash: result.meta.inputHash,
        prompt_version: result.meta.promptVersion,
        analysis_version: result.meta.analysisVersion,
        model: result.meta.model,
        score: data.overallScore,
        result: data as unknown as Json,
        cache_hit: result.meta.cacheHit,
      })
      .select("id, created_at")
      .single();
    if (insertErr) throw insertErr;
    analysisId = inserted.id;
    createdAt = inserted.created_at;
  } catch {
    analysisId = crypto.randomUUID();
    createdAt = new Date().toISOString();
  }

  return {
    ok: true,
    analysis: {
      id: analysisId,
      overallScore: data.overallScore,
      matchLabel: matchLabelForScore(data.overallScore),
      whatMatches: data.whatMatches,
      whatToImprove: data.whatToImprove,
      summary: data.summary,
      createdAt,
    },
    cacheHit: result.meta.cacheHit,
    credits: result.meta.credits,
  };
}
