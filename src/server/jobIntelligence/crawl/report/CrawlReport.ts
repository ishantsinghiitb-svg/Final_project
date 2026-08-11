// ── Module 10B.1: crawl report ──
//
// The record the module is required to produce for every crawl: companies
// scanned, jobs discovered, parsed, imported, duplicates, skipped, failed,
// and duration — plus the per-company breakdown that makes those totals
// explainable rather than just believable.
//
// Every type here is plain, statically-serializable data: the report crosses
// the `createServerFn` boundary (see src/server-functions/jobIntelligence.ts)
// AND is persisted as jsonb in `crawl_runs.report`, and both require that.

export type CrawlMode = "live" | "dry_run";
export type CrawlScope = "platform" | "all";

/** Per-company outcome. `blocked` is called out separately from `failed` — it is a standing limitation, not a transient error. */
export type CompanyCrawlStatus = "success" | "partial" | "failed" | "blocked" | "skipped";

export type CrawlCounters = {
  /** Postings the crawler returned from the platform. */
  discovered: number;
  /** Postings the parser turned into a structured job. */
  parsed: number;
  /** Postings the validator accepted. */
  validated: number;
  /** New `global_jobs` rows created. */
  imported: number;
  /** Existing rows updated (matched by source id or fingerprint). */
  updated: number;
  /** Cross-platform merges into an existing row. */
  merged: number;
  /**
   * Postings that resolved to a row that already existed — the sum of
   * `updated` and `merged`. Reported as its own number because "duplicates"
   * is what an operator actually asks about.
   */
  duplicates: number;
  /**
   * Postings the VALIDATOR refused — bad data, placeholder employer, or older
   * than the active window. We read them and decided not to store them.
   */
  rejected: number;
  /**
   * Postings the crawler/parser deliberately excluded BEFORE validation — an
   * Ashby draft (`isListed: false`), a Recruitee offer that is not published.
   * Distinct from `rejected` on purpose: a board full of drafts is normal, a
   * board full of validator rejections means the parser or the source changed.
   */
  skipped: number;
  /** Postings lost to an error (parse crash, store failure). */
  failed: number;
};

export function emptyCounters(): CrawlCounters {
  return {
    discovered: 0,
    parsed: 0,
    validated: 0,
    imported: 0,
    updated: 0,
    merged: 0,
    duplicates: 0,
    rejected: 0,
    skipped: 0,
    failed: 0,
  };
}

/**
 * Per-platform rollup (Module 10B.2). "Which platform is pulling its weight,
 * and which one quietly stopped working" is a question the flat company list
 * cannot answer once the registry holds ~180 entries.
 */
export type PlatformCrawlSummary = {
  platform: string;
  targets: number;
  succeeded: number;
  failed: number;
  blocked: number;
  skipped: number;
  counters: CrawlCounters;
};

export function rollupByPlatform(companies: CompanyCrawlReport[]): PlatformCrawlSummary[] {
  const byPlatform = new Map<string, PlatformCrawlSummary>();

  for (const company of companies) {
    let summary = byPlatform.get(company.platform);
    if (!summary) {
      summary = {
        platform: company.platform,
        targets: 0,
        succeeded: 0,
        failed: 0,
        blocked: 0,
        skipped: 0,
        counters: emptyCounters(),
      };
      byPlatform.set(company.platform, summary);
    }

    summary.targets++;
    if (company.status === "success" || company.status === "partial") summary.succeeded++;
    else if (company.status === "failed") summary.failed++;
    else if (company.status === "blocked") summary.blocked++;
    else if (company.status === "skipped") summary.skipped++;
    summary.counters = addCounters(summary.counters, company.counters);
  }

  return [...byPlatform.values()].sort((a, b) => b.counters.imported - a.counters.imported);
}

export function addCounters(a: CrawlCounters, b: CrawlCounters): CrawlCounters {
  return {
    discovered: a.discovered + b.discovered,
    parsed: a.parsed + b.parsed,
    validated: a.validated + b.validated,
    imported: a.imported + b.imported,
    updated: a.updated + b.updated,
    merged: a.merged + b.merged,
    duplicates: a.duplicates + b.duplicates,
    rejected: a.rejected + b.rejected,
    skipped: a.skipped + b.skipped,
    failed: a.failed + b.failed,
  };
}

/** One rejected/failed posting, kept so an operator can see WHY, not just how many. */
export type CrawlIssue = {
  kind: "parse_failed" | "validation_skipped" | "store_failed";
  sourceUrl: string;
  reason: string;
};

/** Cap on retained per-company issue detail — a report must not become unbounded jsonb. */
export const MAX_ISSUES_PER_COMPANY = 20;

export type CompanyCrawlReport = {
  registryId: string | null;
  companyName: string;
  platform: string;
  careersUrl: string;
  status: CompanyCrawlStatus;
  /** Resolved ATS provider, when the platform has one (career-pages only). */
  resolvedProvider?: string;
  counters: CrawlCounters;
  durationMs: number;
  /** Non-fatal notes (pagination caps, empty boards, per-page fetch failures). */
  warnings: string[];
  /** Bounded sample of rejected/failed postings. */
  issues: CrawlIssue[];
  /** Set when status is 'failed', 'blocked' or 'skipped'. */
  message?: string;
};

/** A platform this module knowingly does not crawl, surfaced in the report. */
export type ReportedLimitation = {
  platform: string;
  displayName: string;
  reason: string;
  unblockedBy: string;
};

export type CrawlReport = {
  runId: string | null;
  mode: CrawlMode;
  scope: CrawlScope;
  /** Null for scope 'all'. */
  platform: string | null;
  triggeredBy: string | null;
  startedAt: string;
  finishedAt: string;
  durationMs: number;

  companiesScanned: number;
  totals: CrawlCounters;
  companies: CompanyCrawlReport[];
  /** Per-platform rollup (Module 10B.2) — see rollupByPlatform. */
  platforms: PlatformCrawlSummary[];

  /** Declared platform limitations relevant to this run. */
  limitations: ReportedLimitation[];
  /** Run-level failure (not a per-company one). */
  error?: string;
};

/** The denormalized counter columns on `crawl_runs`, derived from a report. */
export function toRunCounters(report: CrawlReport) {
  return {
    companies_scanned: report.companiesScanned,
    jobs_discovered: report.totals.discovered,
    jobs_parsed: report.totals.parsed,
    jobs_imported: report.totals.imported,
    jobs_updated: report.totals.updated,
    jobs_duplicates: report.totals.duplicates,
    jobs_rejected: report.totals.rejected,
    jobs_skipped: report.totals.skipped,
    jobs_failed: report.totals.failed,
  };
}

/** Human-readable one-line summary, used in the admin UI and logs. */
export function summarizeReport(report: CrawlReport): string {
  const { totals } = report;
  const prefix = report.mode === "dry_run" ? "Dry run" : "Crawl";
  return (
    `${prefix}: ${report.companiesScanned} target(s), ${totals.discovered} discovered, ` +
    `${totals.imported} imported, ${totals.duplicates} duplicate(s), ` +
    `${totals.rejected} rejected, ${totals.skipped} skipped, ` +
    `${totals.failed} failed in ${(report.durationMs / 1000).toFixed(1)}s`
  );
}
