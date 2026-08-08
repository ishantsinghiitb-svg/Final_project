// ── Module 10B.1.5: source verification & health ──
//
// Answers one question per registry entry: "is this careers URL actually a
// working jobs source, and what is it?" — WITHOUT crawling the jobs.
//
// The governing rule for this phase is that an unverified URL is worse than an
// honest UNKNOWN. So every verdict here is evidence-based:
//   - HEALTHY is only returned when a real jobs board answered. For an ATS
//     that means its public API returned a parseable board; for a plain page it
//     means the page carries schema.org JobPosting markup or links that are
//     recognizably postings.
//   - A page that loads fine but shows no evidence of being a jobs board is
//     UNKNOWN, never HEALTHY. "It returned 200" is not evidence.
//
// Verification reads the SAME endpoint the crawl reads (`AtsProvider.boardUrl`),
// so a HEALTHY verdict is a statement about the thing that will actually be
// crawled.

import { detectAtsBoard } from "../../adapters/careerPages/ats/detect";
import { getAtsProvider } from "../../adapters/careerPages/ats";
import type { AtsProviderId } from "../../adapters/careerPages/ats/types";
import { findJobPostingNodes } from "../../parsers/jsonLd";
import { discoverJobLinks } from "../../adapters/careerPages/ats/jsonLdBoard";
import { getPlatformLimitation } from "../limitations";
import type { CrawlFetcher, FetchResult } from "../HttpFetcher";

/**
 * Operator-facing health of one source. Deliberately a small, plain-language
 * set — the admin panel shows these words directly, so each has to mean
 * something without a legend.
 */
export type SourceHealth =
  /** A real jobs board answered at this URL. */
  | "HEALTHY"
  /** Reachable, but the URL moved — the registry should be updated to the new one. */
  | "REDIRECTED"
  /** Deliberately refused: anti-bot, CAPTCHA, robots policy, or auth required. */
  | "BLOCKED"
  /** The URL is wrong: 404/410, or the host does not resolve. */
  | "BROKEN"
  /** The source is down or timing out — transient, worth retrying. */
  | "UNAVAILABLE"
  /** Reachable but nothing proves it is a jobs board. Never treated as working. */
  | "UNKNOWN";

/**
 * What the source turned out to be. An ATS id when one answered; the literal
 * `custom_careers` for a company-hosted page that IS a jobs board but not on a
 * recognized ATS; null when we could not tell.
 */
export type DetectedPlatform = AtsProviderId | "custom_careers";

export const CUSTOM_CAREERS: DetectedPlatform = "custom_careers";

export type SourceVerification = {
  /** The URL as registered. */
  url: string;
  /** Where it ended up after redirects; equals `url` when it did not move. */
  finalUrl: string | null;
  health: SourceHealth;
  httpStatus: number | null;
  detectedPlatform: DetectedPlatform | null;
  /** Operator-readable explanation. Null when HEALTHY and unremarkable. */
  errorReason: string | null;
  checkedAt: string;
  /**
   * Postings visible at verification time, when the source made that countable.
   * Evidence for the verdict, not a crawl result — verification never imports.
   */
  postingsSeen: number | null;
};

/** A same-page redirect (http→https, trailing slash, www) is not worth flagging. */
export function isMeaningfulRedirect(from: string, to: string): boolean {
  try {
    const a = new URL(from);
    const b = new URL(to);
    const host = (url: URL) => url.host.toLowerCase().replace(/^www\./, "");
    const path = (url: URL) => url.pathname.replace(/\/+$/, "").toLowerCase();
    return host(a) !== host(b) || path(a) !== path(b);
  } catch {
    return from !== to;
  }
}

function healthForFailure(failure: Extract<FetchResult, { ok: false }>): SourceHealth {
  switch (failure.kind) {
    case "blocked":
      return "BLOCKED";
    case "timeout":
      return "UNAVAILABLE";
    case "network":
      // A DNS failure means the host does not exist — that is a wrong URL, not
      // an outage. Anything else at the socket level is treated as transient.
      return /ENOTFOUND|EAI_AGAIN|getaddrinfo|dns/i.test(failure.reason) ? "BROKEN" : "UNAVAILABLE";
    case "http":
      if (failure.status === 404 || failure.status === 410) return "BROKEN";
      if (failure.status === 401 || failure.status === 403) return "BLOCKED";
      if (failure.status != null && failure.status >= 500) return "UNAVAILABLE";
      return "UNKNOWN";
    case "empty":
      return "UNKNOWN";
    default:
      return "UNKNOWN";
  }
}

