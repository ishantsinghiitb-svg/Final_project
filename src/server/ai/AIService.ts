import { getCapability, type CapabilityDefinition } from "@/features/ai/capabilities";
import type { AICapability } from "@/features/ai/constants";
import type { AIContext, AICreditStatus, AIErrorResult, AIResult } from "@/features/ai/types";
import type { Json } from "@/types/database";
import type { AuthedContext, ServerSupabase } from "@/server/supabase";
import { getProvider } from "./providers";
import { ContextBuilder } from "./ContextBuilder";
import { AICreditService } from "./AICreditService";
import { buildPrompt } from "./PromptManager";
import { hashObject } from "./hash";
import { withRetry } from "./retry";
import { AIValidationError, toResultCode } from "./errors";

// ── AI Service (Module 6A) ──
//
// The single entry point for running an AI capability end-to-end:
//   build context → hash → cache lookup → credit gate → provider → validate →
//   persist (ai_cache + ai_runs) → structured envelope.
//
// It NEVER throws for the exhaustion case (returns AILimitReached) and maps all
// errors into a structured AIErrorResult. No capability is invoked by a shipped
// 6A feature — this engine is ready for 6B (and a dev smoke test).

export type RunCapabilityParams = {
  capability: AICapability;
  authed: AuthedContext;
  resumeId?: string;
  jobId?: string;
};

export async function runCapability(params: RunCapabilityParams): Promise<AIResult<unknown>> {
  const { capability, authed, resumeId, jobId } = params;
  const { supabase, user } = authed;
  const cap = getCapability(capability);
  const credits = new AICreditService(supabase);
  const startedAt = Date.now();

  try {
    // 1. Build the reusable context.
    const builder = new ContextBuilder(supabase);
    const ctx: AIContext = { user: await builder.buildUserContext(user.id) };
    if (resumeId) ctx.resume = await builder.buildResumeContext(resumeId);
    if (jobId) ctx.job = await builder.buildJobContext(jobId);

    // 2. Render prompt + compute the content-addressed input hash.
    const prompt = buildPrompt(capability, ctx);
    const inputHash = await hashObject({
      capability,
      system: prompt.system,
      user: prompt.user,
      model: cap.model,
      promptVersion: cap.promptVersion,
      analysisVersion: cap.analysisVersion,
    });
    const jobHash = ctx.job?.jobHash ?? null;

    // 3. Cache lookup (no credit charge on a hit).
    if (cap.cachePolicy.enabled) {
      const cached = await lookupCache(supabase, user.id, capability, inputHash, cap);
      if (cached !== undefined) {
        const status = await credits.getStatus();
        await logRun(supabase, {
          userId: user.id,
          cap,
          inputHash,
          jobHash,
          resumeId,
          jobId,
          status: "success",
          cacheHit: true,
          creditsCharged: 0,
          latencyMs: Date.now() - startedAt,
        });
        return success(cached, cap, status, true);
      }
    }

    // 4. Credit gate — structured lock, never a throw.
    const consume = await credits.consume(capability, cap.creditCost);
    if (!consume.ok) {
      await logRun(supabase, {
        userId: user.id,
        cap,
        inputHash,
        jobHash,
        resumeId,
        jobId,
        status: "limit_reached",
        cacheHit: false,
        creditsCharged: 0,
        latencyMs: Date.now() - startedAt,
      });
      return {
        ok: false,
        code: "ai_limit_reached",
        featureLocked: true,
        upgradeRequired: true,
        message: "AI usage limit reached. Upgrade required to continue.",
        credits: consume.status,
      };
    }

    // 5. Provider call + schema validation (one repair retry on invalid shape).
    const provider = getProvider(cap.provider);
    const validated = await withRetry(
      async () => {
        const res = await provider.complete({
          system: prompt.system,
          user: prompt.user,
          model: cap.model,
          schema: cap.outputSchema,
          schemaName: capability,
        });
        const parsed = cap.outputSchema.safeParse(res.raw);
        if (!parsed.success) throw new AIValidationError(parsed.error.message);
        return { data: parsed.data as unknown, usage: res.usage };
      },
      { attempts: 2 },
    );

    // 6. Persist cache + run.
    if (cap.cachePolicy.enabled) {
      await writeCache(supabase, user.id, capability, inputHash, jobHash, cap, validated.data);
    }
    await logRun(supabase, {
      userId: user.id,
      cap,
      inputHash,
      jobHash,
      resumeId,
      jobId,
      status: "success",
      cacheHit: false,
      creditsCharged: cap.creditCost,
      latencyMs: Date.now() - startedAt,
      inputTokens: validated.usage.inputTokens,
      outputTokens: validated.usage.outputTokens,
    });

    return success(validated.data, cap, consume.status, false);
  } catch (err) {
    const code = toResultCode(err);
    let status: AICreditStatus | undefined;
    try {
      status = await credits.getStatus();
    } catch {
      /* ignore */
    }
    try {
      await logRun(supabase, {
        userId: user.id,
        cap,
        status: "error",
        cacheHit: false,
        creditsCharged: 0,
        latencyMs: Date.now() - startedAt,
        errorCode: code,
        errorMessage: err instanceof Error ? err.message : String(err),
      });
    } catch {
      /* best-effort */
    }
    const errorResult: AIErrorResult = {
      ok: false,
      code: code as AIErrorResult["code"],
      message: err instanceof Error ? err.message : "AI request failed",
      credits: status,
    };
    return errorResult;
  }
}

