import { getCapability } from "@/features/ai/capabilities";
import { AI_CAPABILITIES } from "@/features/ai/constants";
import type { AICreditStatus, AIFailure, JobSnapshot } from "@/features/ai/types";
import {
  InterviewAnswerSchema,
  InterviewPrepDraftSchema,
  type InterviewAnswerDraft,
  type InterviewPrepDraft,
  type InterviewQuestionDraft,
} from "@/features/interview-prep/schema";
import {
  buildAnswerPrompt,
  buildGeneratePrompt,
  type InterviewPrepPromptInput,
  type PromptPair,
  type SupplementaryContext,
} from "@/features/interview-prep/prompt";
import type {
  GenerateInterviewAnswerResult,
  GenerateInterviewPrepResult,
  InterviewPrep,
  InterviewPrepAnswer,
  InterviewPrepContent,
  InterviewPrepProgress,
} from "@/features/interview-prep/types";
import type { Json } from "@/types/database";
import type { AuthedContext, ServerSupabase } from "@/server/supabase";
import { getProvider } from "./providers";
import { ContextBuilder } from "./ContextBuilder";
import { AICreditService } from "./AICreditService";
import { hashObject } from "./hash";
import { withRetry } from "./retry";
import { AIValidationError, toResultCode } from "./errors";

// ── Interview Preparation AI Service (Module 7B) ──
//
// A dedicated capability orchestration, for the same reason Cover Letter and
// the Resume Optimizer have one: the inputs here (an interview's round/date,
// optionally a manually-typed job description for a standalone interview) are
// not part of the frozen engine's resume/job-only context, so routing them
// through `runCapability` would mean editing frozen code.
//
// Every engine building block is reused unchanged: the capability registry
// (model / versions / cost via getCapability), ContextBuilder.buildResumeContext,
// the provider abstraction, the credit engine, the content-addressed ai_cache,
// the ai_runs audit log and the ai_analyses history table.
// ContextBuilder.buildJobContext is reused ONLY for a linked interview with a
// resolved job_id — a standalone interview (or one whose job was deleted) has
// no global_jobs row, so a synthetic JobSnapshot is assembled locally here
// from the interview's own company_name/role plus the user-supplied job
// description text. ContextBuilder.ts itself is never modified.
//
// CREDIT POLICY: unlike Cover Letter, there is NO free "regenerate" tier —
// both the first generation and an explicit Regenerate Entire Preparation
// always charge (3 credits, see AI_CREDIT_COSTS.interview_prep). What's free
// is everything INSIDE a session: reading, navigating, and generating or
// regenerating an answer for any question (see generateInterviewAnswer).
//
// Regenerating replaces `content` in place (interview_preps is 1:1 with an
// interview, not an append-only history) and re-assigns stable question/
// checklist ids (q-0, q-1, ... / c-0, c-1, ...) every time — so any existing
// interview_prep_answers rows are deleted, since a stale answer would
// otherwise silently attach to a semantically different new question.

type ResumeLoaded = {
  structured: InterviewPrepPromptInput["structured"];
  rawText: string;
  fileHash: string | null;
};

async function loadResume(
  sb: ServerSupabase,
  resumeId: string,
): Promise<{ ok: true; resume: ResumeLoaded } | AIFailure> {
  const { data: resumeRow, error: resumeErr } = await sb
    .from("resumes")
    .select("parse_status")
    .eq("id", resumeId)
    .maybeSingle();
  if (resumeErr) throw resumeErr;
  if (!resumeRow)
    return { ok: false, code: "resume_not_found", message: "That resume is no longer available." };
  if (resumeRow.parse_status !== "ready") {
    return {
      ok: false,
      code: "resume_not_ready",
      message: "Finish resume parsing before preparing for this interview.",
    };
  }

  const builder = new ContextBuilder(sb);
  const resume = await builder.buildResumeContext(resumeId);
  if (!resume) {
    return {
      ok: false,
      code: "resume_not_ready",
      message: "Finish resume parsing before preparing for this interview.",
    };
  }
  return {
    ok: true,
    resume: { structured: resume.structured, rawText: resume.rawText, fileHash: resume.fileHash },
  };
}

type JobLoaded = { jobHash: string; snapshot: JobSnapshot };

