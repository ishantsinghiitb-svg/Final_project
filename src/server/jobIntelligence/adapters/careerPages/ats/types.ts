// ── Module 10B.1: Company Career Pages — ATS provider contract ──
//
// "Company career page" is almost never bespoke HTML: it is a board hosted by
// an applicant tracking system that also exposes a PUBLIC, documented JSON
// endpoint for the same postings. Reading that endpoint is both far more
// accurate than scraping the rendered page and explicitly intended for
// third-party consumption, so it is the primary strategy here. Pages that are
// not on a known ATS fall back to schema.org JSON-LD (`jsonld` provider),
// which is what Google for Jobs consumes and therefore what most remaining
// careers pages publish.
//
// Each provider splits into the same two halves Module 10A's pipeline
// requires: `crawl` may touch the network (Crawler stage), `parsePosting` is
// pure and synchronous (Parser stage).

import type { CrawlFetcher } from "../../../crawl/HttpFetcher";
import type { ParseOutcome, RawJobPayload } from "../../../parsers/types";

export type AtsProviderId =
  "greenhouse" | "lever" | "ashby" | "smartrecruiters" | "workable" | "recruitee" | "jsonld";

/**
 * A resolved crawl target: which ATS, and the board identifier within it.
 * `token` is the board/company slug the provider's API is keyed by (e.g.
 * "stripe" in boards.greenhouse.io/stripe).
 */
export type AtsBoard = {
  provider: AtsProviderId;
  token: string;
  /** The registry entry's careers URL, verbatim — used as `company_career_url`. */
  careersUrl: string;
  /** Registry-supplied company name; a provider may override it with the board's own. */
  companyName: string;
};

/** What lands in `RawJobPayload.json` for every career-pages posting. */
export type AtsPostingPayload = {
  provider: AtsProviderId;
  board: AtsBoard;
  /** Provider-native posting: a JSON object, or `{ html, url }` for the JSON-LD fallback. */
  posting: unknown;
};

export type AtsCrawlLimits = {
  /** Hard cap on postings taken from one board in one run. */
  maxPostings: number;
  /** Hard cap on follow-up detail fetches (JSON-LD fallback only). */
  maxDetailFetches: number;
};

/**
 * Production caps (raised in Module 10B.2).
 *
 * `maxPostings` was 300, which silently truncated real boards — Stripe's
 * Greenhouse board returns 550 postings and OpenAI's Ashby board 750, both in a
 * SINGLE response. A cap below the size of a real board is indistinguishable
 * from a pagination bug: the crawl looks successful and quietly drops a third
 * of the jobs. It is now above the largest board observed, and whenever it does
 * bite, the crawler says so in the report rather than trimming in silence.
 */
export const DEFAULT_ATS_LIMITS: AtsCrawlLimits = {
  maxPostings: 2_000,
  maxDetailFetches: 40,
};

export type AtsCrawlResult = {
  raws: RawJobPayload[];
  /** Non-fatal problems worth surfacing in the crawl report (e.g. "board returned 0 postings"). */
  warnings: string[];
  /** Set when the board could not be read at all; `raws` is then empty. */
  failure?: { reason: string; blocked: boolean };
  /**
   * Postings the crawler deliberately EXCLUDED before parsing (Ashby drafts,
   * unpublished Recruitee offers). Reported as `skipped` so they are visible
   * rather than vanishing between "discovered" and what the board actually
   * holds — a board where every posting is a draft should look different from
   * a board that is empty.
   */
  skipped?: number;
  /**
   * False when the crawl could NOT be proven complete — pagination stopped
   * early, a page failed, or the posting cap bit. Module 10B.2 crawl safety:
   * only a demonstrably complete crawl may be treated as an authoritative
   * observation of a source. See CrawlOrchestrator.
   */
  complete?: boolean;
};

export interface AtsProvider {
  readonly id: AtsProviderId;
  /**
   * The URL this provider reads the board from. Exposed (Module 10B.1.5) so
   * source verification probes the SAME endpoint the crawl uses — a board that
   * verifies against one URL and is crawled from another would be a health
   * report that lies. Pure; no network.
   */
  boardUrl(board: AtsBoard): string;
  /** Network stage: reads the board and emits one `RawJobPayload` per posting. */
  crawl(board: AtsBoard, fetcher: CrawlFetcher, limits: AtsCrawlLimits): Promise<AtsCrawlResult>;
  /** Pure stage: one raw payload → one normalized-ready posting. */
  parsePosting(payload: AtsPostingPayload, raw: RawJobPayload): ParseOutcome;
}

/** The `global_jobs.source` tag written for postings from each provider. */
export const ATS_SOURCE_TAG: Record<AtsProviderId, string> = {
  greenhouse: "greenhouse",
  lever: "lever",
  ashby: "ashby",
  smartrecruiters: "smartrecruiters",
  workable: "workable",
  recruitee: "recruitee",
  // The Jobs page's own label map already renders "careers" — see
  // formatSourceLabel in src/features/jobs/utils. Deliberately not a new tag
  // the UI has never seen.
  jsonld: "careers",
};
