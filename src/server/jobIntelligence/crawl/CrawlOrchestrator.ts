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
import {
  EligibilityCollector,
  EligibilityFilteringJobParser,
} from "./eligibility/EligibilityFilteringJobParser";
import { QualityCollector, QualityFilteringJobParser } from "./quality/QualityFilteringJobParser";
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
  /** Overrides RUN_DEADLINE_MS — for tests; production uses the default. */
  maxRunDurationMs?: number;
  /** Overrides ENTRY_TIMEOUT_MS — for tests; production uses the default. */
  entryTimeoutMs?: number;
};

/**
 * Wall-clock ceiling on when `run()` may START its NEXT entry (Module 13 fix
 * — see the "Dry Run reported crawl failed" investigation).
 *
 * `runRegistryCrawl` is a single synchronous request/response cycle, and the
 * registry this iterates over is large (~180 entries — see
 * PlatformCrawlSummary's doc comment) with NO scope narrower than "platform"
 * available from the UI's default (no platform selected) — "Dry Run"/"Crawl
 * All" both mean "every enabled entry, in one call". An unbounded loop over
 * the full registry routinely ran for many minutes before this existed.
 *
 * IMPORTANT — this bounds when a NEW entry starts, not the run's total
 * duration. A live production Dry Run with this exact deadline still
 * measured 80.1s end to end (45s deadline + ~35s for the ONE entry that was
 * already in flight when the deadline passed to finish on its own) — see
 * ENTRY_TIMEOUT_MS below, which is the other half of the fix: it bounds how
 * long that already-started entry is itself allowed to run, so the two
 * together (not this constant alone) bound the run's TOTAL wall time.
 *
 * Lowered from the original 45s to 30s given that live evidence: the typical
 * overrun from one in-flight entry is tens of seconds on its own, so the
 * deadline itself needed more headroom underneath it, not just a cap on new
 * entries starting. Neither number has been verified against this project's
 * actual deployed platform limits (not observable from this environment) —
 * tune down further if a live run still fails, tune up once the real ceiling
 * is confirmed.
 *
 * When the deadline is reached, `run()` stops starting NEW entries (an
 * in-flight entry is never aborted mid-write — see ENTRY_TIMEOUT_MS for what
 * "aborted" means here) and reports every remaining entry as `skipped` with
 * an explicit reason — never silently dropped, and never counted as failed.
 * The run still finishes normally: `finishRun` persists a real report, so
 * "View Last Crawl Report" always has something to show, and the operator
 * can simply run again for the remainder.
 */
export const RUN_DEADLINE_MS = 30_000;

/**
 * Wall-clock ceiling on ONE entry's own crawl (Module 13 — the 80.1s live
 * duration investigation). Before this existed, nothing bounded how long a
 * SINGLE already-started entry could run: HttpFetcher's own retry/backoff on
 * ONE request already worst-cases at ~62s (20s timeout × up to 3 attempts,
 * plus backoff between — see HttpFetcher.ts's DEFAULT_TIMEOUT_MS/
 * DEFAULT_RETRIES/RETRY_BASE_DELAY_MS/RETRY_MAX_DELAY_MS, all unchanged), and
 * several ATS providers paginate or fetch one request per posting (Lever and
 * SmartRecruiters page until a short page; Internshala fetches up to
 * maxDetailFetches individual detail pages per company — see
 * InternshalaAdapter.ts's DEFAULT_INTERNSHALA_LIMITS) — so ONE entry could
 * legitimately issue dozens of sequential requests, each with its own
 * multi-attempt worst case. RUN_DEADLINE_MS only ever bounded when a NEW
 * entry could START; nothing bounded an entry already running.
 *
 * 90s is deliberately generous, not tight: real, SUCCESSFUL (non-retrying)
 * Internshala entries were observed taking up to ~60s each (30 sequential
 * detail-page fetches), and a single legitimately-retrying request can
 * already cost ~62s on its own (above) — a shorter watchdog would abort
 * entries that were genuinely going to succeed, turning real coverage into
 * false failures. This does not shrink the TYPICAL run's duration (a normal
 * entry finishes in seconds, long before this ever matters); what it fixes
 * is the previously-UNBOUNDED pathological case (a large, paginated board
 * failing repeatedly) — that is now capped at a known worst case instead of
 * running for minutes.
 *
 * Implemented as a race around ONE entry's `runPlatformCrawl` call, not
 * real cancellation: nothing here can (or needs to) touch HttpFetcher/the
 * ATS adapters to add an AbortSignal. A timeout is reported exactly like any
 * other per-entry failure (`status: "failed"`) — safe, because every write
 * this pipeline makes is already atomic per posting; abandoning the rest of
 * one entry's own loop never leaves a corrupt or partial row.
 */
