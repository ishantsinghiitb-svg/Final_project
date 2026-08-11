// ── Module 10B.1: Crawl Orchestrator ──
//
// Drives one crawl run end to end:
//   registry entries → per-entry adapter → runPlatformCrawl (Module 10A,
//   unchanged) → counters → report → persist.
//
// It deliberately owns NO extraction, normalization, dedup or write logic —
// every one of those comes from Module 10A. What it adds is the operator-level
// concerns that module left open: which targets to run, how to classify their
// outcomes into a report, dry-run isolation, and writing the result back to the
// registry.
//
// One target's failure is contained: a blocked board, a bad careers URL or an
// unreachable feed marks that entry and the run continues. A run only fails as
// a whole if the registry itself cannot be read.

import { runPlatformCrawl, type CrawlRunOutcome } from "../CrawlRunner";
import type { JobIntelligenceStore } from "../store/JobIntelligenceStore";
import type { PlatformAdapter } from "../adapters/types";
import { crawlErrorMessage, CrawlTargetError, isBlockedError } from "./errors";
import type { CrawlFetcher } from "./HttpFetcher";
import { newObservations } from "./CrawlObservations";
import { getPlatformDescriptor, PLATFORM_CATALOG } from "./PlatformCatalog";
import { DryRunJobIntelligenceStore } from "./DryRunStore";
import { getPlatformLimitation } from "./limitations";
import {
  addCounters,
  emptyCounters,
  rollupByPlatform,
  MAX_ISSUES_PER_COMPANY,
  type CompanyCrawlReport,
  type CompanyCrawlStatus,
  type CrawlCounters,
  type CrawlIssue,
  type CrawlMode,
  type CrawlReport,
  type CrawlScope,
  type ReportedLimitation,
} from "./report/CrawlReport";
import type { CrawlReportStore } from "./report/CrawlReportStore";
import {
  crawlEligibility,
  isEntryDue,
  toCrawlTarget,
  type CompanyRegistryEntry,
  type CompanyRegistryStore,
} from "./registry/CompanyRegistry";
import { ValidatingJobParser, ValidationCollector } from "./validate/ValidatingJobParser";
import {
  RelevanceFilteringJobParser,
  RelevanceCollector,
} from "./relevance/RelevanceFilteringJobParser";
import { CareerPagesCrawler } from "../adapters/careerPages/CareerPagesAdapter";

export type CrawlRequest = {
  mode: CrawlMode;
  scope: CrawlScope;
  /** Required when scope is 'platform'. */
  platform?: string | null;
  triggeredBy?: string | null;
  /** Ignore each entry's crawl frequency and run it regardless — what the operator's button does. */
  force?: boolean;
};

export type OrchestratorDependencies = {
  fetcher: CrawlFetcher;
  registry: CompanyRegistryStore;
  store: JobIntelligenceStore;
  reports: CrawlReportStore;
  /** Injectable for deterministic tests. */
  now?: () => number;
};

export class CrawlOrchestrator {
  private readonly now: () => number;

  constructor(private readonly deps: OrchestratorDependencies) {
    this.now = deps.now ?? (() => Date.now());
  }

  async run(request: CrawlRequest): Promise<CrawlReport> {
    const startedAtMs = this.now();
    const startedAt = new Date(startedAtMs).toISOString();
    const platform = request.scope === "platform" ? (request.platform ?? null) : null;

    if (request.scope === "platform" && !platform) {
      throw new Error("A platform is required when scope is 'platform'.");
    }

    const runId = await this.deps.reports.startRun({
      mode: request.mode,
      scope: request.scope,
      platform,
      triggeredBy: request.triggeredBy ?? null,
    });

    try {
      const entries = await this.deps.registry.listEntries(platform ?? undefined);
      const companies: CompanyCrawlReport[] = [];

      for (const entry of entries) {
        companies.push(await this.crawlEntry(entry, request));
      }

      const report = this.buildReport({
        runId,
        request,
        platform,
        startedAt,
        startedAtMs,
        companies,
      });
      await this.deps.reports.finishRun(runId, report);
      return report;
    } catch (err) {
      const message = crawlErrorMessage(err, "Crawl run failed.");
      await this.deps.reports.failRun(runId, message);
      throw err;
    }
  }

