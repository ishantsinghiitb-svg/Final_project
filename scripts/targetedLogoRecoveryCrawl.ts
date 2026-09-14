// ── Targeted logo recovery crawl: Meesho (Lever) + Sarvam AI (Ashby) ──
//
// Approved production recovery for the 27 rows (10 Lever + 17 Ashby)
// identified as missing company_logo_url, both traced to exactly these two
// companies. This is a REAL, scoped, LIVE crawl (mode: "live") — not a dry
// run — using the exact same production pipeline every other crawl uses
// (CrawlOrchestrator -> platform adapter -> admin_upsert_global_job via
// SupabaseJobIntelligenceStore, including the just-deployed boardLogo.ts
// sample-posting-page fallback and companyLogo.ts identity matching). No
// logo URL is ever written directly; every value that reaches the database
// goes through that same resolver and store path.
//
// Scoped, not a blind full crawl: `ScopedRegistryStore` (mirrors the
// pattern in scripts/dryRunRecoveredSources.ts) filters the registry down to
// exactly these two company names before the orchestrator ever sees it, so
// it is architecturally impossible for this run to touch any other company.
//
// Run with: npx vite-node scripts/targetedLogoRecoveryCrawl.ts

import { HttpFetcher } from "../src/server/jobIntelligence/crawl/HttpFetcher";
import { CrawlOrchestrator } from "../src/server/jobIntelligence/crawl/CrawlOrchestrator";
import { SupabaseCompanyRegistryStore } from "../src/server/jobIntelligence/crawl/registry/SupabaseCompanyRegistryStore";
import { SupabaseJobIntelligenceStore } from "../src/server/jobIntelligence/store/SupabaseJobIntelligenceStore";
import { SupabaseCrawlReportStore } from "../src/server/jobIntelligence/crawl/report/CrawlReportStore";
import type {
  CompanyRegistryEntry,
  CompanyRegistryStore,
  RegistryCrawlResult,
} from "../src/server/jobIntelligence/crawl/registry/CompanyRegistry";
import type { SourceVerification } from "../src/server/jobIntelligence/crawl/verify/SourceVerifier";

const TARGET_COMPANIES = ["Meesho", "Sarvam AI"];

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

async function main(): Promise<void> {
  const fetcher = new HttpFetcher();
  const realRegistry = new SupabaseCompanyRegistryStore();
  const registry = new ScopedRegistryStore(realRegistry, TARGET_COMPANIES);

  const entries = await registry.listAllEntries();
  console.log("Scoped registry entries for this run:");
  for (const entry of entries) {
    console.log(`  ${entry.companyName} — platform=${entry.platform} enabled=${entry.enabled}`);
  }
  if (entries.length !== TARGET_COMPANIES.length) {
    console.error(
      `Expected exactly ${TARGET_COMPANIES.length} entries (${TARGET_COMPANIES.join(", ")}), found ${entries.length}. Aborting without crawling.`,
    );
    process.exit(1);
  }

  const orchestrator = new CrawlOrchestrator({
    fetcher,
    registry,
    store: new SupabaseJobIntelligenceStore(),
    reports: new SupabaseCrawlReportStore(),
  });

  console.log("\n== Starting LIVE targeted crawl (Meesho + Sarvam AI only) ==\n");
  const report = await orchestrator.run({
    mode: "live",
    scope: "all",
    triggeredBy: "recovery:targetedLogoRecoveryCrawl",
    force: true,
  });

  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
