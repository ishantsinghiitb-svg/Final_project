import { getCapability } from "@/features/ai/capabilities";
import { AI_CAPABILITIES } from "@/features/ai/constants";
import {
  ResumeHealthSchema,
  StructuredResumeSchema,
  type StructuredResume,
} from "@/features/ai/schemas";
import type { AICreditStatus } from "@/features/ai/types";
import {
  getCareerCategory,
  resolveTargetSections,
  type CareerCategoryId,
  type OptimizeSectionId,
} from "@/features/optimizer/constants";
import { buildOptimizerPrompt, type OptimizerPromptHints } from "@/features/optimizer/prompt";
import { OptimizerResultSchema } from "@/features/optimizer/schema";
import type { OptimizationResult, OptimizationSuggestion } from "@/features/optimizer/types";
import type { Json } from "@/types/database";
import type { AuthedContext, ServerSupabase } from "@/server/supabase";
import { getProvider } from "./providers";
import { ContextBuilder } from "./ContextBuilder";
import { AICreditService } from "./AICreditService";
import { hashObject } from "./hash";
import { withRetry } from "./retry";
import { AIValidationError, toResultCode } from "./errors";

// ── Resume Optimizer Service (Module 6D) ──
//
// A dedicated capability orchestration. It deliberately does NOT call the frozen
// engine's runCapability (AI Engine) because the optimizer's inputs include a
// career CATEGORY and a SECTION selection, which the engine's resume/job-only
// context does not carry — routing those through runCapability would mean
// editing frozen code.
//
// Instead it REUSES every engine building block unchanged: the capability
// registry (model/versions/cost/cache policy via getCapability), ContextBuilder,
// the provider abstraction, the credit engine (consume/refund/getStatus), the
// content-addressed ai_cache, the ai_runs audit log, and the ai_analyses history
// table. The charge/refund/cache flow mirrors runCapability exactly.

export type AnalyzeOptimizeResult =
  | { ok: true; result: OptimizationResult; cacheHit: boolean; credits: AICreditStatus }
  | { ok: false; code: string; message: string; credits?: AICreditStatus };

type LoadedResume = {
  structured: StructuredResume;
  rawText: string;
  fileHash: string | null;
  hints: OptimizerPromptHints;
};

/** Load the parsed resume + reuse Health/ATS signals as optional prompt hints (0 credits). */
async function loadResumeForOptimize(
  sb: ServerSupabase,
  userId: string,
  resumeId: string,
): Promise<LoadedResume | null> {
  const { data, error } = await sb
    .from("resume_parsed")
    .select("structured, health, raw_text, resume_file_hash")
    .eq("resume_id", resumeId)
    .maybeSingle();
  if (error) throw error;
  if (!data || !data.structured) return null;

  const parsedStructured = StructuredResumeSchema.safeParse(data.structured);
  if (!parsedStructured.success) return null;

  const hints: OptimizerPromptHints = {};
  const health = data.health ? ResumeHealthSchema.safeParse(data.health) : null;
  if (health?.success && health.data.missing.length) {
    hints.healthMissing = health.data.missing;
  }

  // Reuse the most recent ATS analysis for this resume as extra guidance — best
  // effort, never blocks optimization.
  try {
    const { data: ats } = await sb
      .from("ai_analyses")
      .select("result")
      .eq("user_id", userId)
      .eq("resume_id", resumeId)
      .eq("capability", AI_CAPABILITIES.ATS_SCORE)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const result = ats?.result as
      | {
          recommendations?: string[];
          missingKeywords?: string[];
          criticalMissingKeywords?: string[];
        }
      | undefined;
    if (result) {
      if (Array.isArray(result.recommendations)) hints.atsRecommendations = result.recommendations;
      const missing = [
        ...(Array.isArray(result.criticalMissingKeywords) ? result.criticalMissingKeywords : []),
        ...(Array.isArray(result.missingKeywords) ? result.missingKeywords : []),
      ];
      if (missing.length) hints.atsMissingKeywords = missing;
    }
  } catch {
    /* optional context only */
  }

  return {
    structured: parsedStructured.data,
    rawText: data.raw_text ?? "",
    fileHash: data.resume_file_hash,
    hints,
  };
}

function toSuggestions(
  ai: ReturnType<typeof OptimizerResultSchema.parse>,
): OptimizationSuggestion[] {
  return (
    ai.suggestions
      // Only keep suggestions we can actually apply and review — both a real
      // `current` (to replace) and a real `suggested`. Empty ones are the model's
      // graceful-degradation fallback and carry no value in the UI.
      .filter((s) => s.current.trim().length > 0 && s.suggested.trim().length > 0)
      .map((s, i) => ({
        id: `s-${i}`,
        section: s.section,
        target: s.target,
        current: s.current.trim(),
        suggested: s.suggested.trim(),
        reason: s.reason,
        changeType: s.changeType,
      }))
  );
}