/**
 * The exact resume/job content a prep's questions were generated from —
 * frozen once at generation time (`runInterviewPrepGeneration`) and reused by
 * every later `generateInterviewAnswer` call for that same prep, the same
 * "freeze derived input once, never re-derive it" pattern
 * `mock_interview_sessions.plan` already uses for Module 7C. Without this, an
 * answer generated after the candidate re-parses their resume (or a linked
 * job posting is edited) could be grounded in different material than the
 * question it answers, with the two shown side by side as if consistent.
 *
 * `resume_file_hash`/`job_hash` (already on this row) stay fingerprints only
 * — this is the actual content they fingerprint.
 */
type InterviewPrepInputSnapshot = {
  resume: { structured: InterviewPrepPromptInput["structured"]; rawText: string };
  job: JobLoaded;
};

/** Live job context for a linked interview, or a synthetic one built from manual text. */
async function loadJob(
  sb: ServerSupabase,
  interview: { job_id: string | null; company_name: string; role: string },
  manualJobDescription: string,
  manualCompanyDescription: string | null,
): Promise<{ ok: true; job: JobLoaded } | AIFailure> {
  if (interview.job_id) {
    const builder = new ContextBuilder(sb);
    const jobCtx = await builder.buildJobContext(interview.job_id);
    if (!jobCtx)
      return { ok: false, code: "job_not_found", message: "That job is no longer available." };
    return { ok: true, job: { jobHash: jobCtx.jobHash, snapshot: jobCtx.snapshot } };
  }

  if (!manualJobDescription.trim()) {
    return {
      ok: false,
      code: "job_description_required",
      message: "Add the job description to continue.",
    };
  }

  const snapshot: JobSnapshot = {
    role: interview.role,
    companyName: interview.company_name,
    location: null,
    employmentType: null,
    workMode: null,
    experienceLevel: null,
    description: manualJobDescription.trim(),
    requirements: [],
    responsibilities: [],
    skills: [],
  };
  const jobHash = await hashObject({
    snapshot,
    companyDescription: manualCompanyDescription ?? null,
  });
  return { ok: true, job: { jobHash, snapshot } };
}

/**
 * Best-effort extraction of a short, human-readable summary from another
 * capability's stored `ai_analyses.result` — never guesses at fields that
 * aren't there, so an unfamiliar or missing shape just yields "". This is
 * deliberately loose/defensive: it reads whatever recognizable summary
 * fields exist rather than depending on any one capability's exact result
 * shape, so a future change to those schemas doesn't need a matching change
 * here to keep degrading safely.
 */
function summarizeAnalysisResult(
  result: unknown,
  kind: "resume_match" | "ats_score" | "resume_optimizer",
): string {
  if (!result || typeof result !== "object") return "";
  const r = result as Record<string, unknown>;
  const parts: string[] = [];

  if (typeof r.summary === "string" && r.summary.trim()) parts.push(r.summary.trim());
  if (typeof r.overallScore === "number") parts.push(`Overall score: ${r.overallScore}/100`);
  if (typeof r.score === "number" && typeof r.overallScore !== "number") {
    parts.push(`Score: ${r.score}/100`);
  }

  const listField = (key: string, label: string) => {
    const v = r[key];
    if (Array.isArray(v) && v.length) {
      const items = v.filter((x): x is string => typeof x === "string").slice(0, 6);
      if (items.length) parts.push(`${label}: ${items.join("; ")}`);
    }
  };

  if (kind === "resume_match") {
    listField("whatMatches", "What matches");
    listField("whatToImprove", "What to improve");
    listField("missingKeywords", "Missing keywords");
  } else if (kind === "ats_score") {
    listField("atsRisks", "ATS risks");
    listField("recommendations", "Recommendations");
    listField("missingKeywords", "Missing keywords");
  } else if (kind === "resume_optimizer") {
    listField("categoryGaps", "Category gaps");
    listField("categoryStrengths", "Category strengths");
  }

  return parts.join(". ");
}

/**
 * Optional signal only — every query here is read-only and best-effort. A
 * missing or failed lookup simply leaves that field blank, which the prompt
 * (see prompt.ts) is told means "not available", never something to guess
 * at. Does not affect credits, sessions, or the charge/refund control flow
 * at all — purely additional context gathered before building the prompt.
 */
