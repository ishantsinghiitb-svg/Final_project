// ── Module 10B.1: the Company Registry ──
//
// Crawl targets are DATA. A crawler never knows about a specific company;
// it reads entries from here and is handed a `CrawlTarget`. Adding a company
// is one row in `crawl_company_registry` — no code change, no deploy.
//
// The store interface is kept narrow (list / mark-result) so it can be backed
// by Supabase in production and an in-memory fake in tests, the same seam
// `JobIntelligenceStore` already establishes for the Database stage.

import type { CrawlTarget } from "../../adapters/types";
import type { SourceHealth, SourceVerification } from "../verify/SourceVerifier";

export type CompanyRegistryEntry = {
  id: string;
  companyName: string;
  careersUrl: string;
  /** The adapter tag that handles this entry (matches `PlatformAdapter.platform`). */
  platform: string;
  enabled: boolean;
  crawlFrequencyHours: number;
  lastCrawlAt: string | null;
  lastSuccessAt: string | null;
  lastStatus: "success" | "partial" | "failed" | "skipped" | null;
  lastError: string | null;
  lastJobsImported: number | null;
  notes: string | null;
  /** Adapter-specific overrides; `{}` when unused. */
  config: unknown;

  // ── Module 10B.1.5: identity + source health ──
  // Health is deliberately SEPARATE from the `last*` crawl fields above: a
  // board can be healthy while the last crawl failed transiently, and a URL
  // can be broken for weeks while `lastStatus` still reads a stale 'success'.
  /** Owning group when this entry is a subsidiary that hires separately. */
  parentCompany: string | null;
  /** Other names for the SAME hiring entity. */
  aliases: string[];
  healthStatus: SourceHealth | null;
  lastCheckedAt: string | null;
  lastHealthSuccessAt: string | null;
  lastFailureAt: string | null;
  httpStatus: number | null;
  /** ATS id, or "custom_careers", or null when undetermined. */
  detectedPlatform: string | null;
  errorReason: string | null;
  /** Where the URL actually resolved, when it moved. */
  resolvedUrl: string | null;
  postingsSeen: number | null;
};

/** The outcome written back to a registry entry after a crawl attempt. */
export type RegistryCrawlResult = {
  status: "success" | "partial" | "failed" | "skipped";
  error: string | null;
  jobsImported: number;
  /** Dry runs must not advance `last_crawl_at` — they didn't consume the entry's schedule. */
  recordAttempt: boolean;
};

export interface CompanyRegistryStore {
  /** Enabled entries, optionally narrowed to one platform. */
  listEntries(platform?: string): Promise<CompanyRegistryEntry[]>;
  /** Every entry regardless of `enabled`, for the admin list. */
  listAllEntries(): Promise<CompanyRegistryEntry[]>;
  markCrawlResult(entryId: string, result: RegistryCrawlResult): Promise<void>;
  /** Records the outcome of a source-health verification (Module 10B.1.5). */
  markVerification(entryId: string, verification: SourceVerification): Promise<void>;
}

/** Counts by health status — what the admin panel's rollup renders. */
export type HealthRollup = Record<SourceHealth | "UNCHECKED", number>;

export function emptyHealthRollup(): HealthRollup {
  return {
    HEALTHY: 0,
    REDIRECTED: 0,
    BLOCKED: 0,
    BROKEN: 0,
    UNAVAILABLE: 0,
    UNKNOWN: 0,
    UNCHECKED: 0,
  };
}

/** Tallies registry entries by health. Never-verified entries are UNCHECKED, not UNKNOWN. */
export function rollupHealth(entries: CompanyRegistryEntry[]): HealthRollup {
  const rollup = emptyHealthRollup();
  for (const entry of entries) {
    rollup[entry.healthStatus ?? "UNCHECKED"] += 1;
  }
  return rollup;
}

/**
 * Whether an entry is due, given its frequency and last crawl. Entries never
 * crawled are always due. `force` (the operator pressing "Crawl") overrides
 * the schedule — the frequency is a floor for automatic selection, not a lock.
 */
export function isEntryDue(
  entry: CompanyRegistryEntry,
  now: number = Date.now(),
  force = false,
): boolean {
  if (force) return true;
  if (!entry.lastCrawlAt) return true;
  const last = Date.parse(entry.lastCrawlAt);
  if (Number.isNaN(last)) return true;
  return now - last >= entry.crawlFrequencyHours * 60 * 60 * 1000;
}

/**
 * Maps a registry entry to the `CrawlTarget` its adapter expects. Every
 * platform in this phase is driven by a URL, so this is uniform today — it is
 * a function rather than an inline expression so a future query-driven
 * platform has one place to slot into.
 */
export function toCrawlTarget(entry: CompanyRegistryEntry): CrawlTarget {
  return { kind: "company", companyCareerUrl: entry.careersUrl };
}