/** Counts postings in a provider payload without parsing any of them. */
export function countPostings(provider: AtsProviderId, body: string): number | null {
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return null;
  }
  const asRecord = (value: unknown): Record<string, unknown> | null =>
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;

  switch (provider) {
    case "greenhouse":
    case "ashby": {
      const jobs = asRecord(payload)?.jobs;
      return Array.isArray(jobs) ? jobs.length : null;
    }
    case "lever":
      return Array.isArray(payload) ? payload.length : null;
    case "smartrecruiters": {
      const content = asRecord(payload)?.content;
      return Array.isArray(content) ? content.length : null;
    }
    case "workable": {
      const jobs = asRecord(payload)?.jobs;
      return Array.isArray(jobs) ? jobs.length : null;
    }
    case "recruitee": {
      const offers = asRecord(payload)?.offers;
      return Array.isArray(offers) ? offers.length : null;
    }
    default:
      return null;
  }
}

/**
 * Looks for an ATS board LINKED FROM a custom careers page. Very common: a
 * company hosts marketing copy at `/careers` and links out to its Greenhouse
 * or Lever board. Finding that link upgrades an UNKNOWN page into a verified,
 * crawlable board — and it is discovery from evidence on the company's own
 * site, not a guessed URL.
 */
export function findLinkedAtsBoard(html: string): string | null {
  const patterns: RegExp[] = [
    /https?:\/\/(?:job-)?boards(?:\.eu)?\.greenhouse\.io\/[A-Za-z0-9_-]+/i,
    /https?:\/\/jobs\.lever\.co\/[A-Za-z0-9_-]+/i,
    /https?:\/\/jobs\.ashbyhq\.com\/[A-Za-z0-9_-]+/i,
    /https?:\/\/careers\.smartrecruiters\.com\/[A-Za-z0-9_-]+/i,
    /https?:\/\/apply\.workable\.com\/[A-Za-z0-9_-]+/i,
    /https?:\/\/[A-Za-z0-9_-]+\.recruitee\.com/i,
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(html);
    if (match) return match[0].replace(/[)"'<].*$/, "");
  }
  return null;
}

export type VerifyOptions = {
  /** Follow one linked-ATS hop from a custom page. Off in tests that assert the raw verdict. */
  followLinkedAts?: boolean;
  now?: () => Date;
};

/**
 * Verifies one source URL. Never throws: a verification failure is a health
 * status, because this runs over a whole registry and one bad row must not
 * abort the sweep.
 */
export async function verifySource(
  careersUrl: string,
  companyName: string,
  fetcher: CrawlFetcher,
  config: unknown = {},
  options: VerifyOptions = {},
): Promise<SourceVerification> {
  const checkedAt = (options.now?.() ?? new Date()).toISOString();
  const base = {
    url: careersUrl,
    finalUrl: null as string | null,
    httpStatus: null as number | null,
    detectedPlatform: null as DetectedPlatform | null,
    postingsSeen: null as number | null,
    checkedAt,
  };

  // A platform we have already proven uncrawlable is reported from the
  // recorded evidence rather than re-probed on every sweep.
  const limitation = getPlatformLimitation(blockedPlatformForHost(careersUrl));
  if (limitation) {
    return {
      ...base,
      health: "BLOCKED",
      detectedPlatform: null,
      errorReason: limitation.reason,
    };
  }

  const detection = detectAtsBoard(careersUrl, companyName, config);
  if (!detection.ok) {
    return { ...base, health: "BROKEN", errorReason: detection.reason };
  }

  const board = detection.board;
  const provider = getAtsProvider(board.provider);
  const probeUrl = provider.boardUrl(board);

  const result = await fetcher.fetchText(probeUrl, {
    accept: board.provider === "jsonld" ? undefined : "application/json",
  });

  if (!result.ok) {
    return {
      ...base,
      finalUrl: result.url ?? null,
      httpStatus: result.status ?? null,
      health: healthForFailure(result),
      detectedPlatform: board.provider === "jsonld" ? null : board.provider,
      errorReason: result.reason,
    };
  }

  const finalUrl = result.url ?? probeUrl;
  const redirected = isMeaningfulRedirect(probeUrl, finalUrl);

  // ── A known ATS answered ──
  if (board.provider !== "jsonld") {
    const postingsSeen = countPostings(board.provider, result.body);
    if (postingsSeen === null) {
      return {
        ...base,
        finalUrl,
        httpStatus: result.status,
        health: "UNKNOWN",
        detectedPlatform: board.provider,
        errorReason: `${board.provider} responded but the payload was not a recognizable job board.`,
      };
    }
    return {
      ...base,
      finalUrl,
      httpStatus: result.status,
      health: redirected ? "REDIRECTED" : "HEALTHY",
      detectedPlatform: board.provider,
      postingsSeen,
      errorReason:
        postingsSeen === 0
          ? "Board is reachable but currently lists no open postings."
          : redirected
            ? `Board answers at ${finalUrl}.`
            : null,
    };
  }

  // ── A plain page: prove it is a jobs board before calling it healthy ──
  const linked = options.followLinkedAts === false ? null : findLinkedAtsBoard(result.body);
  if (linked) {
    // Re-verify against the board the company itself links to. One hop only —
    // `followLinkedAts: false` on the recursive call prevents a link loop.
    const viaBoard = await verifySource(linked, companyName, fetcher, config, {
      ...options,
      followLinkedAts: false,
    });
    return {
      ...viaBoard,
      url: careersUrl,
      finalUrl: linked,
      health: viaBoard.health === "HEALTHY" ? "REDIRECTED" : viaBoard.health,
      errorReason:
        viaBoard.health === "HEALTHY"
          ? `Careers page links to a ${viaBoard.detectedPlatform} board at ${linked}.`
          : viaBoard.errorReason,
    };
  }

  const postings = findJobPostingNodes(result.body).length;
  if (postings > 0) {
    return {
      ...base,
      finalUrl,
      httpStatus: result.status,
      health: redirected ? "REDIRECTED" : "HEALTHY",
      detectedPlatform: CUSTOM_CAREERS,
      postingsSeen: postings,
      errorReason: null,
    };
  }

  const links = discoverJobLinks(result.body, finalUrl).length;
  if (links > 0) {
    return {
      ...base,
      finalUrl,
      httpStatus: result.status,
      health: redirected ? "REDIRECTED" : "HEALTHY",
      detectedPlatform: CUSTOM_CAREERS,
      postingsSeen: links,
      errorReason: null,
    };
  }

  return {
    ...base,
    finalUrl,
    httpStatus: result.status,
    health: "UNKNOWN",
    detectedPlatform: null,
    errorReason:
      "Page loads but carries no job postings, job links or structured job data — " +
      "it is most likely rendered with JavaScript. Register the underlying ATS board URL instead.",
  };
}

/**
 * Maps a URL's host to a platform we have already declared uncrawlable, so
 * those are reported from recorded evidence instead of being re-probed (and
 * re-blocked) on every sweep. Returns "" for anything else, and never throws
 * on a malformed URL.
 */
export function blockedPlatformForHost(rawUrl: string): string {
  let host: string;
  try {
    host = new URL(rawUrl).host.toLowerCase();
  } catch {
    return "";
  }
  if (host.endsWith("wellfound.com") || host.endsWith("angel.co")) return "wellfound";
  if (host.endsWith("foundit.in") || host.endsWith("monsterindia.com")) return "foundit";
  if (host.endsWith("iimjobs.com")) return "iimjobs";
  return "";
}

/** Health states an operator should act on. */
export function isActionableHealth(health: SourceHealth): boolean {
  return health === "BROKEN" || health === "BLOCKED" || health === "UNKNOWN";
}

/** True when a source is good enough to crawl. */
export function isCrawlableHealth(health: SourceHealth): boolean {
  return health === "HEALTHY" || health === "REDIRECTED";
}
