// ── Module 10A: Job Intelligence Foundation ──
//
// Architecture-only phase: the complete ingestion pipeline —
//   Crawler → Adapter → Parser → Normalizer → Deduplicator → Database
// — plus company/role normalization, a deterministic (non-AI) resume match
// engine, and a search-index field strategy. Deliberately ships with ZERO
// platform adapters (no LinkedIn/Greenhouse/Lever/etc. crawler) — see
// adapters/AdapterRegistry.ts. A future module adds a platform by
// implementing one PlatformAdapter and registering it; nothing else here
// changes.
//
// Entry points for other code:
//   - runPlatformCrawl(adapter, target, store) — the only ingestion path.
//   - requireAdmin(accessToken) — the only auth gate; see
//     src/server-functions/jobIntelligence.ts for the createServerFn
//     boundary a UI/script actually calls.
//   - matchResumeToJob(resume, job) — deterministic, AI-free resume match.
//   - buildSearchIndexDocument(jobId, job) — the search-index field
//     contract (no search UI yet).

export * from "./types";
export * from "./normalize";
export * from "./dedup/DeduplicationEngine";
export * from "./parsers/types";
export * from "./parsers/utils";
export * from "./adapters/types";
export { AdapterRegistry, adapterRegistry } from "./adapters/AdapterRegistry";
export * from "./search/searchIndex";
export * from "./resumeMatch/DeterministicResumeMatch";
export * from "./store/JobIntelligenceStore";
export { SupabaseJobIntelligenceStore } from "./store/SupabaseJobIntelligenceStore";
export * from "./CrawlRunner";
export { requireAdmin, AdminAccessError } from "./adminAuth";
