import { getCapability } from "@/features/ai/capabilities";
import { AI_CAPABILITIES } from "@/features/ai/constants";
import type { AICreditStatus, AIFailure, JobSnapshot } from "@/features/ai/types";
import {
  MOCK_INTERVIEW_MAX_ANSWER_CHARS,
  MOCK_INTERVIEW_MAX_LIVE_MS,
  MOCK_INTERVIEW_MAX_REPORT_ATTEMPTS,
  MOCK_INTERVIEW_MAX_TURNS,
  MOCK_INTERVIEW_RESUME_WINDOW_DAYS,
} from "@/features/mock-interview/constants";
import { getInterviewerRole, resolveRoleFamily } from "@/features/mock-interview/interviewerRoles";
import { countConsecutiveFollowUps } from "@/features/mock-interview/followUps";
import {
  buildPlanPrompt,
  buildReportPrompt,
  buildTurnPrompt,
  type MockInterviewSupplementaryContext,
} from "@/features/mock-interview/prompt";
import {
  MockInterviewPlanSchema,
  MockInterviewReportSchema,
  MockInterviewTurnSchema,
  type CompetencyMapEntry,
  type MockInterviewPlan,
  type MockInterviewReportDraft,
} from "@/features/mock-interview/schema";
import { elapsedMs, isPastResumeWindow } from "@/features/mock-interview/timer";
import type {
  AnswerInputMode,
  CoverageEntry,
  EndMockInterviewParams,
  EndMockInterviewResult,
  GenerateReportResult,
  MockInterviewPlanContent,
  MockInterviewReportContent,
  MockInterviewSession,
  MockInterviewTurn,
  PauseResumeResult,
  StartMockInterviewParams,
  StartMockInterviewResult,
  SubmitAnswerParams,
  SubmitAnswerResult,
} from "@/features/mock-interview/types";
import type { Json, MockInterviewSessionRow } from "@/types/database";
import type { AuthedContext, ServerSupabase } from "@/server/supabase";
import { getProvider } from "./providers";
import { AICreditService } from "./AICreditService";
import { hashObject } from "./hash";
import { withRetry } from "./retry";
import {
  loadJobForMockInterview,
  loadMockInterviewSupplementaryContext,
  loadResumeForMockInterview,
  type JobLoaded,
  type ResumeLoaded,
} from "./MockInterviewContext";
import { AIValidationError, toResultCode } from "./errors";

// ── Mock Interview Studio AI Service (Module 7C) ──
//
// A dedicated orchestration, same rationale as Cover Letter, the Resume
// Optimizer, and 7B Interview Preparation: a live, multi-turn conversation
// does not fit AIService.runCapability's one-shot build-context/cache/call
// shape. Every reusable building block is still reused unchanged: the
// capability registry (getCapability), ContextBuilder (via
// MockInterviewContext.ts), the provider abstraction, the credit engine, and
// the ai_runs audit log. Caching is OFF for this capability by design — see
// the NO_CACHE comment in features/ai/capabilities.ts.
//
// ── THE credit invariant ──
// AICreditService.consume is called at EXACTLY ONE site in this entire file:
// inside startMockInterview. Every other exported function passes
// creditsCharged: 0 to logRun and never touches consume/refund. This is
// asserted by MockInterviewAIService.test.ts across a full multi-turn run —
// see [[module7c-mock-interview]] before changing that invariant.
//
// ── Session lifecycle ──
// Unlike interview_preps (1:1 with an interview), MANY mock_interview_sessions
// rows exist per interview — each Start is its own paid session with its own
// report, so history is never overwritten. A session's free actions
// (submitAnswer, pause, resume, generateReport) are authorized by the session
// row existing, belonging to the caller (RLS), and being in a permitting
// status — re-verified server-side on every call, never trusted from the
// client.

function isUniqueViolation(err: unknown): boolean {
  return Boolean(
    err && typeof err === "object" && "code" in err && (err as { code?: string }).code === "23505",
  );
}

function fail<TCode extends string>(code: TCode, message: string): AIFailure<TCode> {
  return { ok: false, code, message };
}

/** Narrows a raw session row to exactly the fields timer.ts's pure functions read — avoids a blanket `as never` at each call site. */
function timerFields(
  row: Record<string, unknown>,
): Pick<MockInterviewSession, "status" | "elapsed_ms" | "last_resumed_at" | "updated_at"> {
  return {
    status: row.status as MockInterviewSession["status"],
    elapsed_ms: Number(row.elapsed_ms ?? 0),
    last_resumed_at: (row.last_resumed_at as string | null) ?? null,
    updated_at: row.updated_at as string,
  };
}

// ── Row <-> domain mapping (mirrors InterviewPrepRepository's mapRow) ──

