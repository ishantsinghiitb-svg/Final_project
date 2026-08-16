import { getCapability } from "@/features/ai/capabilities";
import { AI_CAPABILITIES } from "@/features/ai/constants";
import type { AICreditStatus, AIFailure } from "@/features/ai/types";
import {
  CoverLetterDraftSchema,
  CoverLetterExplanationSchema,
  CoverLetterRewriteSchema,
  draftToText,
} from "@/features/cover-letters/schema";
import {
  buildExplainPrompt,
  buildGeneratePrompt,
  buildSectionActionPrompt,
  buildWholeLetterActionPrompt,
  isSectionAction,
  type CoverLetterPromptInput,
  type PromptPair,
} from "@/features/cover-letters/prompt";
import {
  COVER_LETTER_AI_ACTIONS,
  MAX_LETTER_CHARS,
  sanitizeCustomInstructions,
  type CoverLetterAIAction,
  type CoverLetterLength,
  type CoverLetterTone,
} from "@/features/cover-letters/constants";
import { normalizeLetterText, replaceSection } from "@/features/cover-letters/sections";
import type {
  CoverLetterAIResult,
  CoverLetterExplanation,
  CoverLetterGeneration,
  ExplainCoverLetterResult,
} from "@/features/cover-letters/types";
import type { Json } from "@/types/database";
import type { AuthedContext, ServerSupabase } from "@/server/supabase";
import { getProvider } from "./providers";
import { ContextBuilder } from "./ContextBuilder";
import { AICreditService } from "./AICreditService";
import { hashObject } from "./hash";
import { withRetry } from "./retry";
import { AIValidationError, toResultCode } from "./errors";

// ── Cover Letter AI Service (Module 6E) ──
//
// A dedicated capability orchestration, for the same reason the Resume
// Optimizer has one: the Studio's inputs (tone, length, custom instructions,
// the CURRENT editor text, and which AI action to run) are not part of the
// frozen engine's resume/job-only context, so routing them through
// `runCapability` would mean editing frozen code.
//
// Every engine building block is reused unchanged: the capability registry
// (model / versions / cost / cache policy via getCapability), ContextBuilder,
// the provider abstraction, the credit engine (consume / refund / getStatus),
// the content-addressed ai_cache, the ai_runs audit log and the ai_analyses
// history table. The charge/refund/cache flow mirrors runCapability exactly.
//
// CREDIT POLICY — editing session model (foundation refinement):
//   • Generating a letter, or explicitly Regenerating the Entire Letter,
//     charges 1 credit and opens/rotates an "editing session" on the document
//     (`cover_letters.ai_session_id`).
//   • Every other AI action (rewrite a section, change tone/length, grammar,
//     persuasive, simplify, highlight achievements, explain AI decisions) is
//     FREE as long as the document has an active session — it is a refinement
//     of a letter the user already paid for, not a new generation.
//   • The session check is server-authoritative: a free action always
//     re-reads `ai_session_id` from the document before waiving the charge,
//     so a client can never manufacture free access.
// Editing, undo/redo, saving, versioning, renaming, duplicating and exporting
// remain entirely local and free — unrelated to this gate.

type Loaded = {
  promptBase: Omit<CoverLetterPromptInput, "tone" | "length" | "customInstructions">;
  resumeFileHash: string | null;
  jobHash: string;
  companyName: string | null;
  roleTitle: string | null;
};

/** Load resume + job context. Returns a structured failure instead of throwing. */
async function loadContext(
  sb: ServerSupabase,
  resumeId: string,
  jobId: string,
): Promise<{ ok: true; loaded: Loaded } | AIFailure> {
  const { data: resumeRow, error: resumeErr } = await sb
    .from("resumes")
    .select("parse_status")
    .eq("id", resumeId)
    .maybeSingle();
  if (resumeErr) throw resumeErr;
  if (!resumeRow) return { ok: false, code: "resume_not_found", message: "Resume not found." };
  if (resumeRow.parse_status !== "ready") {
    return {
      ok: false,
      code: "resume_not_ready",
      message: "Finish resume parsing before writing a cover letter.",
    };
  }

  const builder = new ContextBuilder(sb);
  const [resume, job] = await Promise.all([
    builder.buildResumeContext(resumeId),
    builder.buildJobContext(jobId),
  ]);

  if (!resume) {
    return {
      ok: false,
      code: "resume_not_ready",
      message: "Finish resume parsing before writing a cover letter.",
    };
  }
  if (!job) return { ok: false, code: "job_not_found", message: "Job not found." };

  return {
    ok: true,
    loaded: {
      promptBase: { structured: resume.structured, rawText: resume.rawText, job: job.snapshot },
      resumeFileHash: resume.fileHash,
      jobHash: job.jobHash,
      companyName: job.snapshot.companyName,
      roleTitle: job.snapshot.role,
    },
  };
}