export const ENTRY_TIMEOUT_MS = 90_000;

/** Thrown into `crawlEntry`'s own catch when ENTRY_TIMEOUT_MS is reached — handled exactly like any other per-entry failure. */
class EntryTimeoutError extends Error {
  constructor(ms: number) {
    super(`Timed out after ${ms}ms — this entry took too long and was abandoned for this run.`);
    this.name = "EntryTimeoutError";
  }
}

/**
 * Round-robins a fetched, already-per-platform-ordered entry list across
 * platforms: one entry from each platform present, in turn, until every
 * entry has been placed. Each platform's OWN relative order (least-recently-
 * crawled first) is preserved — this only interleaves BETWEEN platforms, it
 * never reorders WITHIN one. Platform turn order follows first appearance in
 * the input, which — given the input is itself least-recently-crawled-first
 * — means the platform with the single most overdue entry goes first each
 * round; a principled tie-break, not an arbitrary one.
 *
 * Pure and synchronous: exported standalone (not a private method) so it can
 * be unit-tested directly, without a store/fetcher/clock.
 */
export function interleaveByPlatform(entries: CompanyRegistryEntry[]): CompanyRegistryEntry[] {
  const groups = new Map<string, CompanyRegistryEntry[]>();
  const platformOrder: string[] = [];
  for (const entry of entries) {
    let group = groups.get(entry.platform);
    if (!group) {
      group = [];
      groups.set(entry.platform, group);
      platformOrder.push(entry.platform);
    }
    group.push(entry);
  }

  const result: CompanyRegistryEntry[] = [];
  for (let round = 0; result.length < entries.length; round++) {
    for (const platform of platformOrder) {
      const group = groups.get(platform)!;
      if (round < group.length) result.push(group[round]);
    }
  }
  return result;
}

export class CrawlOrchestrator {
  private readonly now: () => number;
  private readonly maxRunDurationMs: number;
  private readonly entryTimeoutMs: number;

