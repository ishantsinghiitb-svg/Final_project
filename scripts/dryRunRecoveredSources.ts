// ── Module 10B.2.5: scoped post-recovery verification (Razorpay / Innovaccer / MoEngage) ──
//
// No company-scoped dry run exists in the admin UI/backend today —
// `runRegistryCrawl` only narrows by platform ("all" or one platform tag),
// and all three of these companies share the "career-pages" registry
// platform along with 40+ others. Rather than add a new UI feature or widen
// the orchestrator's scoping for a one-off verification, this script wraps
// the REAL, unmodified `CrawlOrchestrator` with a registry view filtered to
// just these three ids for the counters, and separately reads a few sample
// postings straight from the same production adapter code for display —
// neither path touches CrawlOrchestrator.ts or any other pipeline file.
//
// Zero database writes, by construction:
//   - Part 1 (counters) runs mode: "dry_run", which makes the orchestrator
//     wrap the store in DryRunJobIntelligenceStore — its only write method
//     never reaches the database (see DryRunStore.ts). Dedup reads are real.
//     `SupabaseCompanyRegistryStore.markCrawlResult` itself no-ops before any
//     write when `recordAttempt` is false, which a dry run always passes.
//     Report persistence uses an in-memory store, so nothing is written to
//     crawl_runs either — this is a scoped, non-representative run.
//   - Part 2 (samples) calls the platform's crawler + parser directly — the
//     same two objects CrawlOrchestrator itself would build — with no
//     store, no registry writes, and no validator/normalizer/dedup stage at
//     all. It reads job postings off the network and prints them. Nothing
//     is written anywhere.
//
// Run with: npx vite-node scripts/dryRunRecoveredSources.ts

import { HttpFetcher } from "../src/server/jobIntelligence/crawl/HttpFetcher";
import { CrawlOrchestrator } from "../src/server/jobIntelligence/crawl/CrawlOrchestrator";
import { SupabaseCompanyRegistryStore } from "../src/server/jobIntelligence/crawl/registry/SupabaseCompanyRegistryStore";
import { SupabaseJobIntelligenceStore } from "../src/server/jobIntelligence/store/SupabaseJobIntelligenceStore";
import { InMemoryReportStore } from "../src/server/jobIntelligence/crawl/testing/fakes";
import { newObservations } from "../src/server/jobIntelligence/crawl/CrawlObservations";
import { getPlatformDescriptor } from "../src/server/jobIntelligence/crawl/PlatformCatalog";
import {
  toCrawlTarget,
  type CompanyRegistryEntry,
  type CompanyRegistryStore,
  type RegistryCrawlResult,
} from "../src/server/jobIntelligence/crawl/registry/CompanyRegistry";
import type { SourceVerification } from "../src/server/jobIntelligence/crawl/verify/SourceVerifier";

const TARGET_COMPANIES = ["Razorpay", "Innovaccer", "MoEngage"];
const SAMPLE_SIZE = 3;

/** Delegates everything to the real store; only narrows which entries a crawl sees. */
class ScopedRegistryStore implements CompanyRegistryStore {
  constructor(
    private readonly inner: CompanyRegistryStore,
    private readonly companyNames: string[],
  ) {}

  async listEntries(): Promise<CompanyRegistryEntry[]> {
    const all = await this.inner.listAllEntries();
    return all.filter((entry) => entry.enabled && this.companyNames.includes(entry.companyName));
  }

  async listAllEntries(): Promise<CompanyRegistryEntry[]> {
    const all = await this.inner.listAllEntries();
    return all.filter((entry) => this.companyNames.includes(entry.companyName));
  }

  markCrawlResult(entryId: string, result: RegistryCrawlResult): Promise<void> {
    return this.inner.markCrawlResult(entryId, result);
  }

  markVerification(entryId: string, verification: SourceVerification): Promise<void> {
    return this.inner.markVerification(entryId, verification);
  }
}

async function runScopedDryRun(fetcher: HttpFetcher, realRegistry: SupabaseCompanyRegistryStore) {
  const registry = new ScopedRegistryStore(realRegistry, TARGET_COMPANIES);
  const reports = new InMemoryReportStore();
  const orchestrator = new CrawlOrchestrator({
    fetcher,
    registry,
    store: new SupabaseJobIntelligenceStore(),
    reports,
  });

  return orchestrator.run({
    mode: "dry_run",
    scope: "all",
    triggeredBy: "diagnostic:dryRunRecoveredSources",
    force: true,
  });
}

/** Reads a few real postings straight from the crawler+parser — no store, no writes. */
async function sampleJobs(fetcher: HttpFetcher, entry: CompanyRegistryEntry) {
  try {
    const descriptor = getPlatformDescriptor(entry.platform);
    if (!descriptor?.supported) {
      return { error: "No supported adapter for this platform.", jobs: [] };
    }

    const adapter = descriptor.createAdapter(fetcher, entry, newObservations());
    const raws = await adapter.crawler.fetchRawPostings(toCrawlTarget(entry));

    const jobs = [];
    const parseFailures: string[] = [];
    for (const raw of raws.slice(0, SAMPLE_SIZE)) {
      const outcome = adapter.parser.parse(raw);
      if (outcome.ok) {
        jobs.push({
          role: outcome.job.role,
          companyName: outcome.job.companyName,
          applicationUrl: outcome.job.url ?? null,
          sourceUrl: outcome.job.sourceUrl ?? null,
          location: outcome.job.location ?? null,
          workMode: outcome.job.workMode ?? null,
          remote: outcome.job.remote ?? null,
          employmentType: outcome.job.employmentType ?? null,
        });
      } else {
        parseFailures.push(outcome.reason);
      }
    }
    return { error: null, totalDiscovered: raws.length, jobs, parseFailures };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err), jobs: [] };
  }
}

async function main() {
  const fetcher = new HttpFetcher();
  const realRegistry = new SupabaseCompanyRegistryStore();

  const report = await runScopedDryRun(fetcher, realRegistry);

  const entries = (await realRegistry.listAllEntries()).filter((entry) =>
    TARGET_COMPANIES.includes(entry.companyName),
  );

  const samples: Record<string, Awaited<ReturnType<typeof sampleJobs>>> = {};
  for (const entry of entries) {
    samples[entry.companyName] = await sampleJobs(fetcher, entry);
  }

  console.log(
    JSON.stringify(
      {
        report,
        registryEntries: entries,
        samples,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
