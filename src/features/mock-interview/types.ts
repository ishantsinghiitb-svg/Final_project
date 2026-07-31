import type { AICreditStatus, AIFailure } from "@/features/ai/types";
import type {
  AnswerInputMode,
  CandidateProfile,
  Competency,
  CompetencyMapEntry,
  CoverageStatus,
  EndedReason,
  InterviewerBrief,
  MockInterviewReportDraft,
  MockSessionStatus,
  PlannedArcStage,
  TurnAction,
} from "./schema";

export type {
  AnswerInputMode,
  CandidateProfile,
  Competency,
  CompetencyMapEntry,
  EndedReason,
  InterviewerBrief,
  InterviewStage,
  MockSessionStatus,
  PlannedArcStage,
  TurnAction,
} from "./schema";
export type { RoleFamily, InterviewerRoleDef, InterviewerRoleBrief } from "./interviewerRoles";

// ── Mock Interview Studio domain types (Module 7C) ──
//
// The wire shape between the server AI service, the server functions and the
// client. `plan`/`report` below are the validated draft MINUS `internal` (the
// model's reasoning is server-only, stored in *_reasoning columns, never sent
// to the client) — same convention as InterviewPrepContent. Per-turn
// `evaluation` is never sent to the client at all, at any point during a live
// session — only the final report surfaces evaluative content, and only in
// aggregate/cited form.

export type MockInterviewPlanContent = {
  candidateProfile: CandidateProfile;
  interviewerBrief: InterviewerBrief;
  competencyMap: CompetencyMapEntry[];
  /**
   * Optional because sessions planned before the realism pass have no arc in
   * their stored `plan` jsonb — the read path is a cast, not a re-validation,
   * so those rows genuinely arrive without this key. Every consumer must
   * tolerate its absence.
   */
  plannedArc?: PlannedArcStage[];
  targetTurnRange: { min: number; max: number };
  expectedDurationMinutes: number;
};

/** The validated report draft MINUS `internal` — the model's reasoning is server-only (report_reasoning column), never sent to the client. */
export type MockInterviewReportContent = Omit<MockInterviewReportDraft, "internal">;

export type CoverageEntry = { competencyId: Competency; status: CoverageStatus };

export type MockInterviewSession = {
  id: string;
  interview_id: string;
  user_id: string;
  interviewer_role: string;
  interviewer_role_label: string;
  role_family: string;
  round_label: string | null;
  focus: string | null;
  manual_job_description: string | null;
  manual_company_description: string | null;
  plan: MockInterviewPlanContent | null;
  status: MockSessionStatus;
  ended_reason: EndedReason | null;
  started_at: string;
  elapsed_ms: number;
  last_resumed_at: string | null;
  ended_at: string | null;
  turn_count: number;
  coverage: { competencies: CoverageEntry[] };
  report: MockInterviewReportContent | null;
  report_generated_at: string | null;
  report_attempts: number;
  created_at: string;
  updated_at: string;
};

export type MockInterviewTurn = {
  id: string;
  session_id: string;
  turn_index: number;
  interviewer_message: string;
  action: TurnAction | null;
  target_competency: Competency | null;
  references_turn: number | null;
  candidate_answer: string | null;
  answer_input_mode: AnswerInputMode | null;
  answered_at: string | null;
  created_at: string;
};

// ── Start (charges credits) ─────────────────────────────────────────────

export type StartMockInterviewParams = {
  interviewId: string;
  /** Minted client-side before calling Start — the idempotency key against double-charges. */
  clientKey: string;
  interviewerRole: string;
  focus?: string;
  /** Required only when the interview has no linked job (standalone, or the linked job was deleted). */
  manualJobDescription?: string;
  manualCompanyDescription?: string;
};

export type StartMockInterviewSuccess = {
  session: MockInterviewSession;
  openingTurn: MockInterviewTurn;
  creditsCharged: number;
};

export type StartMockInterviewResult =
  { ok: true; start: StartMockInterviewSuccess; credits: AICreditStatus } | AIFailure;

// ── Submit answer (free, session-gated) ─────────────────────────────────

export type SubmitAnswerParams = {
  sessionId: string;
  turnIndex: number;
  answer: string;
  inputMode: AnswerInputMode;
};

export type SubmitAnswerSuccess = {
  answeredTurn: MockInterviewTurn;
  /** Present unless the interview just concluded. */
  nextTurn: MockInterviewTurn | null;
  session: MockInterviewSession;
};

export type SubmitAnswerResult = { ok: true; submission: SubmitAnswerSuccess } | AIFailure;

// ── Pause / resume (free, no AI) ────────────────────────────────────────

export type PauseResumeResult = { ok: true; session: MockInterviewSession } | AIFailure;

// ── End (free, triggers report generation) ──────────────────────────────

export type EndMockInterviewParams = {
  sessionId: string;
  reason: Extract<EndedReason, "user_ended">;
};

export type EndMockInterviewResult = { ok: true; session: MockInterviewSession } | AIFailure;

// ── Report (free, retryable) ─────────────────────────────────────────────

export type GenerateReportResult = { ok: true; session: MockInterviewSession } | AIFailure;
