// ── Module 10B.1.5: verification-run persistence ──
//
// Same shape and same posture as Module 10B.1's `CrawlReportStore`: a narrow
// interface so tests use an in-memory fake, and a Supabase implementation whose
// write failures NEVER abort the sweep. Losing the audit row for a health check
// is a much smaller problem than losing the health data for every source after
// the one that failed to log.

import { createServiceSupabase, type ServerSupabase } from "@/server/supabase";
import type { Json, SourceVerificationRunRow } from "@/types/database";
import type { SourceHealthReport } from "./SourceHealthService";

export type StartVerificationRunInput = { triggeredBy: string | null };

export interface SourceVerificationStore {
  /** Returns the run id, or null when the row could not be created. */
  startRun(input: StartVerificationRunInput): Promise<string | null>;
  finishRun(runId: string | null, report: SourceHealthReport): Promise<void>;
  failRun(runId: string | null, error: string): Promise<void>;
  listRecentRuns(limit?: number): Promise<SourceVerificationRunRow[]>;
}

export class SupabaseSourceVerificationStore implements SourceVerificationStore {
  constructor(private readonly supabase: ServerSupabase = createServiceSupabase()) {}

  async startRun(input: StartVerificationRunInput): Promise<string | null> {
    const { data, error } = await this.supabase
      .from("source_verification_runs")
      .insert({ triggered_by: input.triggeredBy, status: "running" })
      .select("id")
      .single();
    // Deliberately swallowed: the sweep is the point, the audit row is not.
    if (error || !data) return null;
    return (data as { id: string }).id;
  }

  async finishRun(runId: string | null, report: SourceHealthReport): Promise<void> {
    if (!runId) return;
    await this.supabase
      .from("source_verification_runs")
      .update({
        status: "completed",
        finished_at: report.finishedAt,
        duration_ms: report.durationMs,
        sources_checked: report.sourcesChecked,
        healthy: report.rollup.HEALTHY,
        redirected: report.rollup.REDIRECTED,
        blocked: report.rollup.BLOCKED,
        broken: report.rollup.BROKEN,
        unavailable: report.rollup.UNAVAILABLE,
        unknown: report.rollup.UNKNOWN,
        report: report as unknown as Json,
      })
      .eq("id", runId);
  }

  async failRun(runId: string | null, error: string): Promise<void> {
    if (!runId) return;
    await this.supabase
      .from("source_verification_runs")
      .update({ status: "failed", finished_at: new Date().toISOString(), error })
      .eq("id", runId);
  }

  async listRecentRuns(limit = 10): Promise<SourceVerificationRunRow[]> {
    const { data, error } = await this.supabase
      .from("source_verification_runs")
      .select("*")
      .order("started_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data ?? []) as SourceVerificationRunRow[];
  }
}