function success(
  data: unknown,
  cap: CapabilityDefinition,
  credits: AICreditStatus,
  cacheHit: boolean,
): AIResult<unknown> {
  return {
    ok: true,
    code: "ok",
    data,
    meta: {
      capability: cap.id,
      provider: cap.provider,
      model: cap.model,
      cacheHit,
      promptVersion: cap.promptVersion,
      analysisVersion: cap.analysisVersion,
      credits,
    },
  };
}

async function lookupCache(
  sb: ServerSupabase,
  userId: string,
  capability: AICapability,
  inputHash: string,
  cap: CapabilityDefinition,
): Promise<unknown | undefined> {
  const { data, error } = await sb
    .from("ai_cache")
    .select("response, expires_at")
    .eq("user_id", userId)
    .eq("capability", capability)
    .eq("input_hash", inputHash)
    .eq("prompt_version", cap.promptVersion)
    .eq("analysis_version", cap.analysisVersion)
    .eq("model", cap.model)
    .maybeSingle();
  if (error) throw error;
  if (!data) return undefined;
  if (data.expires_at && new Date(data.expires_at).getTime() < Date.now()) return undefined;
  return data.response as unknown;
}

async function writeCache(
  sb: ServerSupabase,
  userId: string,
  capability: AICapability,
  inputHash: string,
  jobHash: string | null,
  cap: CapabilityDefinition,
  response: unknown,
): Promise<void> {
  const expiresAt =
    cap.cachePolicy.ttlSeconds != null
      ? new Date(Date.now() + cap.cachePolicy.ttlSeconds * 1000).toISOString()
      : null;

  const { error } = await sb.from("ai_cache").upsert(
    {
      user_id: userId,
      capability,
      input_hash: inputHash,
      prompt_version: cap.promptVersion,
      analysis_version: cap.analysisVersion,
      model: cap.model,
      job_hash: jobHash,
      response: response as Json,
      expires_at: expiresAt,
    },
    { onConflict: "user_id,capability,input_hash,prompt_version,analysis_version,model" },
  );
  if (error) throw error;
}

type RunLog = {
  userId: string;
  cap: CapabilityDefinition;
  status: string;
  cacheHit: boolean;
  creditsCharged: number;
  latencyMs: number;
  inputHash?: string;
  jobHash?: string | null;
  resumeId?: string;
  jobId?: string;
  inputTokens?: number | null;
  outputTokens?: number | null;
  errorCode?: string;
  errorMessage?: string;
};

async function logRun(sb: ServerSupabase, log: RunLog): Promise<void> {
  await sb.from("ai_runs").insert({
    user_id: log.userId,
    capability: log.cap.id,
    provider: log.cap.provider,
    model: log.cap.model,
    prompt_id: log.cap.promptId,
    prompt_version: log.cap.promptVersion,
    analysis_version: log.cap.analysisVersion,
    input_hash: log.inputHash ?? null,
    job_hash: log.jobHash ?? null,
    resume_id: log.resumeId ?? null,
    job_id: log.jobId ?? null,
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