/**
 * Server-authoritative gate for a free (session-covered) action: the document
 * must exist and must already carry a non-null `ai_session_id`. Read-only —
 * opening/rotating a session only ever happens on a CHARGED call.
 */
async function requireActiveSession(
  sb: ServerSupabase,
  coverLetterId: string | undefined,
): Promise<{ ok: true } | AIFailure> {
  if (!coverLetterId) {
    return {
      ok: false,
      code: "session_required",
      message: "Generate this letter first.",
    };
  }
  const { data, error } = await sb
    .from("cover_letters")
    .select("id, ai_session_id")
    .eq("id", coverLetterId)
    .maybeSingle();
  if (error) throw error;
  if (!data || !data.ai_session_id) {
    return {
      ok: false,
      code: "session_required",
      message: "Start a new generation to continue editing this letter.",
    };
  }
  return { ok: true };
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
    .eq("capability", AI_CAPABILITIES.COVER_LETTER)
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
  jobHash: string | null,
  promptVersion: string,
  analysisVersion: string,
  model: string,
  response: unknown,
): Promise<void> {
  const { error } = await sb.from("ai_cache").upsert(
    {
      user_id: userId,
      capability: AI_CAPABILITIES.COVER_LETTER,
      input_hash: inputHash,
      prompt_version: promptVersion,
      analysis_version: analysisVersion,
      model,
      job_hash: jobHash,
      response: response as Json,
      // Hardcoded, NOT read from `cap.cachePolicy.ttlSeconds` — unlike
      // AIService.writeCache. Identical in effect today (every capability's
      // ttlSeconds is null), but a future non-null TTL would be silently
      // ignored here. See the warning on CachePolicy.ttlSeconds.
      expires_at: null,
    },
    { onConflict: "user_id,capability,input_hash,prompt_version,analysis_version,model" },
  );
  if (error) throw error;
}

/** Rotate the document's editing session — called only on a CHARGED event. */
async function openSession(sb: ServerSupabase, coverLetterId: string, sessionId: string) {
  await sb
    .from("cover_letters")
    .update({ ai_session_id: sessionId, ai_session_started_at: new Date().toISOString() })
    .eq("id", coverLetterId);
}

