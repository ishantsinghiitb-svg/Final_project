// ── Module 10B.1: Job Crawlers (Phase 1) ──
//
// Adds real platform adapters to the Module 10A pipeline, plus the operator
// layer that module left open: a Company Registry, a Validator stage, dry runs
// and persisted crawl reports.
//
//   Company Registry → Crawler → Parser → Validator → Normalizer →
//   Deduplicator → admin_upsert_global_job → job_sources
//
// Every stage after Parser is Module 10A's, unchanged. Entry points:
//   - CrawlOrchestrator.run(request)  — the operator-level crawl.
//   - listPlatformSummaries()         — what the admin UI lists.
//   - PLATFORM_LIMITATIONS            — platforms this phase cannot crawl,
//                                       with the evidence for each verdict.

export * from "./errors";
export * from "./limitations";
export {
  HttpFetcher,
  CRAWLER_USER_AGENT,
  looksLikeChallengePage,
  parseJsonResult,
  type CrawlFetcher,
  type FetchResult,
  type FetchOptions,
  type FetchFailureKind,
} from "./HttpFetcher";
export * from "./PlatformCatalog";
export * from "./CrawlOrchestrator";
export * from "./DryRunStore";
export * from "./registerAdapters";
export * from "./registry/CompanyRegistry";
export * from "./registry/companyIdentity";
export { SupabaseCompanyRegistryStore } from "./registry/SupabaseCompanyRegistryStore";
export * from "./verify/SourceVerifier";
export * from "./verify/seedRules";
export * from "./verify/SourceHealthService";
export * from "./registry/registryLoader";
export {
  SupabaseSourceVerificationStore,
  type SourceVerificationStore,
  type StartVerificationRunInput,
} from "./verify/SourceVerificationStore";
export * from "./report/CrawlReport";
export {
  SupabaseCrawlReportStore,
  type CrawlReportStore,
  type StartRunInput,
} from "./report/CrawlReportStore";
export * from "./validate/JobValidator";
export * from "./validate/ValidatingJobParser";
