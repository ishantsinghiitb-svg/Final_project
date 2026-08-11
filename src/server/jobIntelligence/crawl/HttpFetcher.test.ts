import { afterEach, describe, expect, it, vi } from "vitest";
import {
  backoffDelayMs,
  CRAWLER_USER_AGENT,
  HttpFetcher,
  looksLikeChallengePage,
  parseJsonResult,
  parseRetryAfter,
} from "./HttpFetcher";

type FetchArgs = [input: string, init?: RequestInit];

function stubFetch(responder: (url: string, init?: RequestInit) => Response | Promise<Response>): {
  calls: FetchArgs[];
} {
  const calls: FetchArgs[] = [];
  vi.stubGlobal("fetch", (input: string, init?: RequestInit) => {
    calls.push([input, init]);
    return Promise.resolve(responder(input, init));
  });
  return { calls };
}

function ok(body: string, contentType = "text/html"): Response {
  return new Response(body, { status: 200, headers: { "content-type": contentType } });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

// No host delay in tests — the politeness gap is verified explicitly below.
// No host delay, no real sleeping, deterministic jitter — retry behaviour is
// asserted explicitly below rather than paid for in wall-clock time here.
function fetcher() {
  return new HttpFetcher(
    0,
    async () => {},
    () => 0.5,
  );
}

describe("looksLikeChallengePage", () => {
  it("detects a DataDome interstitial", () => {
    expect(
      looksLikeChallengePage(
        `<html><body><script src="https://ct.captcha-delivery.com/c.js"></script></body></html>`,
        "text/html",
      ),
    ).toBe(true);
  });

  it("detects a Cloudflare challenge", () => {
    expect(looksLikeChallengePage("<title>Just a moment...</title>", "text/html")).toBe(true);
    expect(looksLikeChallengePage("window.__CF$cv$params={r:'x'}", "text/html")).toBe(true);
  });

  it("detects an edge 'Access Denied' page", () => {
    expect(looksLikeChallengePage("<H1>Access Denied</H1>", "text/html")).toBe(true);
  });

  it("does not flag a long real page that merely mentions captcha", () => {
    const body = `<p>You will build our CAPTCHA service.</p>${"x".repeat(80_000)}`;
    expect(looksLikeChallengePage(body, "text/html")).toBe(false);
  });

  it("never flags a JSON response", () => {
    expect(looksLikeChallengePage('{"error":"access denied"}', "application/json")).toBe(false);
  });
});

describe("HttpFetcher.fetchText", () => {
  it("returns the body on success", async () => {
    stubFetch(() => ok("<html>hi</html>"));
    const result = await fetcher().fetchText("https://a.test/x");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.body).toBe("<html>hi</html>");
      expect(result.status).toBe(200);
    }
  });

  it("identifies itself honestly and never spoofs a browser", async () => {
    const { calls } = stubFetch(() => ok("x"));
    await fetcher().fetchText("https://a.test/x");
    const headers = calls[0][1]?.headers as Record<string, string>;
    expect(headers["User-Agent"]).toBe(CRAWLER_USER_AGENT);
    expect(headers["User-Agent"]).not.toMatch(/Mozilla|Chrome|Safari/);
  });

  it("applies a custom Accept header", async () => {
    const { calls } = stubFetch(() => ok("{}", "application/json"));
    await fetcher().fetchText("https://a.test/x", { accept: "application/json" });
    expect((calls[0][1]?.headers as Record<string, string>).Accept).toBe("application/json");
  });

  it("classifies 403 as blocked", async () => {
    stubFetch(() => new Response("nope", { status: 403 }));
    const result = await fetcher().fetchText("https://a.test/x");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.kind).toBe("blocked");
  });

  it("classifies 429 as blocked", async () => {
    stubFetch(() => new Response("slow down", { status: 429 }));
    const result = await fetcher().fetchText("https://a.test/x");
    if (!result.ok) expect(result.kind).toBe("blocked");
    else throw new Error("expected failure");
  });

  it("classifies other non-2xx as http", async () => {
    stubFetch(() => new Response("gone", { status: 404, statusText: "Not Found" }));
    const result = await fetcher().fetchText("https://a.test/x");
    if (!result.ok) {
      expect(result.kind).toBe("http");
      expect(result.status).toBe(404);
    } else throw new Error("expected failure");
  });

  it("classifies a 200 challenge page as blocked", async () => {
    stubFetch(() =>
      ok(`<html><script src="https://ct.captcha-delivery.com/c.js"></script></html>`),
    );
    const result = await fetcher().fetchText("https://a.test/x");
    if (!result.ok) {
      expect(result.kind).toBe("blocked");
      expect(result.reason).toMatch(/challenge/i);
    } else throw new Error("expected failure");
  });

  it("classifies an empty 200 body", async () => {
    stubFetch(() => ok("   "));
    const result = await fetcher().fetchText("https://a.test/x");
    if (!result.ok) expect(result.kind).toBe("empty");
    else throw new Error("expected failure");
  });

  it("classifies a thrown network error", async () => {
    vi.stubGlobal("fetch", () => Promise.reject(new Error("ECONNREFUSED")));
    const result = await fetcher().fetchText("https://a.test/x");
    if (!result.ok) {
      expect(result.kind).toBe("network");
      // Transient failures are retried, and the report says so.
      expect(result.reason).toMatch(/^ECONNREFUSED \(after 3 attempts\)$/);
    } else throw new Error("expected failure");
  });

  it("classifies an abort as a timeout", async () => {
    vi.stubGlobal("fetch", () => {
      const error = new Error("aborted");
      error.name = "AbortError";
      return Promise.reject(error);
    });
    const result = await fetcher().fetchText("https://a.test/x", { timeoutMs: 5 });
    if (!result.ok) {
      expect(result.kind).toBe("timeout");
      expect(result.reason).toMatch(/timed out/i);
    } else throw new Error("expected failure");
  });

  it("rejects an invalid URL without calling fetch", async () => {
    const { calls } = stubFetch(() => ok("x"));
    const result = await fetcher().fetchText("not a url");
    expect(result.ok).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it("never throws on an HTTP failure — one bad target must not abort a run", async () => {
    stubFetch(() => new Response("", { status: 500 }));
    await expect(fetcher().fetchText("https://a.test/x")).resolves.toMatchObject({ ok: false });
  });

  it("waits between two requests to the same host", async () => {
    stubFetch(() => ok("x"));
    const slept: number[] = [];
    const polite = new HttpFetcher(1_000, async (ms) => {
      slept.push(ms);
    });

    await polite.fetchText("https://a.test/1");
    await polite.fetchText("https://a.test/2");

    expect(slept).toHaveLength(1);
    expect(slept[0]).toBeGreaterThan(0);
  });

  it("does not make different hosts wait on each other", async () => {
    stubFetch(() => ok("x"));
    const slept: number[] = [];
    const polite = new HttpFetcher(1_000, async (ms) => {
      slept.push(ms);
    });

    await polite.fetchText("https://a.test/1");
    await polite.fetchText("https://b.test/1");

    expect(slept).toHaveLength(0);
  });
});