type RunLog = {
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

/** Returns the new row's id — the error path needs it to request a refund tied to this exact run. */
async function logRun(sb: ServerSupabase, userId: string, log: RunLog): Promise<string> {
  const cap = getCapability(AI_CAPABILITIES.COVER_LETTER);
  const { data, error } = await sb
    .from("ai_runs")
    .insert({
      user_id: userId,
      capability: cap.id,
      provider: cap.provider,
      model: cap.model,
      prompt_id: cap.promptId,
      prompt_version: cap.promptVersion,
      analysis_version: cap.analysisVersion,
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
    })
    .select("id")
    .single();
  if (error) throw error;
  return (data as { id: string }).id;
}

export type RunCoverLetterParams = {
  resumeId: string;
  jobId: string;
  tone: CoverLetterTone;
  length: CoverLetterLength;
  customInstructions?: string;
  /**
   * Omitted for the first generation. Every explicit Regenerate / AI action
   * passes one, which also forces a fresh provider call (see `forceRefresh`).
   */
  action?: CoverLetterAIAction;
  /** The letter as it stands in the editor — required for every action. */
  content?: string;
  /**
   * The document this call applies to. Required for every action (the server
   * checks its session before waiving a charge); absent for the very first
   * generation, where the document doesn't exist yet.
   */
  coverLetterId?: string;
  /**
   * Skip the ai_cache lookup. Always set for actions and explicit regenerates:
   * a user asking for a new letter must never be handed back the identical
   * cached one. The first generation of a given (resume, job, settings) tuple
   * still benefits from the cache.
   */
  forceRefresh?: boolean;
};

/**
 * Run one cover-letter AI call — a full generation or a single AI action.
 * Charges one shared AI credit only for a "start of session" event (the first
 * generation, or an explicit Regenerate Entire Letter); every other action
 * reuses the active session for free. Never throws for the exhaustion case;
 * maps all failures into a structured envelope, refunding the credit when a
 * charged run ultimately fails.
 */
export async function runCoverLetterAI(
  authed: AuthedContext,
  params: RunCoverLetterParams,
): Promise<CoverLetterAIResult> {
  const { supabase: sb, user } = authed;
  const cap = getCapability(AI_CAPABILITIES.COVER_LETTER);
  const credits = new AICreditService(sb);
  const startedAt = Date.now();
  let chargedCost = 0;

  const action = params.action;
  const currentContent = normalizeLetterText(params.content ?? "").slice(0, MAX_LETTER_CHARS);
  if (action && !currentContent) {
    return {
      ok: false,
      code: "empty_letter",
      message: "There is nothing to edit yet. Generate a letter first.",
    };
  }

  // A "start of session" event: the very first generation, or an explicit
  // Regenerate Entire Letter. Everything else is a refinement of a letter the
  // user already paid for.
  const chargesCredit = !action || action === COVER_LETTER_AI_ACTIONS.REGENERATE_ALL;

  if (!chargesCredit) {
    const session = await requireActiveSession(sb, params.coverLetterId);
    if (!session.ok) return { ok: false, code: session.code, message: session.message };
  }

  try {
    const ctx = await loadContext(sb, params.resumeId, params.jobId);
    if (!ctx.ok) return { ok: false, code: ctx.code, message: ctx.message };
    const { loaded } = ctx;

    const promptInput: CoverLetterPromptInput = {
      ...loaded.promptBase,
      tone: params.tone,
      length: params.length,
      customInstructions: sanitizeCustomInstructions(params.customInstructions),
    };

    const sectionAction = action ? isSectionAction(action) : false;
    let prompt: PromptPair;
    if (!action) {
      prompt = buildGeneratePrompt(promptInput);
    } else if (sectionAction) {
      prompt = buildSectionActionPrompt({ ...promptInput, action, content: currentContent });
    } else {
      prompt = buildWholeLetterActionPrompt({ ...promptInput, action, content: currentContent });
    }

    const inputHash = await hashObject({
      capability: cap.id,
      system: prompt.system,
      user: prompt.user,
      model: cap.model,
      promptVersion: cap.promptVersion,
      analysisVersion: cap.analysisVersion,
      action: action ?? "generate",
      tone: params.tone,
      length: params.length,
    });

    // `reasoning` is the model's Phase 1-4 analysis + instruction accounting +
    // pre-return checks. It is stored on the ai_analyses row for quality
    // debugging and NEVER returned to the client or rendered — see schema.ts.
    const parseResponse = (
      raw: unknown,
    ): { content: string; note: string; reasoning: Json | null } | null => {
      if (sectionAction) {
        const parsed = CoverLetterRewriteSchema.safeParse(raw);
        if (!parsed.success) return null;
        const text = normalizeLetterText(parsed.data.text);
        if (!text) return null;
        const section =
          action === COVER_LETTER_AI_ACTIONS.REGENERATE_INTRO
            ? "intro"
            : action === COVER_LETTER_AI_ACTIONS.REGENERATE_BODY
              ? "body"
              : "closing";
        return {
          content: replaceSection(currentContent, section, text),
          note: parsed.data.note,
          reasoning: {
            narrative: parsed.data.narrative,
            instructionsApplied: parsed.data.instructionsApplied,
          } as unknown as Json,
        };
      }
      const parsed = CoverLetterDraftSchema.safeParse(raw);
      if (!parsed.success) return null;
      const text = normalizeLetterText(draftToText(parsed.data));
      if (!text) return null;
      return {
        content: text,
        note: parsed.data.note,
        reasoning: parsed.data.internal as unknown as Json,
      };
    };

    const callProvider = () => {
      const provider = getProvider(cap.provider);
      const schema = sectionAction ? CoverLetterRewriteSchema : CoverLetterDraftSchema;
      return withRetry(
        async () => {
          const res = await provider.complete({
            system: prompt.system,
            user: prompt.user,
            model: cap.model,
            schema,
            schemaName: cap.id,
          });
          const mapped = parseResponse(res.raw);
          if (!mapped) throw new AIValidationError("Cover letter response was empty or malformed.");
          return { mapped, raw: res.raw, usage: res.usage };
        },
        { attempts: 2 },
      );
    };

    // ── Cache lookup (no charge on a hit) ──
    // Only the first generation can hit: every action sets forceRefresh, so a
    // "Regenerate" always produces genuinely new text rather than a replay.
    let content: string | undefined;
    let note = "";
    let reasoning: Json | null = null;
    let cacheHit = false;
    let creditStatus: AICreditStatus;
    let creditsChargedThisCall = 0;
    /** Non-null only when this call opens/rotates the session (a charged event). */
    let newSessionId: string | null = null;

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
        const mapped = parseResponse(cached);
        if (mapped) {
          content = mapped.content;
          note = mapped.note;
          reasoning = mapped.reasoning;
          cacheHit = true;
        }
      }
    }

    if (content !== undefined) {
      // Cache hit — free, but still a "start of session" event (chargesCredit
      // is true here; a free action never sets forceRefresh:false, so it can
      // never reach this branch).
      creditStatus = await credits.getStatus();
      newSessionId = crypto.randomUUID();
      await logRun(sb, user.id, {
        status: "success",
        cacheHit: true,
        creditsCharged: 0,
        latencyMs: Date.now() - startedAt,
        inputHash,
        jobHash: loaded.jobHash,
        resumeId: params.resumeId,
        jobId: params.jobId,
      });
    } else if (chargesCredit) {
      // ── Charged path: fresh generation or Regenerate Entire Letter ──
      const consume = await credits.consume(cap.id, cap.creditCost);
      if (!consume.ok) {
        await logRun(sb, user.id, {
          status: "limit_reached",
          cacheHit: false,
          creditsCharged: 0,
          latencyMs: Date.now() - startedAt,
          inputHash,
          jobHash: loaded.jobHash,
          resumeId: params.resumeId,
          jobId: params.jobId,
        });
        return {
          ok: false,
          code: "ai_limit_reached",
          message: "AI usage limit reached. Upgrade required to continue.",
          credits: consume.status,
        };
      }
      chargedCost = cap.creditCost;

      const produced = await callProvider();
      content = produced.mapped.content;
      note = produced.mapped.note;
      reasoning = produced.mapped.reasoning;
      creditStatus = consume.status;
      creditsChargedThisCall = cap.creditCost;
      newSessionId = crypto.randomUUID();

      if (cap.cachePolicy.enabled) {
        await writeCache(
          sb,
          user.id,
          inputHash,
          loaded.jobHash,
          cap.promptVersion,
          cap.analysisVersion,
          cap.model,
          produced.raw,
        );
      }
      await logRun(sb, user.id, {
        status: "success",
        cacheHit: false,
        creditsCharged: cap.creditCost,
        latencyMs: Date.now() - startedAt,
        inputHash,
        jobHash: loaded.jobHash,
        resumeId: params.resumeId,
        jobId: params.jobId,
        inputTokens: produced.usage.inputTokens,
        outputTokens: produced.usage.outputTokens,
      });
    } else {
      // ── Free path: a refinement action inside an already-active session ──
      creditStatus = await credits.getStatus();

      const produced = await callProvider();
      content = produced.mapped.content;
      note = produced.mapped.note;
      reasoning = produced.mapped.reasoning;

      if (cap.cachePolicy.enabled) {
        await writeCache(
          sb,
          user.id,
          inputHash,
          loaded.jobHash,
          cap.promptVersion,
          cap.analysisVersion,
          cap.model,
          produced.raw,
        );
      }
      await logRun(sb, user.id, {
        status: "success",
        cacheHit: false,
        creditsCharged: 0,
        latencyMs: Date.now() - startedAt,
        inputHash,
        jobHash: loaded.jobHash,
        resumeId: params.resumeId,
        jobId: params.jobId,
        inputTokens: produced.usage.inputTokens,
        outputTokens: produced.usage.outputTokens,
      });
    }

    // Only ROTATE the stored session when the document already exists — the
    // very first generation has no document yet; its session id is returned
    // to the client, which opens the session at document-creation time
    // (see CoverLetterService.createFromGeneration).
    if (newSessionId && params.coverLetterId) {
      await openSession(sb, params.coverLetterId, newSessionId);
    }

    const finalContent = (content ?? "").slice(0, MAX_LETTER_CHARS);

    // ── Durable history (best-effort; never erases a paid-for result) ──
    let analysisId: string | null = null;
    try {
      const { data: inserted } = await sb
        .from("ai_analyses")
        .insert({
          user_id: user.id,
          capability: cap.id,
          resume_id: params.resumeId,
          job_id: params.jobId,
          resume_file_hash: loaded.resumeFileHash,
          job_hash: loaded.jobHash,
          input_hash: inputHash,
          prompt_version: cap.promptVersion,
          analysis_version: cap.analysisVersion,
          model: cap.model,
          score: null,
          result: {
            action: action ?? "generate",
            tone: params.tone,
            length: params.length,
            customInstructions: sanitizeCustomInstructions(params.customInstructions) ?? null,
            companyName: loaded.companyName,
            roleTitle: loaded.roleTitle,
            content: finalContent,
            note,
            // The model's own analysis (narrative chosen, instructions honored,
            // pre-return checks). Stored for quality debugging across Phase 2
            // prompt iterations; never surfaced to the user.
            reasoning,
          } as unknown as Json,
          cache_hit: cacheHit,
        })
        .select("id")
        .single();
      analysisId = inserted?.id ?? null;
    } catch {
      /* history is best-effort — the letter itself is still returned */
    }

    const generation: CoverLetterGeneration = {
      content: finalContent,
      tone: params.tone,
      length: params.length,
      note,
      analysisId,
      model: cap.model,
      promptVersion: cap.promptVersion,
      analysisVersion: cap.analysisVersion,
      cacheHit,
      creditsCharged: creditsChargedThisCall,
      generationMs: Date.now() - startedAt,
      sessionId: newSessionId,
    };

    return { ok: true, generation, credits: creditStatus };
  } catch (err) {
    const code = toResultCode(err);
    let status: AICreditStatus | undefined;
    let refunded = false;
    // The refund RPC is ai_run_id-scoped, so the audit row must exist first.
    let runId: string | undefined;
    try {
      runId = await logRun(sb, user.id, {
        status: "error",
        cacheHit: false,
        creditsCharged: chargedCost,
        latencyMs: Date.now() - startedAt,
        resumeId: params.resumeId,
        jobId: params.jobId,
        errorCode: code,
        errorMessage: err instanceof Error ? err.message : String(err),
      });
    } catch {
      /* best-effort */
    }
    try {
      if (chargedCost > 0 && runId) {
        status = await withRetry(() => credits.refund(runId!), {
          attempts: 3,
          baseDelayMs: 200,
          maxDelayMs: 1000,
        });
        refunded = true;
      } else {
        status = await credits.getStatus();
      }
    } catch {
      /* best-effort */
    }
    return {
      ok: false,
      code,
      message: err instanceof Error ? err.message : "Cover letter generation failed.",
      credits: status,
      creditsRefunded: chargedCost === 0 || refunded ? true : undefined,
    };
  }
}

