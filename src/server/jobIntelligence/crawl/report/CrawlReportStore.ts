// ── Module 10B.1: crawl report persistence ──
//
// "View Last Crawl Report" has to survive a page reload and a server restart,
// so a report is a row in `crawl_runs`, not in-memory state. The run row is
// created BEFORE the crawl starts (status 'running') so a crash still leaves
// a trace of what was attempted, then finalized when it completes.

import { createServiceSupabase, type ServerSupabase } from "@/server/supabase";
import type { CrawlRunRow, Json } from "@/types/database";
import { toRunCounters, type CrawlMode, type CrawlReport, type CrawlScope } from "./CrawlReport";

export type StartRunInput = {
  mode: CrawlMode;
  scope: CrawlScope;
  platform: string | null;
  triggeredBy: string | null;
};

export interface CrawlReportStore {
  /** Records a run as started; returns its id (null when persistence is unavailable). */
  startRun(input: StartRunInput): Promise<string | null>;
  /** Writes the finished report and counters. */
  finishRun(runId: string | null, report: CrawlReport): Promise<void>;
  /** Marks a run failed at the top level (the crawl itself threw). */
  failRun(runId: string | null, error: string): Promise<void>;
  /** Most recent runs, newest first. */
  listRecentRuns(limit: number, platform?: string): Promise<CrawlRunRow[]>;
  getRun(runId: string): Promise<CrawlRunRow | null>;
}

export class SupabaseCrawlReportStore implements CrawlReportStore {
  constructor(private readonly supabase: ServerSupabase = createServiceSupabase()) {}

  async startRun(input: StartRunInput): Promise<string | null> {
    const { data, error } = await this.supabase
      .from("crawl_runs")
      .insert({
        mode: input.mode,
        scope: input.scope,
        platform: input.platform,
        triggered_by: input.triggeredBy,
        status: "running",
        started_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (error) throw error;
    return (data as { id: string } | null)?.id ?? null;
  }

  async finishRun(runId: string | null, report: CrawlReport): Promise<void> {
    if (!runId) return;
    const { error } = await this.supabase
      .from("crawl_runs")
      .update({
        status: "completed",
        finished_at: report.finishedAt,
        duration_ms: report.durationMs,
        ...toRunCounters(report),
        report: report as unknown as Json,
        error: report.error ?? null,
      })
      .eq("id", runId);
    if (error) throw error;
  }

  async failRun(runId: string | null, error: string): Promise<void> {
    if (!runId) return;
    const { error: updateError } = await this.supabase
      .from("crawl_runs")
      .update({ status: "failed", finished_at: new Date().toISOString(), error })
      .eq("id", runId);
    if (updateError) throw updateError;
  }

  async listRecentRuns(limit: number, platform?: string): Promise<CrawlRunRow[]> {
    let query = this.supabase
      .from("crawl_runs")
      .select("*")
      .order("started_at", { ascending: false })
      .limit(limit);
    if (platform) query = query.eq("platform", platform);

    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []) as CrawlRunRow[];
  }

  async getRun(runId: string): Promise<CrawlRunRow | null> {
    const { data, error } = await this.supabase
      .from("crawl_runs")
      .select("*")
      .eq("id", runId)
      .maybeSingle();
    if (error) throw error;
    return (data as CrawlRunRow | null) ?? null;
  }
}
