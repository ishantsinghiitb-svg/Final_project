// ── Module 10B.1: Company Career Pages adapter ──
//
// Implements Module 10A's `PlatformAdapter` unchanged: a Crawler that touches
// the network and a pure, synchronous Parser. All the per-ATS knowledge lives
// in ./ats/*; this file is only the wiring plus the `CrawlTarget` → board
// resolution.
//
// The platform tag is "career-pages" (what the registry and admin UI select),
// which is deliberately NOT the same as `global_jobs.source` — a posting read
// from a Greenhouse board is stored with source "greenhouse", so the Jobs
// page's existing source labels and filters keep working untouched.

import { crawlErrorMessage, CrawlTargetError } from "../../crawl/errors";
import { newObservations, type CrawlObservations } from "../../crawl/CrawlObservations";
import type { CrawlFetcher } from "../../crawl/HttpFetcher";
import type { JobParser, ParseOutcome, RawJobPayload } from "../../parsers/types";
import type { CrawlTarget, PlatformAdapter, PlatformCrawler } from "../types";
import { detectAtsBoard } from "./ats/detect";
import { getAtsProvider } from "./ats/index";
import {
  DEFAULT_ATS_LIMITS,
  type AtsBoard,
  type AtsCrawlLimits,
  type AtsPostingPayload,
} from "./ats/types";

export const CAREER_PAGES_PLATFORM = "career-pages";
export const CAREER_PAGES_PARSER_VERSION = "career-pages-1.0.0";

/**
 * Extra, non-`CrawlTarget` context a registry entry carries (company name and
 * `config` overrides). `CrawlTarget` is Module 10A's frozen shape, so rather
 * than widen it, the orchestrator hands this alongside — see
 * `CareerPagesCrawler.withContext`.
 */
export type CareerPagesContext = {
  companyName: string;
  config: unknown;
};

function targetUrl(target: CrawlTarget): string {
  switch (target.kind) {
    case "company":
      return target.companyCareerUrl;
    case "url":
      return target.url;
    case "query":
      throw new CrawlTargetError(
        "Company Career Pages cannot be crawled by search query — register the company's careers URL instead.",
      );
  }
}

export class CareerPagesCrawler implements PlatformCrawler {
  readonly platform = CAREER_PAGES_PLATFORM;

  constructor(
    private readonly fetcher: CrawlFetcher,
    private readonly context: CareerPagesContext = { companyName: "", config: {} },
    private readonly limits: AtsCrawlLimits = DEFAULT_ATS_LIMITS,
    /**
     * What the crawler learned while running — warnings, deliberately-excluded
     * postings, and whether the crawl is provably complete. A sink rather than
     * a return value because `PlatformCrawler.fetchRawPostings` is Module 10A's
     * frozen signature and returns only payloads.
     */
    private readonly observations: CrawlObservations = newObservations(),
  ) {}

  /** A copy bound to one registry entry's company name + config. */
  withContext(context: CareerPagesContext): CareerPagesCrawler {
    return new CareerPagesCrawler(this.fetcher, context, this.limits, this.observations);
  }

  /** The board this crawler would read for a target — exposed so the orchestrator can report it. */
  resolveBoard(target: CrawlTarget): AtsBoard {
    const url = targetUrl(target);
    const detection = detectAtsBoard(url, this.context.companyName, this.context.config);
    if (!detection.ok) throw new CrawlTargetError(detection.reason);
    return detection.board;
  }

  async fetchRawPostings(target: CrawlTarget): Promise<RawJobPayload[]> {
    const board = this.resolveBoard(target);
    const provider = getAtsProvider(board.provider);
    const result = await provider.crawl(board, this.fetcher, this.limits);

    if (result.failure) {
      throw new CrawlTargetError(result.failure.reason, { blocked: result.failure.blocked });
    }
    this.observations.warnings.push(...result.warnings);
    this.observations.skipped += result.skipped ?? 0;
    // Pessimistic: a provider that did not explicitly prove completeness is
    // treated as incomplete, so the lifecycle rule never acts on a guess.
    if (result.complete !== true) this.observations.complete = false;
    return result.raws;
  }
}

export class CareerPagesParser implements JobParser {
  readonly platform = CAREER_PAGES_PLATFORM;
  readonly version = CAREER_PAGES_PARSER_VERSION;

  parse(raw: RawJobPayload): ParseOutcome {
    const payload = raw.json as AtsPostingPayload | undefined;
    if (!payload || typeof payload !== "object" || !payload.provider) {
      return { ok: false, reason: "Career-pages payload is missing its ATS provider tag." };
    }

    const provider = getAtsProvider(payload.provider);
    if (!provider) {
      return { ok: false, reason: `No ATS provider registered for "${payload.provider}".` };
    }

    try {
      return provider.parsePosting(payload, raw);
    } catch (err) {
      return { ok: false, reason: crawlErrorMessage(err, "Career-pages parse failed.") };
    }
  }
}

export function createCareerPagesAdapter(
  fetcher: CrawlFetcher,
  limits: AtsCrawlLimits = DEFAULT_ATS_LIMITS,
  observations: CrawlObservations = newObservations(),
): PlatformAdapter & { crawler: CareerPagesCrawler } {
  return {
    platform: CAREER_PAGES_PLATFORM,
    crawler: new CareerPagesCrawler(fetcher, { companyName: "", config: {} }, limits, observations),
    parser: new CareerPagesParser(),
  };
}