// ── Explain AI Decisions (foundation refinement) ──
//
// A read-only insight, not a rewrite: explains the tone/structure/highlights
// reflected in the CURRENT letter text. Free whenever the document has an
// active editing session — same gate as the other refinement actions. Never
// charges or refunds a credit, so there is no charged-path error handling to
// mirror from the main function.

export type ExplainCoverLetterServiceParams = {
  coverLetterId: string;
  content: string;
  resumeId: string;
  jobId: string;
  tone: CoverLetterTone;
  length: CoverLetterLength;
  customInstructions?: string;
};

export async function explainCoverLetterAI(
  authed: AuthedContext,
  params: ExplainCoverLetterServiceParams,
): Promise<ExplainCoverLetterResult> {
  const { supabase: sb, user } = authed;
  const cap = getCapability(AI_CAPABILITIES.COVER_LETTER);
  const startedAt = Date.now();

  const currentContent = normalizeLetterText(params.content).slice(0, MAX_LETTER_CHARS);
  if (!currentContent) {
    return {
      ok: false,
      code: "empty_letter",
      message: "There is nothing to explain yet. Generate a letter first.",
    };
  }

  const session = await requireActiveSession(sb, params.coverLetterId);
  if (!session.ok) return { ok: false, code: session.code, message: session.message };

  try {
    const ctx = await loadContext(sb, params.resumeId, params.jobId);
    if (!ctx.ok) return { ok: false, code: ctx.code, message: ctx.message };
    const { loaded } = ctx;

    const promptInput: CoverLetterPromptInput = {
      ...loaded.promptBase,
      tone: params.tone,
      length: params.length,
      customInstructions: sanitizeCustomInstructions(params.customInstructions),
    };
    const prompt = buildExplainPrompt({ ...promptInput, content: currentContent });

    const inputHash = await hashObject({
      capability: cap.id,
      system: prompt.system,
      user: prompt.user,
      model: cap.model,
      promptVersion: cap.promptVersion,
      analysisVersion: cap.analysisVersion,
      action: "explain",
      content: currentContent,
    });

    let explanation: CoverLetterExplanation | undefined;

    if (cap.cachePolicy.enabled) {
      const cached = await lookupCache(
        sb,
        user.id,
        inputHash,
        cap.promptVersion,
        cap.analysisVersion,
        cap.model,
      );
      if (cached !== undefined) {
        const parsed = CoverLetterExplanationSchema.safeParse(cached);
        if (parsed.success) explanation = parsed.data;
      }
    }

    if (explanation) {
      await logRun(sb, user.id, {
        status: "success",
        cacheHit: true,
        creditsCharged: 0,
        latencyMs: Date.now() - startedAt,
        inputHash,
        jobHash: loaded.jobHash,
        resumeId: params.resumeId,
        jobId: params.jobId,
      });
    } else {
      const provider = getProvider(cap.provider);
      const validated = await withRetry(
        async () => {
          const res = await provider.complete({
            system: prompt.system,
            user: prompt.user,
            model: cap.model,
            schema: CoverLetterExplanationSchema,
            schemaName: `${cap.id}_explain`,
          });
          const parsed = CoverLetterExplanationSchema.safeParse(res.raw);
          if (!parsed.success) throw new AIValidationError("Explanation response was malformed.");
          return { data: parsed.data, usage: res.usage };
        },
        { attempts: 2 },
      );
      explanation = validated.data;

      if (cap.cachePolicy.enabled) {
        await writeCache(
          sb,
          user.id,
          inputHash,
          loaded.jobHash,
          cap.promptVersion,
          cap.analysisVersion,
          cap.model,
          explanation,
        );
      }
      await logRun(sb, user.id, {
        status: "success",
        cacheHit: false,
        creditsCharged: 0,
        latencyMs: Date.now() - startedAt,
        inputHash,
        jobHash: loaded.jobHash,
        resumeId: params.resumeId,
        jobId: params.jobId,
        inputTokens: validated.usage.inputTokens,
        outputTokens: validated.usage.outputTokens,
      });
    }

    return { ok: true, explanation };
  } catch (err) {
    const code = toResultCode(err);
    try {
      await logRun(sb, user.id, {
        status: "error",
        cacheHit: false,
        creditsCharged: 0,
        latencyMs: Date.now() - startedAt,
        resumeId: params.resumeId,
        jobId: params.jobId,
        errorCode: code,
        errorMessage: err instanceof Error ? err.message : String(err),
      });
    } catch {
      /* best-effort */
    }
    return {
      ok: false,
      code,
      message: err instanceof Error ? err.message : "Could not explain this letter.",
    };
  }
}
