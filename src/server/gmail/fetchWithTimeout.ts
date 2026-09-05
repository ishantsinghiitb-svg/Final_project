// ── Bounded fetch for Google OAuth + Gmail API calls (Module 13 · hang fix) ──
//
// Nothing calling into Google's OAuth token endpoint or the Gmail REST API
// bounded how long a single request could take. A hung request never
// rejects, so GmailSyncService's/CalendarSyncService's own `try { ... }
// catch (err) { releaseGmailSyncLock({status:"error",...}); ... }` around the
// whole sync body — which is already correct — never got the chance to run:
// the lock stayed "syncing" with zero forward progress (no gmail_messages,
// no ai_runs, no suggestions) until something else intervened. Observed live
// in production: a reconnect claimed the Gmail lock, then sat with zero
// writes anywhere for 30+ minutes, while Calendar's own sync — from the same
// reconnect, an independent request sharing this same refreshAccessToken —
// completed in ~7 seconds.
//
// This file does not change either sync service's error handling. It only
// makes a hung request actually THROW within a bounded time, so the existing
// catch/release structure gets to do its job. Mirrors the AbortController
// pattern already used by src/server/jobIntelligence/crawl/HttpFetcher.ts
// (crawler fetches) and src/server/ai/providers/withTimeout.ts (AI provider
// calls) — same idiom, not a new one.

import { isAbortError } from "@/server/ai/providers/withTimeout";

/**
 * Generous relative to real-world latency for these endpoints (Google's
 * OAuth token endpoint and the Gmail REST API normally respond in well under
 * a second, rarely more than a few seconds even for a larger message fetch)
 * — this bounds a genuine hang without false-tripping on ordinary latency.
 * Matches the crawler's HttpFetcher precedent (20s for scraping arbitrary
 * job board HTML) rounded down slightly, since these are lighter, well-known
 * JSON APIs rather than arbitrary third-party pages.
 */
export const GOOGLE_API_TIMEOUT_MS = 15_000;

/**
 * `fetch`, but the underlying request is genuinely cancelled — not just the
 * promise raced away from — if it doesn't settle within `timeoutMs`. On
 * timeout, throws a plain, readable `Error` rather than letting an opaque
 * DOMException/AbortError surface: callers' existing catch blocks
 * (GmailSyncService, CalendarSyncService) see a normal failure they already
 * know how to record and recover from, not an unfamiliar abort shape.
 */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs: number = GOOGLE_API_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    if (isAbortError(err)) {
      const host = safeHostname(url);
      throw new Error(`Request to ${host} timed out after ${timeoutMs}ms.`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/** Falls back to the raw URL if it somehow isn't parseable — the timeout message must never itself throw. */
function safeHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}
