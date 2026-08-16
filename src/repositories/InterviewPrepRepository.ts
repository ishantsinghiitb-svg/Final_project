import { supabase } from "@/lib/supabase";
import type {
  InterviewPrep,
  InterviewPrepContent,
  InterviewPrepProgress,
} from "@/features/interview-prep/types";
import type { Json } from "@/types/database";

// Excludes `reasoning`, `resume_file_hash`, `job_hash`, `input_hash` — server-only
// debugging/cache fields, never needed by the client (mirrors InterviewRepository
// excluding the legacy `prep` column).
const PREP_COLUMNS =
  "id, interview_id, user_id, manual_job_description, manual_company_description, additional_context, content, model, prompt_version, analysis_version, ai_session_id, ai_session_started_at, progress, generated_at, created_at, updated_at";

function mapRow(row: Record<string, unknown>): InterviewPrep {
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

export class InterviewPrepRepository {
  async findByInterviewId(interviewId: string): Promise<InterviewPrep | null> {
    const { data, error } = await supabase
      .from("interview_preps")
      .select(PREP_COLUMNS)
      .eq("interview_id", interviewId)
      .maybeSingle();
    if (error) throw error;
    return data ? mapRow(data as unknown as Record<string, unknown>) : null;
  }

  /** Checklist-check state only — never AI, never touches `content`. */
  async updateProgress(id: string, progress: InterviewPrepProgress): Promise<InterviewPrep> {
    const { data, error } = await supabase
      .from("interview_preps")
      .update({ progress: progress as unknown as Json })
      .eq("id", id)
      .select(PREP_COLUMNS)
      .single();
    if (error) throw error;
    return mapRow(data as unknown as Record<string, unknown>);
  }
}

export const interviewPrepRepository = new InterviewPrepRepository();
