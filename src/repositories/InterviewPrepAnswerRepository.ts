import { supabase } from "@/lib/supabase";
import type { InterviewPrepAnswer } from "@/features/interview-prep/types";

const ANSWER_COLUMNS =
  "id, interview_prep_id, question_id, answer, ai_generated, last_generated_at, edited_at, created_at, updated_at";

function mapRow(row: Record<string, unknown>): InterviewPrepAnswer {
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

export class InterviewPrepAnswerRepository {
  async findAllByPrepId(interviewPrepId: string): Promise<InterviewPrepAnswer[]> {
    const { data, error } = await supabase
      .from("interview_prep_answers")
      .select(ANSWER_COLUMNS)
      .eq("interview_prep_id", interviewPrepId);
    if (error) throw error;
    return ((data ?? []) as unknown as Record<string, unknown>[]).map(mapRow);
  }

  /**
   * A hand edit to an answer that AI has already generated — a plain UPDATE,
   * never an insert. A question has no answer row until "Generate Answer" is
   * clicked (see InterviewPrepAIService.generateInterviewAnswer); this method
   * never creates one, which keeps "an answer exists" strictly meaning "AI (or
   * a later hand edit of that AI answer) produced one" — never a silent
   * skip-AI path.
   *
   * `ai_generated` stays whatever it already was — it records whether AI ever
   * produced this answer, not whether it's still untouched; the UI
   * distinguishes "edited since generation" by comparing `edited_at` against
   * `last_generated_at`.
   */
  async updateAnswerText(
    interviewPrepId: string,
    questionId: string,
    answer: string,
  ): Promise<InterviewPrepAnswer> {
    const { data, error } = await supabase
      .from("interview_prep_answers")
      .update({ answer, edited_at: new Date().toISOString() })
      .eq("interview_prep_id", interviewPrepId)
      .eq("question_id", questionId)
      .select(ANSWER_COLUMNS)
      .single();
    if (error) throw error;
    return mapRow(data as unknown as Record<string, unknown>);
  }
}

export const interviewPrepAnswerRepository = new InterviewPrepAnswerRepository();
