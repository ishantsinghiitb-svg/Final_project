import type { RawJobPayload, JobParser } from "../parsers/types";

/** What an admin points a crawl run at — a single posting URL, a search query, or a company's careers page. */
export type CrawlTarget =
  | { kind: "url"; url: string }
  | { kind: "query"; query: string; location?: string }
  | { kind: "company"; companyCareerUrl: string };

/**
 * Crawler → raw capture. Deliberately the ONLY place network/browser access
 * happens in the pipeline — parsers, normalizers and the dedup engine never
 * fetch anything themselves. No implementation ships in this module (see the
 * Module 10A scope note in ../index.ts): this is the interface a future
 * platform-specific crawler (LinkedIn, Greenhouse, Lever, …) implements.
 */
export interface PlatformCrawler {
  readonly platform: string;
  fetchRawPostings(target: CrawlTarget): Promise<RawJobPayload[]>;
}

/** Bundles one platform's Crawler + Parser — the unit CrawlRunner and AdapterRegistry operate on. */
export interface PlatformAdapter {
  readonly platform: string;
  readonly crawler: PlatformCrawler;
  readonly parser: JobParser;
}
