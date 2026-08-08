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
};

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
  ) {}

  async fetchText(url: string, options: FetchOptions = {}): Promise<FetchResult> {
    let host: string;
    try {
      host = new URL(url).host;
    } catch {
      return { ok: false, kind: "network", status: null, url, reason: `Invalid URL: ${url}` };
    }

    await this.waitForHostSlot(host);

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
      const body = await response.text();

      if (response.status === 403 || response.status === 429) {
        return {
          ok: false,
          kind: "blocked",
          status: response.status,
          url,
          reason:
            response.status === 429
              ? "Rate limited by the platform (HTTP 429)."
              : "Blocked by the platform (HTTP 403).",
        };
      }
      if (!response.ok) {
        return {
          ok: false,
          kind: "http",
          status: response.status,
          url,
          reason: `HTTP ${response.status} ${response.statusText}`.trim(),
        };
      }
      if (looksLikeChallengePage(body, contentType)) {
        return {
          ok: false,
          kind: "blocked",
          status: response.status,
          url,
          reason: "Anti-bot challenge page returned instead of content.",
        };
      }
      if (!body.trim()) {
        return {
          ok: false,
          kind: "empty",
          status: response.status,
          url,
          reason: "Empty response body.",
        };
      }

      return { ok: true, status: response.status, url: response.url || url, body, contentType };
    } catch (err) {
      const aborted = err instanceof Error && err.name === "AbortError";
      return {
        ok: false,
        kind: aborted ? "timeout" : "network",
        status: null,
        url,
        reason: aborted
          ? `Request timed out after ${timeoutMs}ms.`
          : err instanceof Error
            ? err.message
            : "Network request failed.",
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
