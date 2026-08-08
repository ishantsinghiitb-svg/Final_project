// ── Module 10B.1: adapter for a platform that cannot be crawled ──
//
// Satisfies Module 10A's `PlatformAdapter` contract exactly, so the registry,
// orchestrator, report and admin UI treat it like any other platform — it
// simply always fails, with the documented reason from
// ../../crawl/limitations.ts. Nothing here scrapes, retries, or degrades:
// the whole value is that the failure is explicit, attributed and stable.
//
// Deliberately NOT a no-op that returns zero jobs: "0 jobs imported" is
// indistinguishable from a broken crawler, whereas this makes the crawl
// report say exactly why, and what would change the answer.

import { CrawlTargetError } from "../../crawl/errors";
import { getPlatformLimitation, type PlatformLimitation } from "../../crawl/limitations";
import type { JobParser, ParseOutcome, RawJobPayload } from "../../parsers/types";
import type { CrawlTarget, PlatformAdapter, PlatformCrawler } from "../types";

export class BlockedPlatformCrawler implements PlatformCrawler {
  constructor(private readonly limitation: PlatformLimitation) {}

  get platform(): string {
    return this.limitation.platform;
  }

  async fetchRawPostings(_target: CrawlTarget): Promise<RawJobPayload[]> {
    throw new CrawlTargetError(
      `${this.limitation.displayName} is not supported: ${this.limitation.reason}`,
      { blocked: true },
    );
  }
}

export class BlockedPlatformParser implements JobParser {
  readonly version = "blocked-1.0.0";

  constructor(private readonly limitation: PlatformLimitation) {}

  get platform(): string {
    return this.limitation.platform;
  }

  /** Unreachable in practice — the crawler never yields a payload. Kept total for contract completeness. */
  parse(_raw: RawJobPayload): ParseOutcome {
    return {
      ok: false,
      reason: `${this.limitation.displayName} is not supported: ${this.limitation.reason}`,
    };
  }
}

export function createBlockedAdapter(limitation: PlatformLimitation): PlatformAdapter {
  return {
    platform: limitation.platform,
    crawler: new BlockedPlatformCrawler(limitation),
    parser: new BlockedPlatformParser(limitation),
  };
}

/** Builds the blocked adapter for a declared platform tag, or undefined when the tag isn't declared. */
export function createBlockedAdapterFor(platform: string): PlatformAdapter | undefined {
  const limitation = getPlatformLimitation(platform);
  return limitation ? createBlockedAdapter(limitation) : undefined;
}