// ── Module 10B.2: retries ──

describe("backoffDelayMs", () => {
  it("grows exponentially and is capped", () => {
    const noJitter = () => 1;
    expect(backoffDelayMs(0, noJitter)).toBe(600);
    expect(backoffDelayMs(1, noJitter)).toBe(1200);
    expect(backoffDelayMs(2, noJitter)).toBe(2400);
    expect(backoffDelayMs(10, noJitter)).toBe(8000);
  });

  it("applies jitter between 50% and 100% of the delay", () => {
    expect(backoffDelayMs(1, () => 0)).toBe(600);
    expect(backoffDelayMs(1, () => 1)).toBe(1200);
  });
});

describe("parseRetryAfter", () => {
  it("reads delta-seconds", () => {
    expect(parseRetryAfter("2")).toBe(2000);
  });

  it("reads an HTTP-date", () => {
    const now = Date.parse("2026-08-09T00:00:00Z");
    expect(parseRetryAfter("Sun, 09 Aug 2026 00:00:03 GMT", now)).toBe(3000);
  });

  it("caps a hostile value so one board cannot stall a run", () => {
    expect(parseRetryAfter("99999")).toBe(8000);
  });

  it("returns null for nonsense or a missing header", () => {
    expect(parseRetryAfter(null)).toBeNull();
    expect(parseRetryAfter("soon")).toBeNull();
  });

  it("never returns a negative delay for a past date", () => {
    const now = Date.parse("2026-08-09T00:00:10Z");
    expect(parseRetryAfter("Sun, 09 Aug 2026 00:00:00 GMT", now)).toBe(0);
  });
});

