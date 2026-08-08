// ── Module 10B.1.5: the source-health sweep ──
//
// Walks the whole Company Registry, verifies each entry's URL, and writes the
// verdict back. Deliberately a SEPARATE operation from crawling:
//
//   - It imports nothing. A sweep must never touch `global_jobs`.
//   - It is cheap: one request per source, not one per posting.
//   - Its failures are data, not exceptions. One dead URL among 170 is the
//     normal case, and it must not abort the sweep.
//
// Recorded in `source_verification_runs` rather than `crawl_runs`, because
// filing a sweep as a crawl would report ~170 "crawls that imported 0 jobs"
// and quietly poison every job-count metric in the admin panel.

import {
  verifySource,
  isCrawlableHealth,
  type SourceHealth,
  type SourceVerification,
} from "./SourceVerifier";
import type { CrawlFetcher } from "../HttpFetcher";
import type { CompanyRegistryEntry, CompanyRegistryStore } from "../registry/CompanyRegistry";
import { emptyHealthRollup, type HealthRollup } from "../registry/CompanyRegistry";
import type { SourceVerificationStore } from "./SourceVerificationStore";

/** One entry's verification outcome, as it appears in the run report. */
export type SourceHealthEntry = {
  registryId: string;
  companyName: string;
  platform: string;
  url: string;
  health: SourceHealth;
  detectedPlatform: string | null;
  httpStatus: number | null;
  postingsSeen: number | null;
  /** Set only when the URL moved — the value an operator should paste back in. */
  suggestedUrl: string | null;
  message: string | null;
};

export type SourceHealthReport = {
  runId: string | null;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  triggeredBy: string | null;
  sourcesChecked: number;
  rollup: HealthRollup;
  entries: SourceHealthEntry[];
};

export type SourceHealthRequest = {
  /** Narrow the sweep to one platform; omit for the whole registry. */
  platform?: string | null;
  triggeredBy?: string | null;
  /** Include disabled entries. Off by default — a disabled source is not worth probing. */
  includeDisabled?: boolean;
};

export type SourceHealthDeps = {
  fetcher: CrawlFetcher;
  registry: CompanyRegistryStore;
  runs: SourceVerificationStore;
  now?: () => Date;
};

export class SourceHealthService {
  constructor(private readonly deps: SourceHealthDeps) {}

  private now(): Date {
    return this.deps.now?.() ?? new Date();
  }

  async sweep(request: SourceHealthRequest = {}): Promise<SourceHealthReport> {
    const startedAt = this.now();
    const platform = request.platform?.trim() || null;

    const runId = await this.deps.runs.startRun({
      triggeredBy: request.triggeredBy ?? null,
    });

    try {
      const all = request.includeDisabled
        ? await this.deps.registry.listAllEntries()
        : await this.deps.registry.listEntries(platform ?? undefined);

      const entries = platform ? all.filter((entry) => entry.platform === platform) : all;

      const results: SourceHealthEntry[] = [];
      const rollup = emptyHealthRollup();

      for (const entry of entries) {
        const result = await this.verifyEntry(entry);
        results.push(result);
        rollup[result.health] += 1;
      }

      const finishedAt = this.now();
      const report: SourceHealthReport = {
        runId,
        startedAt: startedAt.toISOString(),
        finishedAt: finishedAt.toISOString(),
        durationMs: finishedAt.getTime() - startedAt.getTime(),
        triggeredBy: request.triggeredBy ?? null,
        sourcesChecked: results.length,
        rollup,
        entries: results,
      };

      await this.deps.runs.finishRun(runId, report);
      return report;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Verification sweep failed.";
      await this.deps.runs.failRun(runId, message);
      throw error;
    }
  }

  private async verifyEntry(entry: CompanyRegistryEntry): Promise<SourceHealthEntry> {
    let verification: SourceVerification;
    try {
      verification = await verifySource(
        entry.careersUrl,
        entry.companyName,
        this.deps.fetcher,
        entry.config,
        { now: () => this.now() },
      );
    } catch (error) {
      // The verifier is written not to throw; this is belt-and-braces so one
      // pathological URL cannot end a 170-source sweep.
      verification = {
        url: entry.careersUrl,
        finalUrl: null,
        health: "UNKNOWN",
        httpStatus: null,
        detectedPlatform: null,
        errorReason: error instanceof Error ? error.message : "Verification threw.",
        checkedAt: this.now().toISOString(),
        postingsSeen: null,
      };
    }

    // A write failure must not lose the verdict for every remaining entry
    // either — record it on this entry and carry on.
    let writeNote: string | null = null;
    try {
      await this.deps.registry.markVerification(entry.id, verification);
    } catch (error) {
      writeNote = `Could not save health for this entry: ${
        error instanceof Error ? error.message : "unknown error"
      }`;
    }

    const moved =
      verification.finalUrl && verification.finalUrl !== verification.url
        ? verification.finalUrl
        : null;

    return {
      registryId: entry.id,
      companyName: entry.companyName,
      platform: entry.platform,
      url: entry.careersUrl,
      health: verification.health,
      detectedPlatform: verification.detectedPlatform,
      httpStatus: verification.httpStatus,
      postingsSeen: verification.postingsSeen,
      suggestedUrl: isCrawlableHealth(verification.health) ? moved : null,
      message: writeNote ?? verification.errorReason,
    };
  }
}

/** One-line summary for logs and the admin panel. */
export function summarizeHealthReport(report: SourceHealthReport): string {
  const { rollup } = report;
  return (
    `Checked ${report.sourcesChecked} source(s): ` +
    `${rollup.HEALTHY} healthy, ${rollup.REDIRECTED} redirected, ` +
    `${rollup.BLOCKED} blocked, ${rollup.BROKEN} broken, ` +
    `${rollup.UNAVAILABLE} unavailable, ${rollup.UNKNOWN} unknown ` +
    `in ${(report.durationMs / 1000).toFixed(1)}s`
  );
}
