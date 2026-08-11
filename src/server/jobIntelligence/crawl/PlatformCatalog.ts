// ── Module 10B.1: the platform catalog ──
//
// One place that answers "which platforms exist, are they supported, and how
// do I build an adapter for a registry entry?". The admin UI reads it to list
// platforms; the orchestrator reads it to run one.
//
// Adapters are built PER REGISTRY ENTRY rather than once per process because
// the Company Career Pages adapter needs that entry's company name and
// `config` overrides to resolve its ATS board. Platforms that need no context
// simply ignore the entry.
//
// Blocked platforms (Wellfound / Foundit / IIMJobs — see ./limitations.ts) are
// listed here too, with `supported: false`. They resolve to
// `BlockedPlatformAdapter`, so choosing one produces a reasoned report entry
// rather than a missing option the operator has to guess about.

import { createBlockedAdapter } from "../adapters/blocked/BlockedPlatformAdapter";
import {
  CAREER_PAGES_PLATFORM,
  CareerPagesCrawler,
  CareerPagesParser,
} from "../adapters/careerPages/CareerPagesAdapter";
import { DEFAULT_ATS_LIMITS } from "../adapters/careerPages/ats/types";
import {
  createInternshalaAdapter,
  DEFAULT_INTERNSHALA_LIMITS,
  INTERNSHALA_PLATFORM,
} from "../adapters/internshala/InternshalaAdapter";
import {
  createWeWorkRemotelyAdapter,
  WWR_PLATFORM,
} from "../adapters/weWorkRemotely/WeWorkRemotelyAdapter";
import type { PlatformAdapter } from "../adapters/types";
import type { CrawlFetcher } from "./HttpFetcher";
import type { CrawlObservations } from "./CrawlObservations";
import { PLATFORM_LIMITATIONS, type PlatformLimitation } from "./limitations";
import type { CompanyRegistryEntry } from "./registry/CompanyRegistry";

export type PlatformDescriptor = {
  platform: string;
  displayName: string;
  /** False for platforms this module knowingly cannot crawl. */
  supported: boolean;
  /** How postings are obtained — shown in the admin UI so the method is never a mystery. */
  method: string;
  /** Present when `supported` is false. */
  limitation?: PlatformLimitation;
  /**
   * Builds the adapter for one registry entry. `observations` is a sink the
   * crawler fills with warnings, deliberately-excluded posting counts and a
   * completeness flag — `PlatformCrawler.fetchRawPostings` is Module 10A's
   * frozen signature and can only return payloads, so this is how those reach
   * the crawl report. See ./CrawlObservations.ts.
   */
  createAdapter: (
    fetcher: CrawlFetcher,
    entry: CompanyRegistryEntry,
    observations: CrawlObservations,
  ) => PlatformAdapter;
};

const SUPPORTED: PlatformDescriptor[] = [
  {
    platform: CAREER_PAGES_PLATFORM,
    displayName: "Company Career Pages",
    supported: true,
    method:
      "Public ATS job-board APIs (Greenhouse, Lever, Ashby, SmartRecruiters, Workable, Recruitee) " +
      "with a schema.org JSON-LD fallback for pages on no known ATS.",
    createAdapter: (fetcher, entry, observations) => ({
      platform: CAREER_PAGES_PLATFORM,
      crawler: new CareerPagesCrawler(
        fetcher,
        { companyName: entry.companyName, config: entry.config },
        DEFAULT_ATS_LIMITS,
        observations,
      ),
      parser: new CareerPagesParser(),
    }),
  },
  {
    platform: WWR_PLATFORM,
    displayName: "We Work Remotely",
    supported: true,
    method: "Official RSS feeds (robots.txt: Allow: /).",
    createAdapter: (fetcher, _entry, observations) =>
      createWeWorkRemotelyAdapter(fetcher, observations),
  },
  {
    platform: INTERNSHALA_PLATFORM,
    displayName: "Internshala",
    supported: true,
    method:
      "Server-rendered listing pages (path-based pagination only) followed by per-posting detail pages.",
    createAdapter: (fetcher, _entry, observations) =>
      createInternshalaAdapter(fetcher, DEFAULT_INTERNSHALA_LIMITS, observations),
  },
];

const BLOCKED: PlatformDescriptor[] = Object.values(PLATFORM_LIMITATIONS).map((limitation) => ({
  platform: limitation.platform,
  displayName: limitation.displayName,
  supported: false,
  method: "Not crawlable — see limitation.",
  limitation,
  createAdapter: () => createBlockedAdapter(limitation),
}));

export const PLATFORM_CATALOG: PlatformDescriptor[] = [...SUPPORTED, ...BLOCKED];

export function getPlatformDescriptor(platform: string): PlatformDescriptor | undefined {
  const key = platform.toLowerCase();
  return PLATFORM_CATALOG.find((descriptor) => descriptor.platform === key);
}

export function supportedPlatforms(): string[] {
  return SUPPORTED.map((descriptor) => descriptor.platform);
}

/** Serializable view for the admin UI — no functions cross the server-fn boundary. */
export type PlatformSummary = {
  platform: string;
  displayName: string;
  supported: boolean;
  method: string;
  limitationReason: string | null;
  limitationEvidence: string | null;
  unblockedBy: string | null;
};

export function listPlatformSummaries(): PlatformSummary[] {
  return PLATFORM_CATALOG.map((descriptor) => ({
    platform: descriptor.platform,
    displayName: descriptor.displayName,
    supported: descriptor.supported,
    method: descriptor.method,
    limitationReason: descriptor.limitation?.reason ?? null,
    limitationEvidence: descriptor.limitation?.evidence ?? null,
    unblockedBy: descriptor.limitation?.unblockedBy ?? null,
  }));
}
