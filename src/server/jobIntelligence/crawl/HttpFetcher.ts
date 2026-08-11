// ── Module 10B.1: the crawl pipeline's ONLY network layer ──
//
// Module 10A's architecture note says network access happens in the Crawler
// stage and nowhere else (see adapters/types.ts). This narrows that further:
// every crawler goes through one `HttpFetcher`, so timeouts, the User-Agent,
// per-host politeness delays and "was I blocked?" classification are defined
// once instead of per platform.
//
// Two deliberate choices:
//
//  - HTTP errors are RETURNED, never thrown. A 403 from one company's board
//    must degrade that one entry in the crawl report, not abort a "Crawl All"
//    run halfway through. Only a programming error throws.
//  - Responses are classified into `blocked` vs `http` vs `network` vs
//    `timeout`. "Blocked" (403/429, or a 200 that is really a CAPTCHA
//    interstitial) is the signal Module 10B.1 cares about most: it is what
//    separates "this platform is temporarily unhappy" from "this platform
//    cannot be crawled", and it is what the crawl report surfaces to the
//    operator instead of silently reporting zero jobs.

/** Bounded like the AI provider deadline (see src/server/ai/getProvider.ts) — a hung board must not hang a crawl. */
const DEFAULT_TIMEOUT_MS = 20_000;

/** Politeness gap between two requests to the SAME host. Internshala's robots.txt asks named bots for 1s; this is deliberately more conservative. */
const DEFAULT_HOST_DELAY_MS = 1_500;

/**
 * Identifies the crawler honestly, with a contact path. Impersonating a
 * browser to slip past bot detection is exactly the "fragile workaround" this
 * module is required not to build — a platform that blocks this UA is
 * reported as blocked, not worked around.
 */
export const CRAWLER_USER_AGENT =
  "NextOfferBot/1.0 (+https://nextoffer.app/bot; job-intelligence crawler)";

export type FetchFailureKind = "blocked" | "http" | "network" | "timeout" | "empty";

export type FetchResult =
  | { ok: true; status: number; url: string; body: string; contentType: string | null }
  | { ok: false; kind: FetchFailureKind; status: number | null; url: string; reason: string };

export type FetchOptions = {
  /** Overrides the default Accept header (e.g. "application/json"). */
  accept?: string;
  timeoutMs?: number;
  /** Extra request headers. Never used to spoof a browser identity. */
  headers?: Record<string, string>;
  /** Extra attempts after the first for TRANSIENT failures only. Default 2. */
  retries?: number;
};

/**
 * Retries are for failures that are plausibly the platform having a bad
 * moment, never for a definite answer:
 *
 *   retried  — timeout, socket/network error, 5xx, and 429 (which is the
 *              platform explicitly asking us to slow down, not to go away).
 *   NOT retried — 403 (blocked), 404/410 (wrong URL), any other 4xx, an
 *              anti-bot challenge page, or an empty body. Repeating those
 *              cannot change the answer and hammering a board that already
 *              said no is precisely the behaviour this module must not have.
 */
function isTransient(failure: Extract<FetchResult, { ok: false }>): boolean {
  if (failure.kind === "timeout" || failure.kind === "network") return true;
  if (failure.status === 429) return true;
  return failure.status != null && failure.status >= 500;
}

const DEFAULT_RETRIES = 2;
const RETRY_BASE_DELAY_MS = 600;
const RETRY_MAX_DELAY_MS = 8_000;

/**
 * Exponential backoff with jitter. Jitter matters because a "Crawl All" run
 * hits several boards on the same host family; without it, retries from a
 * shared outage line up and arrive as a burst.
 */
export function backoffDelayMs(attempt: number, random: () => number = Math.random): number {
  const exponential = Math.min(RETRY_BASE_DELAY_MS * 2 ** attempt, RETRY_MAX_DELAY_MS);
  return Math.round(exponential * (0.5 + random() * 0.5));
}

/** Honours `Retry-After` (delta-seconds or HTTP-date), capped so a hostile value can't stall a run. */
export function parseRetryAfter(header: string | null, now: number = Date.now()): number | null {
  if (!header) return null;
  const trimmed = header.trim();

  const seconds = Number(trimmed);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(seconds * 1000, RETRY_MAX_DELAY_MS);
  }

  const date = Date.parse(trimmed);
  if (!Number.isNaN(date)) {
    return Math.min(Math.max(0, date - now), RETRY_MAX_DELAY_MS);
  }
  return null;
}

/**
 * The seam adapters depend on. Tests inject a scripted fake instead of
 * touching the network — the same "fake at the boundary" pattern
 * `JobIntelligenceStore` already establishes for the Database stage.
 */
export interface CrawlFetcher {
  fetchText(url: string, options?: FetchOptions): Promise<FetchResult>;
}

/**
 * Body markers that mean "this 200 OK is an anti-bot interstitial, not the
 * page you asked for". Checked only on short-ish HTML bodies: a real job page
 * can legitimately contain the word "captcha" in its description, but a
 * challenge page is always small and always carries one of these vendor
 * fingerprints.
 */
const CHALLENGE_MARKERS = [
  "captcha-delivery.com", // DataDome
  "__cf$cv$params", // Cloudflare JS challenge
  "cf-browser-verification",
  "/cdn-cgi/challenge-platform",
  "just a moment...",
  "enable js and disable any ad blocker",
  "access denied",
];

const CHALLENGE_BODY_MAX_BYTES = 60_000;

