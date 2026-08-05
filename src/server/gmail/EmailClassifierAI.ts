import type { AuthedContext, ServerSupabase } from "@/server/supabase";
import { getCapability } from "@/features/ai/capabilities";
import { AI_CAPABILITIES } from "@/features/ai/constants";
import { getProvider } from "@/server/ai/providers";
import { withRetry } from "@/server/ai/retry";
import { AIValidationError, toResultCode } from "@/server/ai/errors";
import { GmailClassificationSchema } from "@/features/gmail/schema";
import { buildClassifyPrompt, type GmailClassifyFacts } from "@/features/gmail/prompt";
import type { GmailMessageCategory } from "@/features/gmail/types";

// ── Stage 2: AI fallback classification (Module 9A) ──
//
// Modeled directly on src/server/ai/RecommendationsService.ts — the one
// existing precedent for a free, credit-less AI capability: never imports
// AICreditService, calls getProvider(cap.provider) directly (universally
// wrapped in the standard 60s timeout + retry regardless of credit path),
// and writes its own ai_runs row with credits_charged hardcoded to 0.
//
// Deliberately does NOT return the shared AIResult<T>/AISuccessMeta envelope
// from src/features/ai/types — that type requires a non-optional `credits`
// field tied to the paid-engine contract (AIService.runCapability), which
// doesn't apply here (RecommendationsService itself doesn't use that
// envelope either, for the same reason).
//
// Called ONLY when Stage 1 (EmailClassifier, deterministic) was not
// confident — see GmailSyncService. Returns `null` on any provider/validation
// failure, exactly like a low-confidence deterministic result: no forced
// guess, ever. Sends the minimum structured facts (sender domain/display
// name, subject, Gmail's own short snippet, two booleans) — never the full
// email body, never other emails, never other user data.

async function logRun(
  sb: ServerSupabase,
  userId: string,
  status: "success" | "error",
  latencyMs: number,
  extra: {
    inputTokens?: number | null;
    outputTokens?: number | null;
    errorCode?: string;
    errorMessage?: string;
  } = {},
): Promise<void> {
  const cap = getCapability(AI_CAPABILITIES.GMAIL_CLASSIFIER);
  try {
    await sb.from("ai_runs").insert({
      user_id: userId,
      capability: cap.id,
      provider: cap.provider,
      model: cap.model,
      prompt_id: cap.promptId,
      prompt_version: cap.promptVersion,
      analysis_version: cap.analysisVersion,
      status,
      cache_hit: false,
      credits_charged: 0,
      input_tokens: extra.inputTokens ?? null,
      output_tokens: extra.outputTokens ?? null,
      latency_ms: latencyMs,
      error_code: extra.errorCode ?? null,
      error_message: extra.errorMessage ?? null,
    });
  } catch {
    /* audit logging is best-effort — must never block the sync pipeline */
  }
}

export type AIClassificationResult = { category: GmailMessageCategory; confidence: number };

export async function classifyWithAI(
  authed: AuthedContext,
  facts: GmailClassifyFacts,
): Promise<AIClassificationResult | null> {
  const { supabase: sb, user } = authed;
  const startedAt = Date.now();
  const cap = getCapability(AI_CAPABILITIES.GMAIL_CLASSIFIER);
  const prompt = buildClassifyPrompt(facts);

  try {
    const produced = await withRetry(
      async () => {
        const provider = getProvider(cap.provider);
        const res = await provider.complete({
          system: prompt.system,
          user: prompt.user,
          model: cap.model,
          schema: GmailClassificationSchema,
          schemaName: cap.id,
        });
        const parsed = GmailClassificationSchema.safeParse(res.raw);
        if (!parsed.success) {
          throw new AIValidationError("Gmail classification response was malformed.");
        }
        return { data: parsed.data, usage: res.usage };
      },
      { attempts: 2 },
    );

    await logRun(sb, user.id, "success", Date.now() - startedAt, {
      inputTokens: produced.usage.inputTokens,
      outputTokens: produced.usage.outputTokens,
    });

    return { category: produced.data.category, confidence: produced.data.confidence };
  } catch (err) {
    await logRun(sb, user.id, "error", Date.now() - startedAt, {
      errorCode: toResultCode(err),
      errorMessage: err instanceof Error ? err.message : String(err),
    });
    // No forced guess on provider/validation failure — the message simply
    // stays "unknown", exactly like an unconfident deterministic result.
    return null;
  }
}