async function lookupCache(
  sb: ServerSupabase,
  userId: string,
  inputHash: string,
  promptVersion: string,
  analysisVersion: string,
  model: string,
): Promise<unknown | undefined> {
  const { data, error } = await sb
    .from("ai_cache")
    .select("response, expires_at")
    .eq("user_id", userId)
    .eq("capability", AI_CAPABILITIES.RESUME_OPTIMIZER)
    .eq("input_hash", inputHash)
    .eq("prompt_version", promptVersion)
    .eq("analysis_version", analysisVersion)
    .eq("model", model)
    .maybeSingle();
  if (error) throw error;
  if (!data) return undefined;
  if (data.expires_at && new Date(data.expires_at).getTime() < Date.now()) return undefined;
  return data.response as unknown;
}

async function writeCache(
  sb: ServerSupabase,
  userId: string,
  inputHash: string,
  promptVersion: string,
  analysisVersion: string,
  model: string,
  response: unknown,
): Promise<void> {
  const { error } = await sb.from("ai_cache").upsert(
    {
      user_id: userId,
      capability: AI_CAPABILITIES.RESUME_OPTIMIZER,
      input_hash: inputHash,
      prompt_version: promptVersion,
      analysis_version: analysisVersion,
      model,
      job_hash: null,
      response: response as Json,
      expires_at: null,
    },
    { onConflict: "user_id,capability,input_hash,prompt_version,analysis_version,model" },
  );
  if (error) throw error;
}

type RunLog = {
  status: string;
  cacheHit: boolean;
  creditsCharged: number;
  latencyMs: number;
  inputHash?: string;
  resumeId?: string;
  inputTokens?: number | null;
  outputTokens?: number | null;
  errorCode?: string;
  errorMessage?: string;
};

async function logRun(sb: ServerSupabase, userId: string, log: RunLog): Promise<void> {
  const cap = getCapability(AI_CAPABILITIES.RESUME_OPTIMIZER);
  await sb.from("ai_runs").insert({
    user_id: userId,
    capability: cap.id,
    provider: cap.provider,
    model: cap.model,
    prompt_id: cap.promptId,
    prompt_version: cap.promptVersion,
    analysis_version: cap.analysisVersion,
    input_hash: log.inputHash ?? null,
    job_hash: null,
    resume_id: log.resumeId ?? null,
    job_id: null,
    status: log.status,
    cache_hit: log.cacheHit,
    credits_charged: log.creditsCharged,
    input_tokens: log.inputTokens ?? null,
    output_tokens: log.outputTokens ?? null,
    latency_ms: log.latencyMs,
    error_code: log.errorCode ?? null,
    error_message: log.errorMessage ?? null,
  });
}

/**
 * Run a resume optimization for a career category + section selection. Charges
 * one shared AI credit unless an identical-input cache hit is served. Never
 * throws for the exhaustion case; maps all failures to a structured envelope.
 */
