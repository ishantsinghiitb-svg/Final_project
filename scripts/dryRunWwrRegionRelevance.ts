// ── Module 10B.3 Phase 1: live, read-only dry-run verification ──
//
// Runs the real, unmodified CrawlOrchestrator against both live WWR registry
// entries in dry_run mode, scoped to platform "weworkremotely" only, so the
// new India-first region-relevance gate can be checked against real feed
// data. Zero database writes, by the same construction already established
// for this kind of diagnostic (see scripts/dryRunRecoveredSources.ts):
//   - mode: "dry_run" -> DryRunJobIntelligenceStore suppresses the one write
//     method; SupabaseCompanyRegistryStore.markCrawlResult no-ops before any
//     write when recordAttempt is false (always false for a dry run).
//   - Report persistence uses an in-memory store, so nothing is written to
//     crawl_runs either.
//
// Run with: npx vite-node scripts/dryRunWwrRegionRelevance.ts

import { HttpFetcher } from "../src/server/jobIntelligence/crawl/HttpFetcher";
import { CrawlOrchestrator } from "../src/server/jobIntelligence/crawl/CrawlOrchestrator";
import { SupabaseCompanyRegistryStore } from "../src/server/jobIntelligence/crawl/registry/SupabaseCompanyRegistryStore";
import { SupabaseJobIntelligenceStore } from "../src/server/jobIntelligence/store/SupabaseJobIntelligenceStore";
import { InMemoryReportStore } from "../src/server/jobIntelligence/crawl/testing/fakes";

async function main() {
  const orchestrator = new CrawlOrchestrator({
    fetcher: new HttpFetcher(),
    registry: new SupabaseCompanyRegistryStore(),
    store: new SupabaseJobIntelligenceStore(),
    reports: new InMemoryReportStore(),
  });

  const report = await orchestrator.run({
    mode: "dry_run",
    scope: "platform",
    platform: "weworkremotely",
    triggeredBy: "diagnostic:dryRunWwrRegionRelevance",
    force: true,
  });

  const summary = {
    totals: report.totals,
    companies: report.companies.map((c) => ({
      companyName: c.companyName,
      status: c.status,
      counters: c.counters,
      excludedSamples: c.issues.filter((i) => i.kind === "region_excluded").slice(0, 10),
    })),
  };

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