  /** Runs one registry entry through the full pipeline and reports its outcome. */
  private async crawlEntry(
    entry: CompanyRegistryEntry,
    request: CrawlRequest,
  ): Promise<CompanyCrawlReport> {
    const entryStart = this.now();
    const base: Omit<CompanyCrawlReport, "status" | "counters" | "durationMs"> = {
      registryId: entry.id,
      companyName: entry.companyName,
      platform: entry.platform,
      careersUrl: entry.careersUrl,
      warnings: [],
      issues: [],
    };

    const finish = (
      status: CompanyCrawlStatus,
      counters: CrawlCounters,
      extra: Partial<CompanyCrawlReport> = {},
    ): CompanyCrawlReport => ({
      ...base,
      ...extra,
      status,
      counters,
      durationMs: Math.max(0, this.now() - entryStart),
      warnings: extra.warnings ?? base.warnings,
      issues: extra.issues ?? base.issues,
    });

    // Module 10B.2: only verified sources are crawled. A BROKEN/BLOCKED/
    // UNAVAILABLE/UNKNOWN source is refused BEFORE any request is made — we
    // already have evidence it will not yield jobs, so spending a request on
    // it would be both wasteful and, for a blocked host, impolite.
    const eligibility = crawlEligibility(entry);
    if (!eligibility.crawlable) {
      await this.markRegistry(entry, "skipped", eligibility.reason, 0, request.mode);
      return finish("skipped", emptyCounters(), { message: eligibility.reason });
    }

    // Not due yet — reported explicitly so a skip is never mistaken for a
    // zero-result crawl.
    if (!isEntryDue(entry, this.now(), request.force ?? false)) {
      await this.markRegistry(entry, "skipped", null, 0, request.mode);
      return finish("skipped", emptyCounters(), {
        message: `Not due — last crawled ${entry.lastCrawlAt}, frequency ${entry.crawlFrequencyHours}h.`,
      });
    }

    const descriptor = getPlatformDescriptor(entry.platform);
    if (!descriptor) {
      const message = `No adapter registered for platform "${entry.platform}".`;
      await this.markRegistry(entry, "failed", message, 0, request.mode);
      return finish("failed", emptyCounters(), { message });
    }

    if (!descriptor.supported) {
      const limitation = descriptor.limitation;
      const message = limitation
        ? `${limitation.displayName} is not crawlable: ${limitation.reason}`
        : `${descriptor.displayName} is not supported.`;
      await this.markRegistry(entry, "failed", message, 0, request.mode);
      return finish("blocked", emptyCounters(), { message });
    }

    const collector = new ValidationCollector();
    const relevanceCollector = new RelevanceCollector();
    /** Filled by the crawler while it runs; read after the pipeline finishes. */
    const observations = newObservations();
    let adapter: PlatformAdapter;
    let resolvedProvider: string | undefined;

    try {
      const built = descriptor.createAdapter(this.deps.fetcher, entry, observations);
      // The India-first region-relevance gate runs BEFORE validation, so an
      // excluded posting never spends validator effort on data we're going to
      // discard anyway, and can never be confused with a data-quality
      // rejection. Both stages are inserted by decorating the parser — see
      // ./relevance/RelevanceFilteringJobParser.ts and
      // ./validate/ValidatingJobParser.ts for why this, and not a forked runner.
      adapter = {
        platform: built.platform,
        crawler: built.crawler,
        parser: new ValidatingJobParser(
          new RelevanceFilteringJobParser(built.parser, relevanceCollector),
          collector,
        ),
      };
      if (built.crawler instanceof CareerPagesCrawler) {
        resolvedProvider = built.crawler.resolveBoard(toCrawlTarget(entry)).provider;
      }
    } catch (err) {
      const message = crawlErrorMessage(err, "Could not build an adapter for this entry.");
      await this.markRegistry(entry, "failed", message, 0, request.mode);
      return finish("failed", emptyCounters(), { message });
    }

    // Dry run swaps ONLY the write method; every other stage is identical.
    const store =
      request.mode === "dry_run"
        ? new DryRunJobIntelligenceStore(this.deps.store)
        : this.deps.store;

    try {
      const result = await runPlatformCrawl(adapter, toCrawlTarget(entry), store);
      const counters = this.countOutcomes(
        result.outcomes,
        collector,
        relevanceCollector,
        result.total,
      );
      // Postings the crawler excluded before parsing (drafts, unpublished).
      counters.skipped += observations.skipped;
      const issues = this.collectIssues(result.outcomes, collector, relevanceCollector);
      const warnings = this.collectWarnings(collector, observations.warnings);

      // Module 10B.2: HTTP 200 is not success. A run that discovered no
      // postings at all did not do the job it was asked to do, even though
      // nothing errored — the board may have moved, emptied, or changed shape,
      // and reporting that as green is how a silently-dead source survives for
      // weeks. It is reported as `failed` with an explicit reason.
      const status: CompanyCrawlStatus =
        counters.discovered === 0
          ? "failed"
          : counters.failed > 0 && counters.imported + counters.duplicates === 0
            ? "failed"
            : counters.failed > 0 || counters.rejected > 0
              ? "partial"
              : "success";

      const zeroDiscoveryMessage =
        counters.discovered === 0
          ? "Source responded but returned no job postings. It may have moved, emptied, or changed format."
          : undefined;

      await this.markRegistry(
        entry,
        status === "failed" ? "failed" : status === "partial" ? "partial" : "success",
        zeroDiscoveryMessage ??
          (counters.failed > 0 ? `${counters.failed} posting(s) failed.` : null),
        counters.imported,
        request.mode,
      );

      return finish(status, counters, {
        issues,
        warnings,
        resolvedProvider,
        message: zeroDiscoveryMessage,
      });
    } catch (err) {
      const message = crawlErrorMessage(err, "Crawl failed for this entry.");
      await this.markRegistry(entry, "failed", message, 0, request.mode);
      return finish(isBlockedError(err) ? "blocked" : "failed", emptyCounters(), {
        message,
        resolvedProvider,
        // Whatever the crawler managed to note before it gave up is still
        // useful context for why it did.
        warnings: observations.warnings.slice(0, MAX_ISSUES_PER_COMPANY),
      });
    }
  }

