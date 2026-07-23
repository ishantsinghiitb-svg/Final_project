import { supabase } from "@/lib/supabase";
import type { AICapability } from "@/features/ai/constants";

// ── AnalysisRepository (Module 6B) ──
//
// Read-only access to `ai_analyses` for the history list only. Deliberately
// narrow: selects id/score/created_at, never the `result` jsonb blob (which
// carries the internal per-dimension detail) — the history list only ever
// needs the score/label + a timestamp, so there is nothing to strip. The
// current analysis (with the full public summary) is served by the
// getResumeMatch server function instead, since that path also recomputes
// staleness via the server-only ContextBuilder.

export type AnalysisHistoryEntry = {
  id: string;
  score: number | null;
  createdAt: string;
};

export class AnalysisRepository {
  async listHistory(
    resumeId: string,
    jobId: string,
    capability: AICapability,
    limit = 10,
  ): Promise<AnalysisHistoryEntry[]> {
    const { data, error } = await supabase
      .from("ai_analyses")
      .select("id, score, created_at")
      .eq("resume_id", resumeId)
      .eq("job_id", jobId)
      .eq("capability", capability)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data ?? []).map((row) => ({
      id: row.id,
      score: row.score,
      createdAt: row.created_at,
    }));
  }
}
