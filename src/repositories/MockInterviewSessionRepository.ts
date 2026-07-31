import { supabase } from "@/lib/supabase";
import type {
  CoverageEntry,
  MockInterviewPlanContent,
  MockInterviewReportContent,
  MockInterviewSession,
} from "@/features/mock-interview/types";

// ── MockInterviewSessionRepository (Module 7C) ──
//
// Read-only, client-side under RLS. Every mutation on a session (start,
// submit an answer, pause, resume, end, generate the report) goes through
// server-functions/mockInterview.ts instead — even pause/resume, despite
// being "free, no AI": resume's 14-day auto-expire check must be
// server-authoritative, not a client-trusted status flip. See
// MockInterviewAIService.ts.
//
// Excludes `plan_reasoning` and `report_reasoning` — server-only debugging
// fields, same convention as InterviewPrepRepository excluding `reasoning`.

const SESSION_COLUMNS =
  "id, interview_id, user_id, interviewer_role, interviewer_role_label, role_family, round_label, focus, manual_job_description, manual_company_description, plan, status, ended_reason, started_at, elapsed_ms, last_resumed_at, ended_at, turn_count, coverage, report, report_generated_at, report_attempts, created_at, updated_at";

function mapRow(row: Record<string, unknown>): MockInterviewSession {
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

export class MockInterviewSessionRepository {
  /** Every mock interview session for an interview, newest first — the launcher's "Past mock interviews" list. */
  async findAllByInterviewId(interviewId: string): Promise<MockInterviewSession[]> {
    const { data, error } = await supabase
      .from("mock_interview_sessions")
      .select(SESSION_COLUMNS)
      .eq("interview_id", interviewId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map((row) => mapRow(row as unknown as Record<string, unknown>));
  }

  async findById(id: string): Promise<MockInterviewSession | null> {
    const { data, error } = await supabase
      .from("mock_interview_sessions")
      .select(SESSION_COLUMNS)
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return data ? mapRow(data as unknown as Record<string, unknown>) : null;
  }
}

export const mockInterviewSessionRepository = new MockInterviewSessionRepository();
