import { z } from "zod";
import { getCapability } from "@/features/ai/capabilities";
import { AI_CAPABILITIES } from "@/features/ai/constants";
import { atsRatingForScore } from "@/features/ai/atsRating";
import {
  ATS_COMPONENTS,
  clampScore,
  computeAtsOverall,
  type AtsComponentKey,
} from "@/features/ai/atsScore";
import {
  ResumeHealthSchema,
  StructuredResumeSchema,
  type AtsScoreResult,
  type ResumeHealth,
  type StructuredResume,
} from "@/features/ai/schemas";
import type {
  AICreditStatus,
  AIContext,
  AtsBreakdownItem,
  AtsScoreSummary,
} from "@/features/ai/types";
import type { Json } from "@/types/database";
import type { AuthedContext, ServerSupabase } from "@/server/supabase";
import { ContextBuilder } from "./ContextBuilder";
import { computeInputHash, runCapability } from "./AIService";
import { computeAtsDeterministic } from "./AtsDeterministic";

// ── ATS Compatibility Service (Module 6C) ──
//
// Orchestrates the HYBRID score: the deterministic parser output (formatting +
// section completeness + structure risks) is merged with the AI's contextual
// component evaluations (keyword/skills/experience/readability + qualitative
// content), and the APPLICATION — never the AI — computes the final weighted
// 0–100 score (see features/ai/atsScore.ts).
//
// Structurally parallel to ResumeMatchService (Module 6B): it reuses the same
// AI engine (runCapability → ai_cache + credits + ai_runs) and appends the same
// durable `ai_analyses` history row. The only addition is the deterministic
// blend, done here so the AI can never fabricate an ATS score.

export type GetAtsResult = {
  analysis: AtsScoreSummary | null;
  /** True when the resume or job has changed since this analysis ran. */
  stale: boolean;
  resumeName: string | null;
};

export type AnalyzeAtsResult =
  | { ok: true; analysis: AtsScoreSummary; cacheHit: boolean; credits: AICreditStatus }
  | { ok: false; code: string; message: string; credits?: AICreditStatus };

// The stored `ai_analyses.result` blob for ATS is the fully-merged public
// summary (deterministic + AI already combined and weighted at analysis time),
// so a history row is self-contained and immutable — reading it never has to
// re-run the parser or the model. `rating` is intentionally NOT stored; it is
// derived from `overallScore` at read time (see atsRatingForScore), exactly as
// the Resume Match label is.
const AtsStoredBreakdownSchema = z.object({
  key: z.string(),
  label: z.string(),
  weightPct: z.number(),
  source: z.enum(["ai", "deterministic"]),
  score: z.number(),
  detail: z.string(),
});

const AtsStoredResultSchema = z.object({
  overallScore: z.number(),
  breakdown: z.array(AtsStoredBreakdownSchema),
  matchedKeywords: z.array(z.string()),
  missingKeywords: z.array(z.string()),
  criticalMissingKeywords: z.array(z.string()),
  strengths: z.array(z.string()),
  atsRisks: z.array(z.string()),
  recommendations: z.array(z.string()),
  summary: z.string(),
});

type AtsStoredResult = z.infer<typeof AtsStoredResultSchema>;

/** Merge the deterministic + AI halves into the final weighted public summary (no id/createdAt). */
function buildStoredResult(
  ai: AtsScoreResult,
  structured: StructuredResume,
  health: ResumeHealth | null,
): AtsStoredResult {
  const det = computeAtsDeterministic(structured, health);

  const scores: Record<AtsComponentKey, number> = {
    keywordCoverage: ai.components.keywordCoverage.score,
    formatting: det.formatting.score,
    sectionCompleteness: det.sectionCompleteness.score,
    skillsAlignment: ai.components.skillsAlignment.score,
    experienceAlignment: ai.components.experienceAlignment.score,
    readability: ai.components.readability.score,
  };
  const details: Record<AtsComponentKey, string> = {
    keywordCoverage: ai.components.keywordCoverage.detail,
    formatting: det.formatting.detail,
    sectionCompleteness: det.sectionCompleteness.detail,
    skillsAlignment: ai.components.skillsAlignment.detail,
    experienceAlignment: ai.components.experienceAlignment.detail,
    readability: ai.components.readability.detail,
  };

  const breakdown = ATS_COMPONENTS.map((c) => ({
    key: c.key,
    label: c.label,
    weightPct: c.weightPct,
    source: c.source,
    score: clampScore(scores[c.key]),
    detail: details[c.key] ?? "",
  }));

  // Risks: deterministic formatting/structure risks first (most objective),
  // then the AI's content/keyword risks — de-duplicated and capped.
  const atsRisks = dedupe([...det.risks, ...ai.atsRisks]).slice(0, 8);

  return {
    overallScore: computeAtsOverall(scores),
    breakdown,
    matchedKeywords: dedupe(ai.matchedKeywords).slice(0, 30),
    missingKeywords: dedupe(ai.missingKeywords).slice(0, 30),
    criticalMissingKeywords: dedupe(ai.criticalMissingKeywords).slice(0, 15),
    strengths: ai.strengths.slice(0, 6),
    atsRisks,
    recommendations: ai.recommendations.slice(0, 6),
    summary: ai.summary,
  };
}