  constructor(private readonly deps: OrchestratorDependencies) {
    this.now = deps.now ?? (() => Date.now());
    this.maxRunDurationMs = deps.maxRunDurationMs ?? RUN_DEADLINE_MS;
    this.entryTimeoutMs = deps.entryTimeoutMs ?? ENTRY_TIMEOUT_MS;
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
      const fetched = await this.deps.registry.listEntries(platform ?? undefined);
      // Module 13: fair scheduling across platforms. The registry read above
      // already orders each platform's OWN entries least-recently-crawled
      // first (see SupabaseCompanyRegistryStore.listEntries); this then
      // interleaves ACROSS platforms so a large one (career-pages, ~56
      // entries) cannot occupy the entire time budget before a small one
      // (internshala, ~2) ever gets a turn — every platform present gets one
      // entry per round. A no-op when `scope` is 'platform' (one group) or
      // there is only one platform enabled. Purely an in-memory reordering of
      // THIS invocation's own freshly-fetched list — no persisted cursor, so
      // it costs nothing across the stateless Worker boundary; the actual
      // cross-run progress comes entirely from `last_crawl_at` above.
      const entries = interleaveByPlatform(fetched);
      const companies: CompanyCrawlReport[] = [];
      let deadlineHit = false;

      for (const entry of entries) {
        // Checked BEFORE starting the next entry, never mid-crawl — an
        // in-flight fetch/store sequence always runs to completion, so a
        // truncated run can never leave a partial write for one entry.
        if (this.now() - startedAtMs >= this.maxRunDurationMs) {
          deadlineHit = true;
          break;
        }
        companies.push(await this.crawlEntry(entry, request));
      }

      if (deadlineHit) {
        // Placeholder reports only — no `crawlEntry` call, no registry write,
        // no network request, so surfacing them costs nothing of the budget
        // that just ran out. Never marked "failed": these entries were never
        // attempted, exactly like the existing "not due yet" skip.
        for (const entry of entries.slice(companies.length)) {
          companies.push({
            registryId: entry.id,
            companyName: entry.companyName,
            platform: entry.platform,
            careersUrl: entry.careersUrl,
            status: "skipped",
            counters: emptyCounters(),
            durationMs: 0,
            warnings: [],
            issues: [],
            message:
              "Not reached — this run's time budget was used by earlier entries. Run again to continue with the rest.",
          });
        }
      }

      const report = this.buildReport({
        runId,
        request,
        platform,
        startedAt,
        startedAtMs,
        companies,
        truncated: deadlineHit,
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
    const eligibilityCollector = new EligibilityCollector();
    const qualityCollector = new QualityCollector();
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
        // Four gates, innermost first:
        //   relevance    — the source's own applicant-eligibility signal
        //   eligibility  — this catalog's India-only + 30-day rules
        //   quality      — the platform-thresholded role-taxonomy classifier
        //   validation   — data quality
        // Eligibility sits before quality so an out-of-scope posting never
        // spends classifier effort; quality sits before validation for the
        // same reason (no point validating field completeness of a title
        // we've already decided not to keep). Relevance stays innermost and
        // keeps owning the report's `parsed` count.
        parser: new ValidatingJobParser(
          new QualityFilteringJobParser(
            new EligibilityFilteringJobParser(
              new RelevanceFilteringJobParser(built.parser, relevanceCollector),
              eligibilityCollector,
              // The orchestrator's injectable clock reaches the freshness rule
              // too, so a test that controls time controls eligibility with it.
              { now: new Date(this.now()) },
            ),
            qualityCollector,
          ),
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
      const result = await this.withEntryTimeout(runPlatformCrawl(adapter, toCrawlTarget(entry), store));
      const counters = this.countOutcomes(
        result.outcomes,
        collector,
        relevanceCollector,
        eligibilityCollector,
        qualityCollector,
        result.total,
      );
      // Postings the crawler excluded before parsing (drafts, unpublished).
      counters.skipped += observations.skipped;
      const issues = this.collectIssues(
        result.outcomes,
        collector,
        relevanceCollector,
        eligibilityCollector,
        qualityCollector,
      );
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
    eligibilityCollector: EligibilityCollector,
    qualityCollector: QualityCollector,
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
        case "parse_failed": {
          const ineligible = eligibilityCollector.get(outcome.sourceUrl);
          if (relevanceCollector.get(outcome.sourceUrl)?.kind === "excluded") {
            counters.excluded++;
          } else if (ineligible?.kind === "ineligible") {
            if (ineligible.rule === "location") counters.ineligibleLocation++;
            else counters.ineligibleStale++;
          } else if (qualityCollector.get(outcome.sourceUrl)?.kind === "low_quality") {
            counters.lowQuality++;
          } else if (collector.get(outcome.sourceUrl)?.kind === "skipped") {
            counters.rejected++;
          } else {
            counters.failed++;
          }
          break;
        }
      }
    }

    return counters;
  }

  private collectIssues(
    outcomes: CrawlRunOutcome[],
    collector: ValidationCollector,
    relevanceCollector: RelevanceCollector,
    eligibilityCollector: EligibilityCollector,
    qualityCollector: QualityCollector,
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
        const ineligible = eligibilityCollector.get(outcome.sourceUrl);
        const lowQuality =
          !excluded &&
          ineligible?.kind !== "ineligible" &&
          qualityCollector.get(outcome.sourceUrl)?.kind === "low_quality";
        const skipped =
          !excluded &&
          ineligible?.kind !== "ineligible" &&
          !lowQuality &&
          collector.get(outcome.sourceUrl)?.kind === "skipped";

        let kind: CrawlIssue["kind"] = "parse_failed";
        if (excluded) kind = "region_excluded";
        else if (ineligible?.kind === "ineligible") {
          kind = ineligible.rule === "location" ? "not_india" : "stale_posting";
        } else if (lowQuality) kind = "low_quality";
        else if (skipped) kind = "validation_skipped";

        issues.push({
          kind,
          sourceUrl: outcome.sourceUrl,
          reason: outcome.reason ?? "Parse failed.",
        });
      }
    }
    return issues;
  }

  /**
   * Bounds how long ONE entry's crawl is awaited — see ENTRY_TIMEOUT_MS.
   * Not real cancellation (no AbortSignal reaches HttpFetcher/the ATS
   * adapters): the loser of the race is simply never awaited further. A
   * timeout rejects with `EntryTimeoutError`, which `crawlEntry`'s existing
   * catch block already handles exactly like any other per-entry failure.
   */
  private withEntryTimeout<T>(work: Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => reject(new EntryTimeoutError(this.entryTimeoutMs)), this.entryTimeoutMs);
      work.then(
        (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        (err) => {
          clearTimeout(timer);
          reject(err);
        },
      );
    });
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
    truncated: boolean;
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
      truncated: input.truncated,
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