async function loadSupplementaryContext(
  sb: ServerSupabase,
  userId: string,
  resumeId: string,
  jobId: string | null,
  interviewNotes: string | null,
): Promise<SupplementaryContext> {
  const supplementary: SupplementaryContext = {
    interviewNotes: interviewNotes?.trim() || undefined,
  };
  if (!jobId) return supplementary;

  try {
    const [matchRes, atsRes, optimizerRes, letterRes] = await Promise.all([
      sb
        .from("ai_analyses")
        .select("result")
        .eq("user_id", userId)
        .eq("capability", "resume_match")
        .eq("resume_id", resumeId)
        .eq("job_id", jobId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      sb
        .from("ai_analyses")
        .select("result")
        .eq("user_id", userId)
        .eq("capability", "ats_score")
        .eq("resume_id", resumeId)
        .eq("job_id", jobId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      sb
        .from("ai_analyses")
        .select("result")
        .eq("user_id", userId)
        .eq("capability", "resume_optimizer")
        .eq("resume_id", resumeId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      sb
        .from("cover_letters")
        .select("content, company_name, role_title")
        .eq("user_id", userId)
        .eq("resume_id", resumeId)
        .eq("job_id", jobId)
        .eq("source", "studio")
        .not("content", "is", null)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    if (matchRes.data?.result) {
      supplementary.resumeMatchSummary = summarizeAnalysisResult(
        matchRes.data.result,
        "resume_match",
      );
    }
    if (atsRes.data?.result) {
      supplementary.atsSummary = summarizeAnalysisResult(atsRes.data.result, "ats_score");
    }
    if (optimizerRes.data?.result) {
      supplementary.optimizerSummary = summarizeAnalysisResult(
        optimizerRes.data.result,
        "resume_optimizer",
      );
    }
    if (letterRes.data?.content) {
      supplementary.coverLetterSummary = String(letterRes.data.content).slice(0, 1200);
    }
  } catch {
    /* best-effort — a failed lookup here must never block or fail generation */
  }

  return supplementary;
}

/** Server-authoritative gate for a free (session-covered) action — mirrors CoverLetterAIService. */
async function requireActiveSession(
  sb: ServerSupabase,
  interviewPrepId: string,
): Promise<{ ok: true } | AIFailure> {
  const { data, error } = await sb
    .from("interview_preps")
    .select("id, ai_session_id")
    .eq("id", interviewPrepId)
    .maybeSingle();
  if (error) throw error;
  if (!data || !data.ai_session_id) {
    return {
      ok: false,
      code: "session_required",
      message: "Generate this preparation first.",
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
    .eq("capability", AI_CAPABILITIES.INTERVIEW_PREP)
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
      capability: AI_CAPABILITIES.INTERVIEW_PREP,
      input_hash: inputHash,
      prompt_version: promptVersion,
      analysis_version: analysisVersion,
      model,
      job_hash: jobHash,
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
  jobHash?: string | null;
  resumeId?: string | null;
  jobId?: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  errorCode?: string;
  errorMessage?: string;
};

/** Returns the new row's id — the error path needs it to request a refund tied to this exact run. */
async function logRun(sb: ServerSupabase, userId: string, log: RunLog): Promise<string> {
  const cap = getCapability(AI_CAPABILITIES.INTERVIEW_PREP);
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

/** Never trust the model's own id text — re-assign stable, predictable ids. */
function assignStableIds(draft: InterviewPrepDraft): InterviewPrepDraft {
  return {
    ...draft,
    questions: draft.questions.map((q, i) => ({ ...q, id: `q-${i}` })),
    checklist: draft.checklist.map((c, i) => ({ ...c, id: `c-${i}` })),
  };
}

function mapPrepRow(row: Record<string, unknown>): InterviewPrep {
  return {
    id: row.id as string,
    interview_id: row.interview_id as string,
    user_id: row.user_id as string,
    manual_job_description: (row.manual_job_description as string | null) ?? null,
    manual_company_description: (row.manual_company_description as string | null) ?? null,
    additional_context: (row.additional_context as string | null) ?? null,
    content: (row.content as InterviewPrepContent | null) ?? null,
    model: (row.model as string | null) ?? null,
    prompt_version: (row.prompt_version as string | null) ?? null,
    analysis_version: (row.analysis_version as string | null) ?? null,
    ai_session_id: (row.ai_session_id as string | null) ?? null,
    ai_session_started_at: (row.ai_session_started_at as string | null) ?? null,
    // Defensive against a stored progress value that's truthy but incomplete
    // (an empty `{}` bypasses a plain `??` fallback since it's neither null
    // nor undefined) — normalize checklistChecked to an array unconditionally.
    progress: {
      checklistChecked: (row.progress as InterviewPrepProgress | null)?.checklistChecked ?? [],
    },
    generated_at: (row.generated_at as string | null) ?? null,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

function mapAnswerRow(row: Record<string, unknown>): InterviewPrepAnswer {
  return {
    id: row.id as string,
    interview_prep_id: row.interview_prep_id as string,
    question_id: row.question_id as string,
    answer: row.answer as string,
    ai_generated: row.ai_generated as boolean,
    last_generated_at: (row.last_generated_at as string | null) ?? null,
    edited_at: (row.edited_at as string | null) ?? null,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

export type RunInterviewPrepGenerationParams = {
  interviewId: string;
  manualJobDescription?: string;
  manualCompanyDescription?: string;
  additionalContext?: string;
};

/**
 * Generate or Regenerate Entire Preparation. Always charges (no free tier for
 * a full generation — see the credit policy note above). Maps every failure
 * into a structured envelope and refunds the credit if a charged run
 * ultimately fails.
 */
export async function runInterviewPrepGeneration(
  authed: AuthedContext,
  params: RunInterviewPrepGenerationParams,
): Promise<GenerateInterviewPrepResult> {
  const { supabase: sb, user } = authed;
  const cap = getCapability(AI_CAPABILITIES.INTERVIEW_PREP);
  const credits = new AICreditService(sb);
  const startedAt = Date.now();
  let chargedCost = 0;
  let resumeIdForLog: string | null = null;
  let jobIdForLog: string | null = null;

  try {
    const { data: interview, error: interviewErr } = await sb
      .from("interviews")
      .select("id, resume_id, job_id, company_name, role, type, scheduled_at, notes")
      .eq("id", params.interviewId)
      .maybeSingle();
    if (interviewErr) throw interviewErr;
    if (!interview) {
      return { ok: false, code: "interview_not_found", message: "Interview not found." };
    }
    resumeIdForLog = interview.resume_id;
    jobIdForLog = interview.job_id;

    if (!interview.resume_id) {
      return {
        ok: false,
        code: "resume_required",
        message: "Pick a resume to personalize this preparation.",
      };
    }

    const { data: existingPrep, error: prepErr } = await sb
      .from("interview_preps")
      .select("id, manual_job_description, manual_company_description, additional_context")
      .eq("interview_id", interview.id)
      .maybeSingle();
    if (prepErr) throw prepErr;
    const isRegenerate = Boolean(existingPrep);

    const resumeResult = await loadResume(sb, interview.resume_id);
    if (!resumeResult.ok) return resumeResult;
    const { resume } = resumeResult;

    const manualJobDescription = (
      params.manualJobDescription ??
      existingPrep?.manual_job_description ??
      ""
    ).trim();
    const manualCompanyDescription =
      (params.manualCompanyDescription ?? existingPrep?.manual_company_description ?? "").trim() ||
      null;
    // Independent of job_id (unlike manualJobDescription/manualCompanyDescription,
    // which only apply to standalone interviews) — always reused across regenerate.
    const additionalContext =
      (params.additionalContext ?? existingPrep?.additional_context ?? "").trim() || null;

    const jobResult = await loadJob(sb, interview, manualJobDescription, manualCompanyDescription);
    if (!jobResult.ok) return jobResult;
    const { job } = jobResult;

    const supplementary = await loadSupplementaryContext(
      sb,
      user.id,
      interview.resume_id,
      interview.job_id,
      interview.notes,
    );

    const promptInput: InterviewPrepPromptInput = {
      structured: resume.structured,
      rawText: resume.rawText,
      job: job.snapshot,
      companyDescription: manualCompanyDescription ?? undefined,
      round: interview.type ?? "",
      scheduledAt: interview.scheduled_at,
      additionalContext: additionalContext ?? undefined,
      supplementary,
    };
    const prompt: PromptPair = buildGeneratePrompt(promptInput);

    const inputHash = await hashObject({
      capability: cap.id,
      system: prompt.system,
      user: prompt.user,
      model: cap.model,
      promptVersion: cap.promptVersion,
      analysisVersion: cap.analysisVersion,
    });

    // Only the very first generation can hit the cache — every explicit
    // Regenerate must produce genuinely new content.
    let draft: InterviewPrepDraft | undefined;
    let cacheHit = false;
    if (cap.cachePolicy.enabled && !isRegenerate) {
      const cached = await lookupCache(
        sb,
        user.id,
        inputHash,
        cap.promptVersion,
        cap.analysisVersion,
        cap.model,
      );
      if (cached !== undefined) {
        const parsed = InterviewPrepDraftSchema.safeParse(cached);
        if (parsed.success) {
          draft = parsed.data;
          cacheHit = true;
        }
      }
    }

    let creditStatus: AICreditStatus;
    let usage: { inputTokens: number | null; outputTokens: number | null } = {
      inputTokens: null,
      outputTokens: null,
    };
    let rawForCache: unknown;

    if (draft) {
      creditStatus = await credits.getStatus();
    } else {
      const consume = await credits.consume(cap.id, cap.creditCost);
      if (!consume.ok) {
        await logRun(sb, user.id, {
          status: "limit_reached",
          cacheHit: false,
          creditsCharged: 0,
          latencyMs: Date.now() - startedAt,
          inputHash,
          jobHash: job.jobHash,
          resumeId: resumeIdForLog,
          jobId: jobIdForLog,
        });
        return {
          ok: false,
          code: "ai_limit_reached",
          message: "AI usage limit reached. Upgrade required to continue.",
          credits: consume.status,
        };
      }
      chargedCost = cap.creditCost;
      creditStatus = consume.status;

      const provider = getProvider(cap.provider);
      const produced = await withRetry(
        async () => {
          const res = await provider.complete({
            system: prompt.system,
            user: prompt.user,
            model: cap.model,
            schema: InterviewPrepDraftSchema,
            schemaName: cap.id,
          });
          const parsed = InterviewPrepDraftSchema.safeParse(res.raw);
          if (!parsed.success) {
            throw new AIValidationError("Interview preparation response was malformed.");
          }
          return { data: parsed.data, raw: res.raw, usage: res.usage };
        },
        { attempts: 2 },
      );
      draft = produced.data;
      usage = produced.usage;
      rawForCache = produced.raw;

      if (cap.cachePolicy.enabled) {
        await writeCache(
          sb,
          user.id,
          inputHash,
          job.jobHash,
          cap.promptVersion,
          cap.analysisVersion,
          cap.model,
          rawForCache,
        );
      }
    }

    const stableDraft = assignStableIds(draft);
    const { internal, ...content } = stableDraft;

    const inputSnapshot: InterviewPrepInputSnapshot = {
      resume: { structured: resume.structured, rawText: resume.rawText },
      job,
    };

    const newSessionId = crypto.randomUUID();
    const prepId = existingPrep?.id ?? crypto.randomUUID();
    const nowIso = new Date().toISOString();

    const { data: savedPrep, error: upsertErr } = await sb
      .from("interview_preps")
      .upsert(
        {
          id: prepId,
          interview_id: interview.id,
          user_id: user.id,
          manual_job_description: interview.job_id ? null : manualJobDescription,
          manual_company_description: interview.job_id ? null : manualCompanyDescription,
          additional_context: additionalContext,
          content: content as unknown as Json,
          reasoning: internal as unknown as Json,
          model: cap.model,
          prompt_version: cap.promptVersion,
          analysis_version: cap.analysisVersion,
          resume_file_hash: resume.fileHash,
          job_hash: job.jobHash,
          input_hash: inputHash,
          input_snapshot: inputSnapshot as unknown as Json,
          ai_session_id: newSessionId,
          ai_session_started_at: nowIso,
          // Reset on every generation: question/checklist ids are re-assigned
          // each time, so any prior checklist-checked state no longer maps to
          // anything meaningful. Must be the FULL default shape, not `{}` —
          // `mapPrepRow`'s `??` fallback only covers a null/undefined column,
          // and an empty object is neither, so `{}` here left
          // `progress.checklistChecked` undefined on every fresh read.
          progress: { checklistChecked: [] } as unknown as Json,
          generated_at: nowIso,
        },
        { onConflict: "interview_id" },
      )
      .select()
      .single();
    if (upsertErr) throw upsertErr;

    // Stale answers point at question ids that no longer mean the same thing
    // after a regenerate — best-effort (the generation itself already
    // succeeded and must not be undone by a cleanup failure), but real: this
    // is what stops a leftover answer from silently attaching to a different
    // question.
    if (isRegenerate) {
      try {
        await sb.from("interview_prep_answers").delete().eq("interview_prep_id", prepId);
      } catch {
        /* best-effort cleanup — see comment above */
      }
    }

    await logRun(sb, user.id, {
      status: "success",
      cacheHit,
      creditsCharged: chargedCost,
      latencyMs: Date.now() - startedAt,
      inputHash,
      jobHash: job.jobHash,
      resumeId: resumeIdForLog,
      jobId: jobIdForLog,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
    });

    // Best-effort durable history (never erases a paid-for result).
    try {
      await sb.from("ai_analyses").insert({
        user_id: user.id,
        capability: cap.id,
        resume_id: interview.resume_id,
        job_id: interview.job_id,
        resume_file_hash: resume.fileHash,
        job_hash: job.jobHash,
        input_hash: inputHash,
        prompt_version: cap.promptVersion,
        analysis_version: cap.analysisVersion,
        model: cap.model,
        score: null,
        result: { content, reasoning: internal } as unknown as Json,
        cache_hit: cacheHit,
      });
    } catch {
      /* history is best-effort — the preparation itself is still returned */
    }

    return {
      ok: true,
      generation: {
        prep: mapPrepRow(savedPrep),
        sessionId: newSessionId,
        cacheHit,
        creditsCharged: chargedCost,
      },
      credits: creditStatus,
    };
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
        resumeId: resumeIdForLog,
        jobId: jobIdForLog,
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
      message: err instanceof Error ? err.message : "Interview preparation generation failed.",
      credits: status,
      creditsRefunded: chargedCost === 0 || refunded ? true : undefined,
    };
  }
}

export type GenerateInterviewAnswerParams = {
  interviewPrepId: string;
  questionId: string;
  regenerate?: boolean;
};

/**
 * Generate or Regenerate an answer for one question. Free whenever the
 * preparation has an active editing session — never charges, never refunds.
 */
export async function generateInterviewAnswer(
  authed: AuthedContext,
  params: GenerateInterviewAnswerParams,
): Promise<GenerateInterviewAnswerResult> {
  const { supabase: sb, user } = authed;
  const cap = getCapability(AI_CAPABILITIES.INTERVIEW_PREP);
  const startedAt = Date.now();

  const session = await requireActiveSession(sb, params.interviewPrepId);
  if (!session.ok) return { ok: false, code: session.code, message: session.message };

  try {
    const { data: prepRow, error: prepErr } = await sb
      .from("interview_preps")
      .select(
        "id, interview_id, content, manual_job_description, manual_company_description, additional_context, input_snapshot",
      )
      .eq("id", params.interviewPrepId)
      .maybeSingle();
    if (prepErr) throw prepErr;
    if (!prepRow) {
      return { ok: false, code: "interview_not_found", message: "Preparation not found." };
    }

    const content = prepRow.content as unknown as InterviewPrepContent | null;
    const targetQuestion: InterviewQuestionDraft | undefined = content?.questions.find(
      (q) => q.id === params.questionId,
    );
    if (!targetQuestion) {
      return {
        ok: false,
        code: "question_not_found",
        message: "That question is no longer available.",
      };
    }

    const { data: interview, error: interviewErr } = await sb
      .from("interviews")
      .select("id, resume_id, job_id, company_name, role, type, scheduled_at, notes")
      .eq("id", prepRow.interview_id)
      .maybeSingle();
    if (interviewErr) throw interviewErr;
    if (!interview)
      return { ok: false, code: "interview_not_found", message: "Interview not found." };
    if (!interview.resume_id) {
      return { ok: false, code: "resume_required", message: "Pick a resume to continue." };
    }

    // Reuse the exact resume/job content the prep's questions were generated
    // from, not whatever is live now — see InterviewPrepInputSnapshot. Only a
    // prep generated before this snapshot existed falls back to a live load;
    // that isn't a new inconsistency (it's the prior, unfixed behavior for
    // rows that never captured one), and there is nothing to freeze
    // retroactively for them.
    const snapshot = prepRow.input_snapshot as unknown as InterviewPrepInputSnapshot | null;
    let resume: { structured: InterviewPrepPromptInput["structured"]; rawText: string };
    let job: JobLoaded;

    if (snapshot) {
      resume = snapshot.resume;
      job = snapshot.job;
    } else {
      const resumeResult = await loadResume(sb, interview.resume_id);
      if (!resumeResult.ok) return resumeResult;
      resume = resumeResult.resume;

      const jobResult = await loadJob(
        sb,
        interview,
        prepRow.manual_job_description ?? "",
        prepRow.manual_company_description,
      );
      if (!jobResult.ok) return jobResult;
      job = jobResult.job;
    }

    const supplementary = await loadSupplementaryContext(
      sb,
      user.id,
      interview.resume_id,
      interview.job_id,
      interview.notes,
    );

    const promptInput: InterviewPrepPromptInput = {
      structured: resume.structured,
      rawText: resume.rawText,
      job: job.snapshot,
      companyDescription: prepRow.manual_company_description ?? undefined,
      round: interview.type ?? "",
      scheduledAt: interview.scheduled_at,
      additionalContext: prepRow.additional_context ?? undefined,
      supplementary,
    };
    const prompt = buildAnswerPrompt({
      ...promptInput,
      targetQuestion,
      allQuestions: content?.questions ?? [],
    });

    const inputHash = await hashObject({
      capability: cap.id,
      system: prompt.system,
      user: prompt.user,
      model: cap.model,
      promptVersion: cap.promptVersion,
      analysisVersion: cap.analysisVersion,
      questionId: targetQuestion.id,
    });

    let draft: InterviewAnswerDraft | undefined;
    let cacheHit = false;
    if (cap.cachePolicy.enabled && !params.regenerate) {
      const cached = await lookupCache(
        sb,
        user.id,
        inputHash,
        cap.promptVersion,
        cap.analysisVersion,
        cap.model,
      );
      if (cached !== undefined) {
        const parsed = InterviewAnswerSchema.safeParse(cached);
        if (parsed.success) {
          draft = parsed.data;
          cacheHit = true;
        }
      }
    }

    let usage: { inputTokens: number | null; outputTokens: number | null } = {
      inputTokens: null,
      outputTokens: null,
    };

    if (!draft) {
      const provider = getProvider(cap.provider);
      const produced = await withRetry(
        async () => {
          const res = await provider.complete({
            system: prompt.system,
            user: prompt.user,
            model: cap.model,
            schema: InterviewAnswerSchema,
            schemaName: `${cap.id}_answer`,
          });
          const parsed = InterviewAnswerSchema.safeParse(res.raw);
          if (!parsed.success)
            throw new AIValidationError("Interview answer response was malformed.");
          return { data: parsed.data, raw: res.raw, usage: res.usage };
        },
        { attempts: 2 },
      );
      draft = produced.data;
      usage = produced.usage;

      if (cap.cachePolicy.enabled) {
        await writeCache(
          sb,
          user.id,
          inputHash,
          job.jobHash,
          cap.promptVersion,
          cap.analysisVersion,
          cap.model,
          produced.raw,
        );
      }
    }

    const { data: savedAnswer, error: answerErr } = await sb
      .from("interview_prep_answers")
      .upsert(
        {
          interview_prep_id: prepRow.id,
          user_id: user.id,
          question_id: targetQuestion.id,
          answer: draft.answer,
          ai_generated: true,
          last_generated_at: new Date().toISOString(),
          edited_at: null,
          model: cap.model,
          prompt_version: cap.promptVersion,
        },
        { onConflict: "interview_prep_id,question_id" },
      )
      .select()
      .single();
    if (answerErr) throw answerErr;

    await logRun(sb, user.id, {
      status: "success",
      cacheHit,
      creditsCharged: 0,
      latencyMs: Date.now() - startedAt,
      inputHash,
      jobHash: job.jobHash,
      resumeId: interview.resume_id,
      jobId: interview.job_id,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
    });

    return { ok: true, answer: mapAnswerRow(savedAnswer), draft };
  } catch (err) {
    const code = toResultCode(err);
    try {
      await logRun(sb, user.id, {
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
    return {
      ok: false,
      code,
      message: err instanceof Error ? err.message : "Could not generate that answer.",
    };
  }
}