  /**
   * Turns Module 10A's per-posting outcomes into report counters. `parse_failed`
   * outcomes are split into region-excluded vs validator-skipped vs
   * genuinely-failed by consulting the two collectors, so neither an excluded
   * nor a rejected posting ever inflates the failure count. `parsed` is owned
   * by the relevance collector (Module 10B.3) — it is the innermost decorator
   * around the base parser, so its record count is "postings the parser
   * turned into a structured job" regardless of what either gate later did.
   */
  private countOutcomes(
    outcomes: CrawlRunOutcome[],
    collector: ValidationCollector,
    relevanceCollector: RelevanceCollector,
    discovered: number,
  ): CrawlCounters {
    const counters = emptyCounters();
    counters.discovered = discovered;
    counters.parsed = relevanceCollector.parsedCount;

    for (const outcome of outcomes) {
      switch (outcome.status) {
        case "imported":
          counters.imported++;
          counters.validated++;
          break;
        case "updated":
          counters.updated++;
          counters.duplicates++;
          counters.validated++;
          break;
        case "merged":
          counters.merged++;
          counters.duplicates++;
          counters.validated++;
          break;
        case "store_failed":
          counters.failed++;
          counters.validated++;
          break;
        case "parse_failed":
          if (relevanceCollector.get(outcome.sourceUrl)?.kind === "excluded") {
            counters.excluded++;
          } else if (collector.get(outcome.sourceUrl)?.kind === "skipped") {
            counters.rejected++;
          } else {
            counters.failed++;
          }
          break;
      }
    }

    return counters;
  }