function mapSessionRow(row: Record<string, unknown>): MockInterviewSession {
  return {
    id: row.id as string,
    interview_id: row.interview_id as string,
    user_id: row.user_id as string,
    interviewer_role: row.interviewer_role as string,
    interviewer_role_label: row.interviewer_role_label as string,
    role_family: row.role_family as string,
    round_label: (row.round_label as string | null) ?? null,
    focus: (row.focus as string | null) ?? null,
    manual_job_description: (row.manual_job_description as string | null) ?? null,
    manual_company_description: (row.manual_company_description as string | null) ?? null,
    plan: (row.plan as MockInterviewPlanContent | null) ?? null,
    status: row.status as MockInterviewSession["status"],
    ended_reason: (row.ended_reason as MockInterviewSession["ended_reason"]) ?? null,
    started_at: row.started_at as string,
    elapsed_ms: Number(row.elapsed_ms ?? 0),
    last_resumed_at: (row.last_resumed_at as string | null) ?? null,
    ended_at: (row.ended_at as string | null) ?? null,
    turn_count: Number(row.turn_count ?? 0),
    coverage: (row.coverage as { competencies: CoverageEntry[] } | null) ?? { competencies: [] },
    report: (row.report as MockInterviewReportContent | null) ?? null,
    report_generated_at: (row.report_generated_at as string | null) ?? null,
    report_attempts: Number(row.report_attempts ?? 0),
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

function mapTurnRow(row: Record<string, unknown>): MockInterviewTurn {
  return {
    id: row.id as string,
    session_id: row.session_id as string,
    turn_index: Number(row.turn_index),
    interviewer_message: row.interviewer_message as string,
    action: (row.action as MockInterviewTurn["action"]) ?? null,
    target_competency: (row.target_competency as MockInterviewTurn["target_competency"]) ?? null,
    references_turn: row.references_turn == null ? null : Number(row.references_turn),
    candidate_answer: (row.candidate_answer as string | null) ?? null,
    answer_input_mode: (row.answer_input_mode as AnswerInputMode | null) ?? null,
    answered_at: (row.answered_at as string | null) ?? null,
    created_at: row.created_at as string,
  };
}

type RunLog = {
  status: string;
  creditsCharged: number;
  latencyMs: number;
  inputHash?: string | null;
  resumeId?: string | null;
  jobId?: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  errorCode?: string;
  errorMessage?: string;
};

async function logRun(sb: ServerSupabase, userId: string, log: RunLog): Promise<void> {
  const cap = getCapability(AI_CAPABILITIES.MOCK_INTERVIEW);
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
    job_id: log.jobId ?? null,
    status: log.status,
    cache_hit: false,
    credits_charged: log.creditsCharged,
    input_tokens: log.inputTokens ?? null,
    output_tokens: log.outputTokens ?? null,
    latency_ms: log.latencyMs,
    error_code: log.errorCode ?? null,
    error_message: log.errorMessage ?? null,
  });
}

