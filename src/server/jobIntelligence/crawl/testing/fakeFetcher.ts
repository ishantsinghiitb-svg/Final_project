// ── Module 10B.1: scripted fetcher for tests ──
//
// The seam every crawler goes through, faked at the boundary — the same shape
// src/server/ai/testing/fakeSupabase.ts uses for the AI engine, and the reason
// `CrawlFetcher` is an interface rather than a bare `fetch` call. No test in
// this module touches the network.

import type { CrawlFetcher, FetchOptions, FetchResult } from "../HttpFetcher";

/**
 * `status` is optional on a scripted failure: a timeout or a DNS error never
 * produced one, and forcing tests to write `status: null` for those obscures
 * what is actually being tested.
 */
type ScriptedFailure = Omit<Extract<FetchResult, { ok: false }>, "url" | "status"> & {
  status?: number | null;
};

export type ScriptedResponse =
  { body: string; status?: number; contentType?: string } | { failure: ScriptedFailure };

export class FakeFetcher implements CrawlFetcher {
  readonly requested: string[] = [];

  constructor(private readonly routes: Record<string, ScriptedResponse> = {}) {}

  /** Registers (or replaces) the response for an exact URL. */
  on(url: string, response: ScriptedResponse): this {
    this.routes[url] = response;
    return this;
  }

  async fetchText(url: string, _options?: FetchOptions): Promise<FetchResult> {
    this.requested.push(url);
    const route = this.routes[url];

    if (!route) {
      return {
        ok: false,
        kind: "http",
        status: 404,
        url,
        reason: `No scripted response for ${url}`,
      };
    }
    if ("failure" in route) {
      return { status: null, ...route.failure, url };
    }
    return {
      ok: true,
      status: route.status ?? 200,
      url,
      body: route.body,
      contentType: route.contentType ?? "application/json",
    };
  }
}

/** Convenience: a fetcher that serves one JSON payload at one URL. */
export function jsonFetcher(url: string, payload: unknown): FakeFetcher {
  return new FakeFetcher({ [url]: { body: JSON.stringify(payload) } });
}

/** Convenience: a fetcher that serves one HTML page at one URL. */
export function htmlFetcher(url: string, html: string): FakeFetcher {
  return new FakeFetcher({ [url]: { body: html, contentType: "text/html" } });
}

/** A blocked (anti-bot) response, for limitation-path tests. */
export const BLOCKED: ScriptedResponse = {
  failure: {
    ok: false,
    kind: "blocked",
    status: 403,
    reason: "Blocked by the platform (HTTP 403).",
  },
};