function dedupe(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of items) {
    const item = raw.trim();
    if (!item) continue;
    const key = item.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function toSummary(row: { id: string; result: Json; created_at: string }): AtsScoreSummary {
  const data = AtsStoredResultSchema.parse(row.result);
  return {
    id: row.id,
    overallScore: data.overallScore,
    rating: atsRatingForScore(data.overallScore),
    breakdown: data.breakdown.map((b): AtsBreakdownItem => ({
      key: b.key as AtsBreakdownItem["key"],
      label: b.label,
      weightPct: b.weightPct,
      source: b.source,
      score: b.score,
      detail: b.detail,
    })),
    matchedKeywords: data.matchedKeywords,
    missingKeywords: data.missingKeywords,
    criticalMissingKeywords: data.criticalMissingKeywords,
    strengths: data.strengths,
    atsRisks: data.atsRisks,
    recommendations: data.recommendations,
    summary: data.summary,
    createdAt: row.created_at,
  };
}

function summaryFromStored(
  id: string,
  createdAt: string,
  stored: AtsStoredResult,
): AtsScoreSummary {
  return {
    id,
    overallScore: stored.overallScore,
    rating: atsRatingForScore(stored.overallScore),
    breakdown: stored.breakdown.map((b): AtsBreakdownItem => ({
      key: b.key as AtsBreakdownItem["key"],
      label: b.label,
      weightPct: b.weightPct,
      source: b.source,
      score: b.score,
      detail: b.detail,
    })),
    matchedKeywords: stored.matchedKeywords,
    missingKeywords: stored.missingKeywords,
    criticalMissingKeywords: stored.criticalMissingKeywords,
    strengths: stored.strengths,
    atsRisks: stored.atsRisks,
    recommendations: stored.recommendations,
    summary: stored.summary,
    createdAt,
  };
}

/** Load the deterministic parse output (structured + health) for the resume. */
async function loadParsed(
  sb: ServerSupabase,
  resumeId: string,
): Promise<{ structured: StructuredResume | null; health: ResumeHealth | null }> {
  const { data, error } = await sb
    .from("resume_parsed")
    .select("structured, health")
    .eq("resume_id", resumeId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return { structured: null, health: null };
  const structured = data.structured ? StructuredResumeSchema.safeParse(data.structured) : null;
  const health = data.health ? ResumeHealthSchema.safeParse(data.health) : null;
  return {
    structured: structured?.success ? structured.data : null,
    health: health?.success ? health.data : null,
  };
}

/**
 * Read-only peek — 0 credits, no provider call. Returns the latest ATS analysis
 * for this (resume, job) pair plus whether it's stale (resume re-parsed or job
 * snapshot changed since). The stored row is self-contained, so display never
 * re-runs the parser or the model.
 */
export async function getAtsScore(
  authed: AuthedContext,
  resumeId: string,
  jobId: string,
): Promise<GetAtsResult> {
  const { supabase: sb, user } = authed;
  const cap = getCapability(AI_CAPABILITIES.ATS_SCORE);

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
    .eq("capability", AI_CAPABILITIES.ATS_SCORE)
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
    const currentInputHash = await computeInputHash(AI_CAPABILITIES.ATS_SCORE, ctx, cap);
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
 * Generate (or re-generate, with forceRefresh) an ATS Compatibility analysis.
 * Charges a credit unless the engine serves an identical-input cache hit for the
 * AI half. Every successful call appends a new `ai_analyses` row — the durable
 * history the ATS card and "View past analyses" read from.
 */
export async function analyzeAtsScore(
  authed: AuthedContext,
  resumeId: string,
  jobId: string,
  options: { forceRefresh?: boolean } = {},
): Promise<AnalyzeAtsResult> {
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
      message: "Finish resume parsing before analyzing ATS compatibility.",
    };
  }

  // Deterministic half — reads the existing parse output; no AI, no credit.
  let parsed: { structured: StructuredResume | null; health: ResumeHealth | null };
  try {
    parsed = await loadParsed(sb, resumeId);
  } catch (err) {
    return {
      ok: false,
      code: "error",
      message: err instanceof Error ? err.message : "Failed to load your resume analysis.",
    };
  }
  if (!parsed.structured) {
    return {
      ok: false,
      code: "resume_not_ready",
      message: "Finish resume parsing before analyzing ATS compatibility.",
    };
  }

  // AI half — reuses the shared engine (cache + credit gate + validation + audit).
  const result = await runCapability({
    capability: AI_CAPABILITIES.ATS_SCORE,
    authed,
    resumeId,
    jobId,
    forceRefresh: options.forceRefresh,
  });

  if (!result.ok) {
    return { ok: false, code: result.code, message: result.message, credits: result.credits };
  }

  const ai = result.data as AtsScoreResult;
  const stored = buildStoredResult(ai, parsed.structured, parsed.health);

  // The AI call already succeeded — and unless this was a cache hit, the user
  // was already charged inside runCapability. A persistence failure below must
  // never erase a paid-for result, so this never rethrows: on failure it falls
  // back to an ephemeral id/timestamp so the result still renders. It just won't
  // appear in "View past analyses" (no durable row) — acceptable, since the next
  // successful analyze persists normally. (Mirrors ResumeMatchService.)
  let analysisId: string;
  let createdAt: string;
  try {
    const { data: inserted, error: insertErr } = await sb
      .from("ai_analyses")
      .insert({
        user_id: user.id,
        capability: AI_CAPABILITIES.ATS_SCORE,
        resume_id: resumeId,
        job_id: jobId,
        resume_file_hash: result.meta.resumeFileHash,
        job_hash: result.meta.jobHash,
        input_hash: result.meta.inputHash,
        prompt_version: result.meta.promptVersion,
        analysis_version: result.meta.analysisVersion,
        model: result.meta.model,
        score: stored.overallScore,
        result: stored as unknown as Json,
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
    analysis: summaryFromStored(analysisId, createdAt, stored),
    cacheHit: result.meta.cacheHit,
    credits: result.meta.credits,
  };
}
