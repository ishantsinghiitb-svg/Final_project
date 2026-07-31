import { supabase } from "@/lib/supabase";
import type { AnswerInputMode, MockInterviewTurn } from "@/features/mock-interview/types";

// ── MockInterviewTurnRepository (Module 7C) ──
//
// Read-only, client-side under RLS. Excludes `evaluation` entirely — that
// column is server-only (written by the NEXT turn's AI call, read only by
// report generation) and must never reach the client during a live session,
// per the product decision to keep live evaluation completely hidden.

const TURN_COLUMNS =
  "id, session_id, turn_index, interviewer_message, action, target_competency, references_turn, candidate_answer, answer_input_mode, answered_at, created_at";

function mapRow(row: Record<string, unknown>): MockInterviewTurn {
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

export class MockInterviewTurnRepository {
  async findAllBySessionId(sessionId: string): Promise<MockInterviewTurn[]> {
    const { data, error } = await supabase
      .from("mock_interview_turns")
      .select(TURN_COLUMNS)
      .eq("session_id", sessionId)
      .order("turn_index", { ascending: true });
    if (error) throw error;
    return (data ?? []).map((row) => mapRow(row as unknown as Record<string, unknown>));
  }
}

export const mockInterviewTurnRepository = new MockInterviewTurnRepository();