  private collectIssues(
    outcomes: CrawlRunOutcome[],
    collector: ValidationCollector,
    relevanceCollector: RelevanceCollector,
  ): CrawlIssue[] {
    const issues: CrawlIssue[] = [];
    for (const outcome of outcomes) {
      if (issues.length >= MAX_ISSUES_PER_COMPANY) break;
      if (outcome.status === "store_failed") {
        issues.push({
          kind: "store_failed",
          sourceUrl: outcome.sourceUrl,
          reason: outcome.reason ?? "Store write failed.",
        });
      } else if (outcome.status === "parse_failed") {
        const excluded = relevanceCollector.get(outcome.sourceUrl)?.kind === "excluded";
        const skipped = !excluded && collector.get(outcome.sourceUrl)?.kind === "skipped";
        issues.push({
          kind: excluded ? "region_excluded" : skipped ? "validation_skipped" : "parse_failed",
          sourceUrl: outcome.sourceUrl,
          reason: outcome.reason ?? "Parse failed.",
        });
      }
    }
    return issues;
  }

  private collectWarnings(collector: ValidationCollector, crawlerWarnings: string[]): string[] {
    // Bounded: a board of 300 postings with one sanitized field each must not
    // produce a 300-line report. Crawler warnings come first — they explain
    // the shape of the whole run (caps hit, pages missed).
    return [...crawlerWarnings, ...collector.sanitizedNotes].slice(0, MAX_ISSUES_PER_COMPANY);
  }

  private async markRegistry(
    entry: CompanyRegistryEntry,
    status: "success" | "partial" | "failed" | "skipped",
    error: string | null,
    jobsImported: number,
    mode: CrawlMode,
  ): Promise<void> {
    try {
      await this.deps.registry.markCrawlResult(entry.id, {
        status,
        error,
        jobsImported,
        // A dry run must not advance the entry's schedule — it wrote nothing.
        recordAttempt: mode === "live",
      });
    } catch {
      // Bookkeeping must never take down a run that already did real work.
    }
  }

  private buildReport(input: {
    runId: string | null;
    request: CrawlRequest;
    platform: string | null;
    startedAt: string;
    startedAtMs: number;
    companies: CompanyCrawlReport[];
  }): CrawlReport {
    const finishedAtMs = this.now();
    const totals = input.companies.reduce(
      (accumulator, company) => addCounters(accumulator, company.counters),
      emptyCounters(),
    );

    return {
      runId: input.runId,
      mode: input.request.mode,
      scope: input.request.scope,
      platform: input.platform,
      triggeredBy: input.request.triggeredBy ?? null,
      startedAt: input.startedAt,
      finishedAt: new Date(finishedAtMs).toISOString(),
      durationMs: Math.max(0, finishedAtMs - input.startedAtMs),
      companiesScanned: input.companies.length,
      totals,
      companies: input.companies,
      platforms: rollupByPlatform(input.companies),
      limitations: relevantLimitations(input.platform, input.companies),
    };
  }
}

/** Limitations worth showing: the selected platform's, or every blocked platform touched by the run. */
function relevantLimitations(
  platform: string | null,
  companies: CompanyCrawlReport[],
): ReportedLimitation[] {
  const platforms = new Set<string>();
  if (platform) platforms.add(platform.toLowerCase());
  for (const company of companies) {
    if (company.status === "blocked") platforms.add(company.platform.toLowerCase());
  }

  const out: ReportedLimitation[] = [];
  for (const tag of platforms) {
    const limitation = getPlatformLimitation(tag);
    if (limitation) {
      out.push({
        platform: limitation.platform,
        displayName: limitation.displayName,
        reason: limitation.reason,
        unblockedBy: limitation.unblockedBy,
      });
    }
  }
  return out;
}

/** Every declared limitation, for the admin UI's standing "what we can't crawl" panel. */
export function allReportedLimitations(): ReportedLimitation[] {
  return PLATFORM_CATALOG.filter((descriptor) => descriptor.limitation).map((descriptor) => ({
    platform: descriptor.limitation!.platform,
    displayName: descriptor.limitation!.displayName,
    reason: descriptor.limitation!.reason,
    unblockedBy: descriptor.limitation!.unblockedBy,
  }));
}