describe("HttpFetcher retries", () => {
  /** Returns the given responses in order, one per attempt. */
  function sequence(responses: Array<() => Response | Promise<Response>>) {
    let index = 0;
    const calls = { count: 0 };
    vi.stubGlobal("fetch", () => {
      calls.count++;
      const next = responses[Math.min(index++, responses.length - 1)];
      return Promise.resolve(next());
    });
    return calls;
  }

  it("retries a 500 and succeeds on a later attempt", async () => {
    const calls = sequence([
      () => new Response("", { status: 500 }),
      () => new Response("", { status: 500 }),
      () => ok("recovered"),
    ]);

    const result = await fetcher().fetchText("https://a.test/x");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.body).toBe("recovered");
    expect(calls.count).toBe(3);
  });

  it("retries a timeout", async () => {
    let attempts = 0;
    vi.stubGlobal("fetch", () => {
      attempts++;
      if (attempts < 3) {
        const error = new Error("aborted");
        error.name = "AbortError";
        return Promise.reject(error);
      }
      return Promise.resolve(ok("late but fine"));
    });

    const result = await fetcher().fetchText("https://a.test/x");
    expect(result.ok).toBe(true);
    expect(attempts).toBe(3);
  });

  it("retries a 429 — that is the platform asking us to slow down, not to go away", async () => {
    const calls = sequence([() => new Response("", { status: 429 }), () => ok("fine")]);
    const result = await fetcher().fetchText("https://a.test/x");
    expect(result.ok).toBe(true);
    expect(calls.count).toBe(2);
  });

  it("does NOT retry a 403 — hammering a board that said no is the behaviour to avoid", async () => {
    const calls = sequence([() => new Response("", { status: 403 })]);
    const result = await fetcher().fetchText("https://a.test/x");

    expect(result.ok).toBe(false);
    expect(calls.count).toBe(1);
    if (!result.ok) expect(result.reason).not.toMatch(/attempts/);
  });

  it.each([404, 410, 400])("does NOT retry a %d", async (status) => {
    const calls = sequence([() => new Response("", { status })]);
    await fetcher().fetchText("https://a.test/x");
    expect(calls.count).toBe(1);
  });

  it("does NOT retry an anti-bot challenge page", async () => {
    const calls = sequence([
      () => ok(`<html><script src="https://ct.captcha-delivery.com/c.js"></script></html>`),
    ]);
    await fetcher().fetchText("https://a.test/x");
    expect(calls.count).toBe(1);
  });

  it("gives up after the configured attempts and says how many it made", async () => {
    const calls = sequence([() => new Response("", { status: 503 })]);
    const result = await fetcher().fetchText("https://a.test/x", { retries: 2 });

    expect(calls.count).toBe(3);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/after 3 attempts/);
  });

  it("honours retries: 0", async () => {
    const calls = sequence([() => new Response("", { status: 500 })]);
    await fetcher().fetchText("https://a.test/x", { retries: 0 });
    expect(calls.count).toBe(1);
  });

  it("waits for Retry-After rather than its own backoff when the platform sets it", async () => {
    const slept: number[] = [];
    const polite = new HttpFetcher(
      0,
      async (ms) => void slept.push(ms),
      () => 0.5,
    );
    sequence([
      () => new Response("", { status: 429, headers: { "retry-after": "3" } }),
      () => ok("fine"),
    ]);

    await polite.fetchText("https://a.test/x");
    expect(slept).toEqual([3000]);
  });
});

describe("parseJsonResult", () => {
  it("parses a successful JSON body", () => {
    const parsed = parseJsonResult<{ a: number }>({
      ok: true,
      status: 200,
      url: "https://a.test",
      body: '{"a":1}',
      contentType: "application/json",
    });
    expect(parsed).toEqual({ ok: true, data: { a: 1 } });
  });

  it("propagates a fetch failure's reason", () => {
    const parsed = parseJsonResult({
      ok: false,
      kind: "blocked",
      status: 403,
      url: "https://a.test",
      reason: "Blocked by the platform (HTTP 403).",
    });
    expect(parsed).toEqual({ ok: false, reason: "Blocked by the platform (HTTP 403)." });
  });

  it("reports non-JSON without throwing", () => {
    const parsed = parseJsonResult({
      ok: true,
      status: 200,
      url: "https://a.test",
      body: "<html>",
      contentType: "text/html",
    });
    expect(parsed.ok).toBe(false);
  });
});
