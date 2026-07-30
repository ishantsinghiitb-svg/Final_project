import type { AICreditStatus, AIFailure } from "@/features/ai/types";
import type { InterviewPrepDraft, InterviewAnswerDraft } from "./schema";

export type {
  QuestionCategory,
  ChecklistCategory,
  PrepPriority,
  QuestionPriority,
  QuestionDifficulty,
} from "./schema";

// ── Interview Preparation domain types (Module 7B) ──
//
// The wire shape between the server AI service, the server functions and the
// client. `content` is the validated draft minus `internal` (the model's
// reasoning is server-only, stored on `reasoning`, never sent to the client).

export type InterviewPrepContent = Omit<InterviewPrepDraft, "internal">;

export type InterviewPrepQuestion = InterviewPrepContent["questions"][number];
export type InterviewPrepChecklistItem = InterviewPrepContent["checklist"][number];

/** User-tracked, non-AI progress. Question-answer progress is derived, not stored here. */
export type InterviewPrepProgress = {
  checklistChecked: string[];
};

export type InterviewPrep = {
  id: string;
  interview_id: string;
  user_id: string;
  manual_job_description: string | null;
  manual_company_description: string | null;
  /** Freeform extra context the candidate typed before generating — e.g. "final hiring manager round", "they'll focus on SQL". Optional, reused on regenerate. */
  additional_context: string | null;
  content: InterviewPrepContent | null;
  model: string | null;
  prompt_version: string | null;
  analysis_version: string | null;
  ai_session_id: string | null;
  ai_session_started_at: string | null;
  progress: InterviewPrepProgress;
  generated_at: string | null;
  created_at: string;
  updated_at: string;
};

export type InterviewPrepAnswer = {
  id: string;
  interview_prep_id: string;
  question_id: string;
  answer: string;
  ai_generated: boolean;
  last_generated_at: string | null;
  edited_at: string | null;
  created_at: string;
  updated_at: string;
};

// ── Generation ───────────────────────────────────────────────────────────

export type GenerateInterviewPrepParams = {
  interviewId: string;
  /** Required only when the interview has no linked job (standalone, or the linked job was deleted). */
  manualJobDescription?: string;
  manualCompanyDescription?: string;
  /** Optional freeform extra context — see InterviewPrep.additional_context. */
  additionalContext?: string;
};

export type InterviewPrepGeneration = {
  prep: InterviewPrep;
  /** Fresh editing-session id — always set, since generation always charges. */
  sessionId: string;
  cacheHit: boolean;
  creditsCharged: number;
};

export type GenerateInterviewPrepResult =
  | { ok: true; generation: InterviewPrepGeneration; credits: AICreditStatus }
  | AIFailure;

// ── Per-question answer ─────────────────────────────────────────────────

export type GenerateInterviewAnswerParams = {
  interviewPrepId: string;
  questionId: string;
  /** True for an explicit Regenerate — never a cache replay. */
  regenerate?: boolean;
};

export type GenerateInterviewAnswerResult =
  | { ok: true; answer: InterviewPrepAnswer; draft: InterviewAnswerDraft }
  | AIFailure;