async function fetchInterview(sb: ServerSupabase, interviewId: string) {
  const { data, error } = await sb
    .from("interviews")
    .select("id, resume_id, job_id, company_name, role, type, notes")
    .eq("id", interviewId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function fetchSessionRow(
  sb: ServerSupabase,
  sessionId: string,
): Promise<Record<string, unknown> | null> {
  const { data, error } = await sb
    .from("mock_interview_sessions")
    .select("*")
    .eq("id", sessionId)
    .maybeSingle();
  if (error) throw error;
  return data as Record<string, unknown> | null;
}

async function fetchSessionTurns(
  sb: ServerSupabase,
  sessionId: string,
): Promise<Record<string, unknown>[]> {
  const { data, error } = await sb
    .from("mock_interview_turns")
    .select("*")
    .eq("session_id", sessionId)
    .order("turn_index", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Record<string, unknown>[];
}

async function buildStartSuccess(sb: ServerSupabase, sessionId: string) {
  const sessionRow = await fetchSessionRow(sb, sessionId);
  if (!sessionRow) throw new Error("Mock interview session vanished immediately after creation.");
  const { data: openingRow, error } = await sb
    .from("mock_interview_turns")
    .select("*")
    .eq("session_id", sessionId)
    .eq("turn_index", 0)
    .maybeSingle();
  if (error) throw error;
  if (!openingRow) throw new Error("Mock interview opening turn is missing.");
  return {
    session: mapSessionRow(sessionRow),
    openingTurn: mapTurnRow(openingRow as Record<string, unknown>),
    creditsCharged: Number(sessionRow.credits_charged ?? 0),
  };
}

// ════════════════════════════════════════════════════════════════════════
// Phase 1 — Start (the ONLY charged call)
// ════════════════════════════════════════════════════════════════════════

export async function startMockInterview(
  authed: AuthedContext,
  params: StartMockInterviewParams,
): Promise<StartMockInterviewResult> {
  const { supabase: sb, user } = authed;
  const cap = getCapability(AI_CAPABILITIES.MOCK_INTERVIEW);
  const credits = new AICreditService(sb);
  const startedAt = Date.now();
  let chargedCost = 0;
  let resumeIdForLog: string | null = null;
  let jobIdForLog: string | null = null;

  try {
    // ── Idempotency: a retried/duplicated Start returns the existing session, never a second charge. ──
    const { data: existing, error: existingErr } = await sb
      .from("mock_interview_sessions")
      .select("id")
      .eq("user_id", user.id)
      .eq("client_key", params.clientKey)
      .maybeSingle();
    if (existingErr) throw existingErr;
    if (existing) {
      const start = await buildStartSuccess(sb, existing.id);
      const status = await credits.getStatus();
      return { ok: true, start, credits: status };
    }

    const role = getInterviewerRole(params.interviewerRole);
    if (!role) return fail("invalid_interviewer_role", "That interviewer role is not available.");

    const interview = await fetchInterview(sb, params.interviewId);
    if (!interview) return fail("interview_not_found", "Interview not found.");
    resumeIdForLog = interview.resume_id;
    jobIdForLog = interview.job_id;
    if (!interview.resume_id) {
      return fail("resume_required", "Pick a resume to personalize this mock interview.");
    }

    const resumeResult = await loadResumeForMockInterview(sb, interview.resume_id);
    if (!resumeResult.ok) return resumeResult;
    const { resume } = resumeResult as { ok: true; resume: ResumeLoaded };

    const manualJobDescription = (params.manualJobDescription ?? "").trim();
    const manualCompanyDescription = (params.manualCompanyDescription ?? "").trim() || null;

    const jobResult = await loadJobForMockInterview(
      sb,
      interview,
      manualJobDescription,
      manualCompanyDescription,
    );
    if (!jobResult.ok) return jobResult;
    const { job } = jobResult as { ok: true; job: JobLoaded };

    const supplementary: MockInterviewSupplementaryContext =
      await loadMockInterviewSupplementaryContext(
        sb,
        user.id,
        interview.resume_id,
        interview.job_id,
        interview.id,
        interview.notes,
      );

    const roleFamily = resolveRoleFamily(interview.role, job.snapshot.description ?? "");
    const focus = params.focus?.trim() || undefined;

    const prompt = buildPlanPrompt({
      structured: resume.structured,
      rawText: resume.rawText,
      job: job.snapshot,
      companyDescription: manualCompanyDescription ?? undefined,
      round: interview.type ?? "",
      interviewerRole: role,
      focus,
      supplementary,
      // The session's client_key — stable across an idempotent Start replay
      // (so a retry re-plans identically) but different for every real
      // session, which is what varies the opening. See openingStyleForSeed.
      variationSeed: params.clientKey,
    });

    const inputHash = await hashObject({
      capability: cap.id,
      phase: "plan",
      system: prompt.system,
      user: prompt.user,
      model: cap.model,
      promptVersion: cap.promptVersion,
      analysisVersion: cap.analysisVersion,
    });

    // ── THE one charge site in this module. ──
    const consume = await credits.consume(cap.id, cap.creditCost);
    if (!consume.ok) {
      await logRun(sb, user.id, {
        status: "limit_reached",
        creditsCharged: 0,
        latencyMs: Date.now() - startedAt,
        inputHash,
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

    const provider = getProvider(cap.provider);
    const produced = await withRetry(
      async () => {
        const res = await provider.complete({
          system: prompt.system,
          user: prompt.user,
          model: cap.model,
          schema: MockInterviewPlanSchema,
          schemaName: `${cap.id}_plan`,
        });
        const parsed = MockInterviewPlanSchema.safeParse(res.raw);
        if (!parsed.success)
          throw new AIValidationError("Mock interview plan response was malformed.");
        return { data: parsed.data as MockInterviewPlan, usage: res.usage };
      },
      { attempts: 2 },
    );
    const plan = produced.data;

    const coverage: CoverageEntry[] = plan.competencyMap.map((c: CompetencyMapEntry) => ({
      competencyId: c.id,
      status: "not_started",
    }));

    const planContent: MockInterviewPlanContent = {
      candidateProfile: plan.candidateProfile,
      interviewerBrief: plan.interviewerBrief,
      competencyMap: plan.competencyMap,
      // Carried into the stored plan so every live turn can see the arc it is
      // supposed to be walking — without it the turn prompt has competencies
      // but no sense of interview *shape*, which is what produced the abrupt
      // cold opens this pass fixes.
      plannedArc: plan.plannedArc,
      targetTurnRange: plan.targetTurnRange,
      expectedDurationMinutes: plan.expectedDurationMinutes,
    };

    const sessionId = crypto.randomUUID();
    const nowIso = new Date().toISOString();
    const { error: insertSessionErr } = await sb.from("mock_interview_sessions").insert({
      id: sessionId,
      interview_id: interview.id,
      user_id: user.id,
      client_key: params.clientKey,
      interviewer_role: role.id,
      interviewer_role_label: role.label,
      role_family: roleFamily,
      round_label: interview.type ?? null,
      focus: focus ?? null,
      manual_job_description: interview.job_id ? null : manualJobDescription || null,
      manual_company_description: interview.job_id ? null : manualCompanyDescription,
      plan: planContent as unknown as Json,
      plan_reasoning: plan.internal as unknown as Json,
      status: "active",
      started_at: nowIso,
      elapsed_ms: 0,
      last_resumed_at: nowIso,
      turn_count: 0,
      coverage: { competencies: coverage } as unknown as Json,
      rolling_summary: "",
      model: cap.model,
      prompt_version: cap.promptVersion,
      analysis_version: cap.analysisVersion,
      resume_file_hash: resume.fileHash,
      job_hash: job.jobHash,
      credits_charged: chargedCost,
    });
    if (insertSessionErr) throw insertSessionErr;

    // Find a sensible initial focus for the opening turn: the first "core"
    // competency if one was planned, else whatever came first.
    const openingCompetency =
      plan.competencyMap.find((c: CompetencyMapEntry) => c.priority === "core")?.id ??
      plan.competencyMap[0]?.id ??
      null;

    const { error: insertTurnErr } = await sb.from("mock_interview_turns").insert({
      session_id: sessionId,
      user_id: user.id,
      turn_index: 0,
      interviewer_message: plan.openingMessage,
      action: "open",
      target_competency: openingCompetency,
      references_turn: null,
      candidate_answer: null,
      answer_input_mode: null,
      answered_at: null,
      evaluation: null,
    });
    if (insertTurnErr) throw insertTurnErr;

    await logRun(sb, user.id, {
      status: "success",
      creditsCharged: chargedCost,
      latencyMs: Date.now() - startedAt,
      inputHash,
      resumeId: resumeIdForLog,
      jobId: jobIdForLog,
      inputTokens: produced.usage.inputTokens,
      outputTokens: produced.usage.outputTokens,
    });

    const start = await buildStartSuccess(sb, sessionId);
    return { ok: true, start, credits: consume.status };
  } catch (err) {
    // A genuine race on the (user_id, client_key) unique index: the OTHER
    // concurrent request already holds the real session. Refund below (this
    // request's charge is a duplicate), then hand back the winning session
    // instead of a bare error — a double-click should not read as a failure
    // when the interview actually started fine.
    if (isUniqueViolation(err) && chargedCost > 0) {
      try {
        const { data: winner } = await sb
          .from("mock_interview_sessions")
          .select("id")
          .eq("user_id", user.id)
          .eq("client_key", params.clientKey)
          .maybeSingle();
        if (winner) {
          const status = await withRetry(() => credits.refund(cap.id, chargedCost), {
            attempts: 3,
            baseDelayMs: 200,
            maxDelayMs: 1000,
          });
          const start = await buildStartSuccess(sb, winner.id);
          return { ok: true, start, credits: status };
        }
      } catch {
        /* fall through to the standard error handling below */
      }
    }

    const code = toResultCode(err);
    let status: AICreditStatus | undefined;
    let refunded = false;
    try {
      if (chargedCost > 0) {
        status = await withRetry(() => credits.refund(cap.id, chargedCost), {
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
    try {
      await logRun(sb, user.id, {
        status: "error",
        creditsCharged: 0,
        latencyMs: Date.now() - startedAt,
        resumeId: resumeIdForLog,
        jobId: jobIdForLog,
        errorCode: code,
        errorMessage:
          (err instanceof Error ? err.message : String(err)) +
          (refunded ? " (credit refunded)" : ""),
      });
    } catch {
      /* best-effort */
    }
    return {
      ok: false,
      code,
      message: err instanceof Error ? err.message : "Could not start the mock interview.",
      credits: status,
      creditsRefunded: chargedCost === 0 || refunded ? true : undefined,
    };
  }
}

// ════════════════════════════════════════════════════════════════════════
// Phase 2 — Live turn (free, never charges/refunds)
// ════════════════════════════════════════════════════════════════════════

function mergeCoverage(
  existing: CoverageEntry[],
  updates: { competencyId: string; status: string }[],
): CoverageEntry[] {
  const merged = [...existing];
  for (const u of updates) {
    const idx = merged.findIndex((c) => c.competencyId === u.competencyId);
    const entry = { competencyId: u.competencyId, status: u.status } as CoverageEntry;
    if (idx >= 0) merged[idx] = entry;
    else merged.push(entry);
  }
  return merged;
}

export async function submitAnswer(
  authed: AuthedContext,
  params: SubmitAnswerParams,
): Promise<SubmitAnswerResult> {
  const { supabase: sb, user } = authed;
  const cap = getCapability(AI_CAPABILITIES.MOCK_INTERVIEW);
  const startedAt = Date.now();

  try {
    const sessionRow = await fetchSessionRow(sb, params.sessionId);
    if (!sessionRow) return fail("session_not_found", "Mock interview session not found.");
    if (sessionRow.status === "paused")
      return fail("session_paused", "Resume the interview to continue.");
    if (sessionRow.status === "concluded")
      return fail("session_ended", "This interview has already ended.");
    if (sessionRow.status === "failed")
      return fail("session_ended", "This interview session cannot continue.");

    const { data: turnRow, error: turnErr } = await sb
      .from("mock_interview_turns")
      .select("*")
      .eq("session_id", params.sessionId)
      .eq("turn_index", params.turnIndex)
      .maybeSingle();
    if (turnErr) throw turnErr;
    if (!turnRow) return fail("turn_not_found", "That question is no longer available.");

    const { data: successorRow, error: successorErr } = await sb
      .from("mock_interview_turns")
      .select("*")
      .eq("session_id", params.sessionId)
      .eq("turn_index", params.turnIndex + 1)
      .maybeSingle();
    if (successorErr) throw successorErr;

    // Idempotent replay: this exact answer was already processed — return the
    // result that already exists rather than calling the AI (or double-billing
    // conversational state) a second time.
    if (turnRow.candidate_answer != null && successorRow) {
      return {
        ok: true,
        submission: {
          answeredTurn: mapTurnRow(turnRow as Record<string, unknown>),
          nextTurn: mapTurnRow(successorRow as Record<string, unknown>),
          session: mapSessionRow(sessionRow),
        },
      };
    }

    // Save the answer if it hasn't been saved yet (first attempt). If it HAS
    // been saved but there's no successor, a prior request crashed between
    // saving the answer and generating the next turn — recover by continuing
    // from here without re-saving (and without losing the original answer).
    let answeredTurnRow = turnRow;
    if (turnRow.candidate_answer == null) {
      if (params.inputMode !== "skipped" && !params.answer.trim()) {
        return fail("answer_required", "Type or say an answer, or skip this question.");
      }
      const answer = params.answer.trim().slice(0, MOCK_INTERVIEW_MAX_ANSWER_CHARS);
      const nowIso = new Date().toISOString();
      const { data: updated, error: updateErr } = await sb
        .from("mock_interview_turns")
        .update({
          candidate_answer: answer,
          answer_input_mode: params.inputMode,
          answered_at: nowIso,
        })
        .eq("id", turnRow.id)
        .select()
        .single();
      if (updateErr) throw updateErr;
      answeredTurnRow = updated;
    }

    const plan = sessionRow.plan as MockInterviewPlanContent | null;
    if (!plan) throw new Error("Mock interview session is missing its plan.");
    const role = getInterviewerRole(sessionRow.interviewer_role as string);
    if (!role) throw new Error("Mock interview session references an unknown interviewer role.");

    const allTurns = await fetchSessionTurns(sb, params.sessionId);
    const transcript = allTurns.map((t) => ({
      turn_index: Number(t.turn_index),
      interviewer_message: t.interviewer_message as string,
      candidate_answer: (t.candidate_answer as string | null) ?? null,
    }));

    const answeredCount =
      Number(sessionRow.turn_count ?? 0) + (turnRow.candidate_answer == null ? 1 : 0);
    const hardLimitBreached =
      answeredCount >= MOCK_INTERVIEW_MAX_TURNS ||
      elapsedMs(timerFields(sessionRow)) >= MOCK_INTERVIEW_MAX_LIVE_MS;

    const prompt = buildTurnPrompt({
      interviewerRole: role,
      candidateProfile: plan.candidateProfile,
      competencyMap: plan.competencyMap,
      coverage:
        (sessionRow.coverage as { competencies: CoverageEntry[] } | null)?.competencies ?? [],
      plannedArc: plan.plannedArc ?? [],
      rollingSummary: (sessionRow.rolling_summary as string | null) ?? "",
      targetTurnRange: plan.targetTurnRange,
      expectedDurationMinutes: plan.expectedDurationMinutes,
      answeredTurnCount: answeredCount,
      // Counted from the stored transcript rather than tracked by the model —
      // see followUps.ts. `allTurns` is ordered by turn_index ascending.
      followUpsUsedOnCurrentThread: countConsecutiveFollowUps(
        allTurns.map((t) => ({ action: (t.action as string | null) ?? null })),
      ),
      transcript,
      focus: (sessionRow.focus as string | null) ?? undefined,
    });

    const inputHash = await hashObject({
      capability: cap.id,
      phase: "turn",
      system: prompt.system,
      user: prompt.user,
      model: cap.model,
      promptVersion: cap.promptVersion,
      analysisVersion: cap.analysisVersion,
      turnIndex: params.turnIndex,
    });

    const provider = getProvider(cap.provider);
    const produced = await withRetry(
      async () => {
        const res = await provider.complete({
          system: prompt.system,
          user: prompt.user,
          model: cap.model,
          schema: MockInterviewTurnSchema,
          schemaName: `${cap.id}_turn`,
        });
        const parsed = MockInterviewTurnSchema.safeParse(res.raw);
        if (!parsed.success)
          throw new AIValidationError("Mock interview turn response was malformed.");
        return { data: parsed.data, usage: res.usage };
      },
      { attempts: 2 },
    );
    const draft = produced.data;

    const belowFloor = answeredCount < plan.targetTurnRange.min;
    const effectiveConclude = hardLimitBreached || (draft.shouldConclude && !belowFloor);

    const { error: evaluationUpdateErr } = await sb
      .from("mock_interview_turns")
      .update({ evaluation: draft.internal.answerEvaluation as unknown as Json })
      .eq("id", answeredTurnRow.id);
    if (evaluationUpdateErr) throw evaluationUpdateErr;

    const mergedCoverage = mergeCoverage(
      ((sessionRow.coverage as { competencies: CoverageEntry[] } | null)?.competencies ??
        []) as CoverageEntry[],
      draft.coverageUpdate,
    );

    const sessionUpdate: Partial<MockInterviewSessionRow> = {
      rolling_summary: draft.rollingSummary,
      coverage: { competencies: mergedCoverage } as unknown as Json,
      turn_count: answeredCount,
    };
    if (effectiveConclude) {
      sessionUpdate.status = "concluded";
      sessionUpdate.ended_reason = hardLimitBreached ? "limit_reached" : "ai_concluded";
      sessionUpdate.ended_at = new Date().toISOString();
      sessionUpdate.elapsed_ms = elapsedMs(timerFields(sessionRow));
      sessionUpdate.last_resumed_at = null;
    }
    const { data: updatedSession, error: sessionUpdateErr } = await sb
      .from("mock_interview_sessions")
      .update(sessionUpdate)
      .eq("id", params.sessionId)
      .select()
      .single();
    if (sessionUpdateErr) throw sessionUpdateErr;

    const { data: nextTurnRow, error: nextTurnErr } = await sb
      .from("mock_interview_turns")
      .insert({
        session_id: params.sessionId,
        user_id: user.id,
        turn_index: params.turnIndex + 1,
        interviewer_message: draft.message,
        action: draft.action,
        target_competency: effectiveConclude ? null : draft.targetCompetencyId,
        references_turn: draft.action === "cross_reference" ? draft.referencesTurnIndex : null,
        candidate_answer: null,
        answer_input_mode: null,
        answered_at: null,
        evaluation: null,
      })
      .select()
      .single();
    if (nextTurnErr) throw nextTurnErr;

    await logRun(sb, user.id, {
      status: "success",
      creditsCharged: 0,
      latencyMs: Date.now() - startedAt,
      inputHash,
      resumeId: null,
      jobId: null,
      inputTokens: produced.usage.inputTokens,
      outputTokens: produced.usage.outputTokens,
    });

    return {
      ok: true,
      submission: {
        answeredTurn: mapTurnRow(answeredTurnRow),
        nextTurn: mapTurnRow(nextTurnRow as Record<string, unknown>),
        session: mapSessionRow(updatedSession),
      },
    };
  } catch (err) {
    const code = toResultCode(err);
    try {
      await logRun(sb, user.id, {
        status: "error",
        creditsCharged: 0,
        latencyMs: Date.now() - startedAt,
        errorCode: code,
        errorMessage: err instanceof Error ? err.message : String(err),
      });
    } catch {
      /* best-effort */
    }
    return fail(code, err instanceof Error ? err.message : "Could not process that answer.");
  }
}

// ════════════════════════════════════════════════════════════════════════
// Pause / Resume (free, no AI)
// ════════════════════════════════════════════════════════════════════════

export async function pauseMockInterview(
  authed: AuthedContext,
  sessionId: string,
): Promise<PauseResumeResult> {
  const { supabase: sb } = authed;
  const sessionRow = await fetchSessionRow(sb, sessionId);
  if (!sessionRow) return fail("session_not_found", "Mock interview session not found.");
  if (sessionRow.status !== "active")
    return fail("session_not_active", "This interview is not currently active.");

  const banked = elapsedMs(timerFields(sessionRow));
  const { data, error } = await sb
    .from("mock_interview_sessions")
    .update({ status: "paused", elapsed_ms: banked, last_resumed_at: null })
    .eq("id", sessionId)
    .select()
    .single();
  if (error) throw error;
  return { ok: true, session: mapSessionRow(data) };
}

export async function resumeMockInterview(
  authed: AuthedContext,
  sessionId: string,
): Promise<PauseResumeResult> {
  const { supabase: sb } = authed;
  const sessionRow = await fetchSessionRow(sb, sessionId);
  if (!sessionRow) return fail("session_not_found", "Mock interview session not found.");
  if (sessionRow.status !== "paused")
    return fail("session_not_paused", "This interview is not paused.");

  if (isPastResumeWindow(timerFields(sessionRow), MOCK_INTERVIEW_RESUME_WINDOW_DAYS)) {
    const { data, error } = await sb
      .from("mock_interview_sessions")
      .update({ status: "concluded", ended_reason: "expired", ended_at: new Date().toISOString() })
      .eq("id", sessionId)
      .select()
      .single();
    if (error) throw error;
    return { ok: true, session: mapSessionRow(data) };
  }

  const { data, error } = await sb
    .from("mock_interview_sessions")
    .update({ status: "active", last_resumed_at: new Date().toISOString() })
    .eq("id", sessionId)
    .select()
    .single();
  if (error) throw error;
  return { ok: true, session: mapSessionRow(data) };
}

// ════════════════════════════════════════════════════════════════════════
// End (free, user-initiated — no AI closing message, see the module note)
// ════════════════════════════════════════════════════════════════════════

export async function endMockInterview(
  authed: AuthedContext,
  params: EndMockInterviewParams,
): Promise<EndMockInterviewResult> {
  const { supabase: sb } = authed;
  const sessionRow = await fetchSessionRow(sb, params.sessionId);
  if (!sessionRow) return fail("session_not_found", "Mock interview session not found.");
  if (sessionRow.status === "concluded") return { ok: true, session: mapSessionRow(sessionRow) };
  if (sessionRow.status === "failed")
    return fail("session_ended", "This interview session cannot be ended.");

  const finalElapsed = elapsedMs(timerFields(sessionRow));
  const { data, error } = await sb
    .from("mock_interview_sessions")
    .update({
      status: "concluded",
      ended_reason: params.reason,
      ended_at: new Date().toISOString(),
      elapsed_ms: finalElapsed,
      last_resumed_at: null,
    })
    .eq("id", params.sessionId)
    .select()
    .single();
  if (error) throw error;
  return { ok: true, session: mapSessionRow(data) };
}

// ════════════════════════════════════════════════════════════════════════
// Phase 3 — Final report (free, retryable up to MOCK_INTERVIEW_MAX_REPORT_ATTEMPTS)
// ════════════════════════════════════════════════════════════════════════

/** Drops any citation whose turnIndex does not exist in this session's real transcript — the report can never point at an answer that wasn't actually given. */
/** Loose normalization for "did we already ask this?" — punctuation, casing and filler words shouldn't defeat the check. */
function questionFingerprint(question: string): string {
  return question
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(
      /\b(a|an|the|you|your|me|us|tell|about|can|could|would|please|so|and|of|to|in|is)\b/g,
      "",
    )
    .replace(/\s+/g, " ")
    .trim();
}

function groundReport(
  draft: MockInterviewReportDraft,
  validTurnIndexes: Set<number>,
  askedQuestions: readonly string[] = [],
): Omit<MockInterviewReportDraft, "internal"> {
  const valid = (turnIndex: number) => validTurnIndexes.has(turnIndex);
  const { internal: _internal, ...rest } = draft;

  // "Questions you should prepare" is only useful if it excludes what was
  // already asked. The prompt says so, but this enforces it: a near-duplicate
  // of a question the candidate just answered is noise dressed up as advice.
  // Also de-duplicates the list against itself.
  const askedFingerprints = new Set(askedQuestions.map(questionFingerprint).filter(Boolean));
  const seenFingerprints = new Set<string>();
  const additionalQuestionsToPrepare = (rest.additionalQuestionsToPrepare ?? []).filter((q) => {
    const fp = questionFingerprint(q.question);
    if (!fp || askedFingerprints.has(fp) || seenFingerprints.has(fp)) return false;
    seenFingerprints.add(fp);
    return true;
  });

  return {
    ...rest,
    additionalQuestionsToPrepare,
    competencyScores: rest.competencyScores.map((c) => ({
      ...c,
      turnIndexes: c.turnIndexes.filter(valid),
    })),
    bestAnswers: rest.bestAnswers.filter((a) => valid(a.turnIndex)),
    weakAnswers: rest.weakAnswers.filter((a) => valid(a.turnIndex)),
    missedOpportunities: rest.missedOpportunities.filter((a) => valid(a.turnIndex)),
    suggestedBetterAnswers: rest.suggestedBetterAnswers.filter((a) => valid(a.turnIndex)),
    starEvaluation: {
      ...rest.starEvaluation,
      strongExamples: rest.starEvaluation.strongExamples.filter((e) => valid(e.turnIndex)),
      weakExamples: rest.starEvaluation.weakExamples.filter((e) => valid(e.turnIndex)),
    },
  };
}

export async function generateMockInterviewReport(
  authed: AuthedContext,
  sessionId: string,
  regenerate = false,
): Promise<GenerateReportResult> {
  const { supabase: sb, user } = authed;
  const cap = getCapability(AI_CAPABILITIES.MOCK_INTERVIEW);
  const startedAt = Date.now();

  const sessionRow = await fetchSessionRow(sb, sessionId);
  if (!sessionRow) return fail("session_not_found", "Mock interview session not found.");
  if (sessionRow.status !== "concluded") {
    return fail("session_not_concluded", "End the interview before generating a report.");
  }
  if (sessionRow.report && !regenerate) {
    return { ok: true, session: mapSessionRow(sessionRow) };
  }
  if (Number(sessionRow.report_attempts ?? 0) >= MOCK_INTERVIEW_MAX_REPORT_ATTEMPTS) {
    return fail(
      "report_attempts_exhausted",
      "This report couldn't be generated after several tries. Please contact support.",
    );
  }

  try {
    const plan = sessionRow.plan as MockInterviewPlanContent | null;
    if (!plan) throw new Error("Mock interview session is missing its plan.");
    const role = getInterviewerRole(sessionRow.interviewer_role as string);
    if (!role) throw new Error("Mock interview session references an unknown interviewer role.");

    const allTurns = await fetchSessionTurns(sb, sessionId);
    const transcript = allTurns.map((t) => ({
      turn_index: Number(t.turn_index),
      interviewer_message: t.interviewer_message as string,
      candidate_answer: (t.candidate_answer as string | null) ?? null,
    }));
    const validTurnIndexes = new Set(transcript.map((t) => t.turn_index));

    const endedReasonLabel = (sessionRow.ended_reason as string | null) ?? "unknown";

    const prompt = buildReportPrompt({
      interviewerRole: role,
      candidateProfile: plan.candidateProfile,
      competencyMap: plan.competencyMap,
      rollingSummary: (sessionRow.rolling_summary as string | null) ?? "",
      endedReason: endedReasonLabel,
      transcript,
    });

    const inputHash = await hashObject({
      capability: cap.id,
      phase: "report",
      system: prompt.system,
      user: prompt.user,
      model: cap.model,
      promptVersion: cap.promptVersion,
      analysisVersion: cap.analysisVersion,
      turnCount: transcript.length,
    });

    // Count this attempt against the budget regardless of outcome.
    await sb
      .from("mock_interview_sessions")
      .update({ report_attempts: Number(sessionRow.report_attempts ?? 0) + 1 })
      .eq("id", sessionId);

    const provider = getProvider(cap.provider);
    const produced = await withRetry(
      async () => {
        const res = await provider.complete({
          system: prompt.system,
          user: prompt.user,
          model: cap.model,
          schema: MockInterviewReportSchema,
          schemaName: `${cap.id}_report`,
        });
        const parsed = MockInterviewReportSchema.safeParse(res.raw);
        if (!parsed.success)
          throw new AIValidationError("Mock interview report response was malformed.");
        return { data: parsed.data, usage: res.usage };
      },
      { attempts: 2 },
    );
    const draft = produced.data;
    const grounded = groundReport(
      draft,
      validTurnIndexes,
      transcript.map((t) => t.interviewer_message),
    );

    const nowIso = new Date().toISOString();
    const { data: updatedSession, error: updateErr } = await sb
      .from("mock_interview_sessions")
      .update({
        report: grounded as unknown as Json,
        report_reasoning: draft.internal as unknown as Json,
        report_generated_at: nowIso,
      })
      .eq("id", sessionId)
      .select()
      .single();
    if (updateErr) throw updateErr;

    await logRun(sb, user.id, {
      status: "success",
      creditsCharged: 0,
      latencyMs: Date.now() - startedAt,
      inputHash,
      inputTokens: produced.usage.inputTokens,
      outputTokens: produced.usage.outputTokens,
    });

    try {
      const interview = await fetchInterview(sb, sessionRow.interview_id as string);
      await sb.from("ai_analyses").insert({
        user_id: user.id,
        capability: cap.id,
        resume_id: interview?.resume_id ?? null,
        job_id: interview?.job_id ?? null,
        resume_file_hash: (sessionRow.resume_file_hash as string | null) ?? null,
        job_hash: (sessionRow.job_hash as string | null) ?? null,
        input_hash: inputHash,
        prompt_version: cap.promptVersion,
        analysis_version: cap.analysisVersion,
        model: cap.model,
        score: grounded.overallPerformance.score,
        result: { report: grounded, reasoning: draft.internal } as unknown as Json,
        cache_hit: false,
      });
    } catch {
      /* history is best-effort — the report itself is still returned */
    }

    return { ok: true, session: mapSessionRow(updatedSession) };
  } catch (err) {
    const code = toResultCode(err);
    try {
      await logRun(sb, user.id, {
        status: "error",
        creditsCharged: 0,
        latencyMs: Date.now() - startedAt,
        errorCode: code,
        errorMessage: err instanceof Error ? err.message : String(err),
      });
    } catch {
      /* best-effort */
    }
    return fail(
      code,
      err instanceof Error ? err.message : "Could not generate the interview report.",
    );
  }
}