export async function optimizeResume(
  authed: AuthedContext,
  params: {
    resumeId: string;
    category: CareerCategoryId;
    sections: OptimizeSectionId[];
    forceRefresh?: boolean;
  },
): Promise<AnalyzeOptimizeResult> {
  const { supabase: sb, user } = authed;
  const cap = getCapability(AI_CAPABILITIES.RESUME_OPTIMIZER);
  const credits = new AICreditService(sb);
  const startedAt = Date.now();
  let chargedCost = 0;

  // ── Preconditions (no credit, no provider call) ──
  let resumeRow: { parse_status: string } | null;
  try {
    const { data, error } = await sb
      .from("resumes")
      .select("parse_status")
      .eq("id", params.resumeId)
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
  if (!resumeRow) return { ok: false, code: "resume_not_found", message: "Resume not found." };
  if (resumeRow.parse_status !== "ready") {
    return {
      ok: false,
      code: "resume_not_ready",
      message: "Finish resume parsing before optimizing.",
    };
  }

  try {
    const loaded = await loadResumeForOptimize(sb, user.id, params.resumeId);
    if (!loaded) {
      return {
        ok: false,
        code: "resume_not_ready",
        message: "Finish resume parsing before optimizing.",
      };
    }

    const category = getCareerCategory(params.category);
    const targetSections = resolveTargetSections(params.sections);
    const prompt = buildOptimizerPrompt({
      structured: loaded.structured,
      rawText: loaded.rawText,
      category,
      targetSections,
      hints: loaded.hints,
    });

    const inputHash = await hashObject({
      capability: cap.id,
      system: prompt.system,
      user: prompt.user,
      model: cap.model,
      promptVersion: cap.promptVersion,
      analysisVersion: cap.analysisVersion,
      category: category.id,
      sections: [...targetSections].sort(),
    });

    // ── Cache lookup (no charge on a hit) ──
    let aiResult: ReturnType<typeof OptimizerResultSchema.parse> | undefined;
    let cacheHit = false;
    let creditStatus: AICreditStatus;

    if (cap.cachePolicy.enabled && !params.forceRefresh) {
      const cached = await lookupCache(
        sb,
        user.id,
        inputHash,
        cap.promptVersion,
        cap.analysisVersion,
        cap.model,
      );
      if (cached !== undefined) {
        const parsed = OptimizerResultSchema.safeParse(cached);
        if (parsed.success) {
          aiResult = parsed.data;
          cacheHit = true;
        }
      }
    }

    if (aiResult) {
      creditStatus = await credits.getStatus();
      await logRun(sb, user.id, {
        status: "success",
        cacheHit: true,
        creditsCharged: 0,
        latencyMs: Date.now() - startedAt,
        inputHash,
        resumeId: params.resumeId,
      });
    } else {
      // ── Credit gate ──
      const consume = await credits.consume(cap.id, cap.creditCost);
      if (!consume.ok) {
        await logRun(sb, user.id, {
          status: "limit_reached",
          cacheHit: false,
          creditsCharged: 0,
          latencyMs: Date.now() - startedAt,
          inputHash,
          resumeId: params.resumeId,
        });
        return {
          ok: false,
          code: "ai_limit_reached",
          message: "AI usage limit reached. Upgrade required to continue.",
          credits: consume.status,
        };
      }
      chargedCost = cap.creditCost;

      // ── Provider call + validation (one repair retry) ──
      const provider = getProvider(cap.provider);
      const validated = await withRetry(
        async () => {
          const res = await provider.complete({
            system: prompt.system,
            user: prompt.user,
            model: cap.model,
            schema: OptimizerResultSchema,
            schemaName: cap.id,
          });
          const parsed = OptimizerResultSchema.safeParse(res.raw);
          if (!parsed.success) throw new AIValidationError(parsed.error.message);
          return { data: parsed.data, usage: res.usage };
        },
        { attempts: 2 },
      );

      aiResult = validated.data;
      creditStatus = consume.status;

      if (cap.cachePolicy.enabled) {
        await writeCache(
          sb,
          user.id,
          inputHash,
          cap.promptVersion,
          cap.analysisVersion,
          cap.model,
          aiResult,
        );
      }
      await logRun(sb, user.id, {
        status: "success",
        cacheHit: false,
        creditsCharged: cap.creditCost,
        latencyMs: Date.now() - startedAt,
        inputHash,
        resumeId: params.resumeId,
        inputTokens: validated.usage.inputTokens,
        outputTokens: validated.usage.outputTokens,
      });
    }

    const suggestions = toSuggestions(aiResult);

    // ── Durable history (best-effort; never erases a paid-for result) ──
    const storedResult = {
      category: category.id,
      sections: params.sections,
      suggestions,
      summary: aiResult.summary,
    };
    let analysisId: string = crypto.randomUUID();
    let createdAt: string = new Date().toISOString();
    try {
      const { data: inserted, error: insertErr } = await sb
        .from("ai_analyses")
        .insert({
          user_id: user.id,
          capability: cap.id,
          resume_id: params.resumeId,
          job_id: null,
          resume_file_hash: loaded.fileHash,
          job_hash: null,
          input_hash: inputHash,
          prompt_version: cap.promptVersion,
          analysis_version: cap.analysisVersion,
          model: cap.model,
          score: suggestions.length,
          result: storedResult as unknown as Json,
          cache_hit: cacheHit,
        })
        .select("id, created_at")
        .single();
      if (!insertErr && inserted) {
        analysisId = inserted.id;
        createdAt = inserted.created_at;
      }
    } catch {
      /* ephemeral id/timestamp fallback — result still renders */
    }

    return {
      ok: true,
      result: {
        id: analysisId,
        category: category.id,
        sections: params.sections,
        suggestions,
        summary: aiResult.summary,
        cacheHit,
        createdAt,
      },
      cacheHit,
      credits: creditStatus,
    };
  } catch (err) {
    const code = toResultCode(err);
    let status: AICreditStatus | undefined;
    try {
      if (chargedCost > 0) {
        status = await withRetry(() => credits.refund(cap.id, chargedCost), {
          attempts: 3,
          baseDelayMs: 200,
          maxDelayMs: 1000,
        });
      } else {
        status = await credits.getStatus();
      }
    } catch {
      /* best-effort */
    }
    try {
      await logRun(sb, user.id, {
        status: "error",
        cacheHit: false,
        creditsCharged: 0,
        latencyMs: Date.now() - startedAt,
        resumeId: params.resumeId,
        errorCode: code,
        errorMessage: err instanceof Error ? err.message : String(err),
      });
    } catch {
      /* best-effort */
    }
    return {
      ok: false,
      code,
      message: err instanceof Error ? err.message : "Resume optimization failed.",
      credits: status,
    };
  }
}