/** True when a 2xx body is really an anti-bot challenge/interstitial rather than content. */
export function looksLikeChallengePage(body: string, contentType: string | null): boolean {
  if (contentType && !/html|text\/plain/i.test(contentType)) return false;
  if (body.length > CHALLENGE_BODY_MAX_BYTES) return false;
  const haystack = body.toLowerCase();
  return CHALLENGE_MARKERS.some((marker) => haystack.includes(marker));
}

export class HttpFetcher implements CrawlFetcher {
  private lastRequestAtByHost = new Map<string, number>();

  constructor(
    private readonly hostDelayMs: number = DEFAULT_HOST_DELAY_MS,
    private readonly sleep: (ms: number) => Promise<void> = defaultSleep,
    /** Injectable so backoff jitter is deterministic in tests. */
    private readonly random: () => number = Math.random,
  ) {}

  async fetchText(url: string, options: FetchOptions = {}): Promise<FetchResult> {
    let host: string;
    try {
      host = new URL(url).host;
    } catch {
      return { ok: false, kind: "network", status: null, url, reason: `Invalid URL: ${url}` };
    }

    const maxRetries = Math.max(0, options.retries ?? DEFAULT_RETRIES);
    let lastFailure: Extract<FetchResult, { ok: false }> | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      await this.waitForHostSlot(host);
      const result = await this.attempt(url, options);
      if (result.ok) return result;

      lastFailure = result.failure;
      if (attempt === maxRetries || !isTransient(result.failure)) break;

      // Prefer the platform's own instruction over our guess.
      const wait = result.retryAfterMs ?? backoffDelayMs(attempt, this.random);
      await this.sleep(wait);
    }

    // Annotated so the crawl report distinguishes "failed once" from "failed
    // after we gave it every reasonable chance".
    if (lastFailure && maxRetries > 0 && isTransient(lastFailure)) {
      return {
        ...lastFailure,
        reason: `${lastFailure.reason} (after ${maxRetries + 1} attempts)`,
      };
    }
    return (
      lastFailure ?? {
        ok: false,
        kind: "network",
        status: null,
        url,
        reason: "No attempt was made.",
      }
    );
  }

  /** One request, with no retry logic of its own. */
  private async attempt(
    url: string,
    options: FetchOptions,
  ): Promise<
    | { ok: true; status: number; url: string; body: string; contentType: string | null }
    | { ok: false; failure: Extract<FetchResult, { ok: false }>; retryAfterMs: number | null }
  > {
    const controller = new AbortController();
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        method: "GET",
        redirect: "follow",
        signal: controller.signal,
        headers: {
          "User-Agent": CRAWLER_USER_AGENT,
          Accept:
            options.accept ?? "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
          ...options.headers,
        },
      });

      const contentType = response.headers.get("content-type");
      const retryAfterMs = parseRetryAfter(response.headers.get("retry-after"));
      const body = await response.text();

      if (response.status === 403 || response.status === 429) {
        return {
          ok: false,
          retryAfterMs,
          failure: {
            ok: false,
            kind: "blocked",
            status: response.status,
            url,
            reason:
              response.status === 429
                ? "Rate limited by the platform (HTTP 429)."
                : "Blocked by the platform (HTTP 403).",
          },
        };
      }
      if (!response.ok) {
        return {
          ok: false,
          retryAfterMs,
          failure: {
            ok: false,
            kind: "http",
            status: response.status,
            url,
            reason: `HTTP ${response.status} ${response.statusText}`.trim(),
          },
        };
      }
      if (looksLikeChallengePage(body, contentType)) {
        return {
          ok: false,
          retryAfterMs: null,
          failure: {
            ok: false,
            kind: "blocked",
            status: response.status,
            url,
            reason: "Anti-bot challenge page returned instead of content.",
          },
        };
      }
      if (!body.trim()) {
        return {
          ok: false,
          retryAfterMs: null,
          failure: {
            ok: false,
            kind: "empty",
            status: response.status,
            url,
            reason: "Empty response body.",
          },
        };
      }

      return { ok: true, status: response.status, url: response.url || url, body, contentType };
    } catch (err) {
      const aborted = err instanceof Error && err.name === "AbortError";
      return {
        ok: false,
        retryAfterMs: null,
        failure: {
          ok: false,
          kind: aborted ? "timeout" : "network",
          status: null,
          url,
          reason: aborted
            ? `Request timed out after ${timeoutMs}ms.`
            : err instanceof Error
              ? err.message
              : "Network request failed.",
        },
      };
    } finally {
      clearTimeout(timer);
    }
  }

  /** Serializes requests to one host with a fixed gap; different hosts never wait on each other. */
  private async waitForHostSlot(host: string): Promise<void> {
    if (this.hostDelayMs <= 0) return;
    const now = Date.now();
    const last = this.lastRequestAtByHost.get(host);
    if (last !== undefined) {
      const wait = last + this.hostDelayMs - now;
      if (wait > 0) await this.sleep(wait);
    }
    this.lastRequestAtByHost.set(host, Date.now());
  }
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Parses a successful text response as JSON, degrading to a structured failure rather than throwing. */
export function parseJsonResult<T>(
  result: FetchResult,
): { ok: true; data: T } | { ok: false; reason: string } {
  if (!result.ok) return { ok: false, reason: result.reason };
  try {
    return { ok: true, data: JSON.parse(result.body) as T };
  } catch (err) {
    return {
      ok: false,
      reason: `Response was not valid JSON: ${err instanceof Error ? err.message : "parse error"}`,
    };
  }
}
