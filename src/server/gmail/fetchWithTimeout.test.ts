import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchWithTimeout, GOOGLE_API_TIMEOUT_MS } from "./fetchWithTimeout";

// ── Bounded fetch tests (P1 · Gmail sync hang fix) ──
//
// Every Google OAuth / Gmail API call routes through this one function, so a
// regression here either lets a hang through again (deadline stops firing)
// or breaks every healthy call (deadline fires too eagerly). Both are
// pinned below, mirroring src/server/ai/providers/withTimeout.test.ts's
// structure for the same class of guarantee.

afterEach(() => {
  vi.unstubAllGlobals();
});

function ok(): Response {
  return new Response("{}", { status: 200 });
}

/**
 * A fetch mock that never resolves on its own — but, like real `fetch()`,
 * DOES reject with an AbortError once its signal fires. A bare
 * `new Promise(() => {})` does NOT do this (nothing is listening to the
 * signal), so it would hang the test itself rather than exercise the
 * timeout; this is what actually simulates the production hang.
 */
function hangingFetch(): (url: string, init?: RequestInit) => Promise<Response> {
  return (_url, init) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => {
        const e = new Error("The operation was aborted.");
        e.name = "AbortError";
        reject(e);
      });
    });
}

describe("fetchWithTimeout — healthy calls", () => {
  it("passes the response straight through when it resolves in time", async () => {
    vi.stubGlobal("fetch", () => Promise.resolve(ok()));
    const res = await fetchWithTimeout("https://oauth2.googleapis.com/token", {}, 1000);
    expect(res.status).toBe(200);
  });

  it("does not fire for a call that finishes just inside the deadline", async () => {
    vi.stubGlobal(
      "fetch",
      () => new Promise<Response>((resolve) => setTimeout(() => resolve(ok()), 20)),
    );
    const res = await fetchWithTimeout("https://gmail.googleapis.com/x", {}, 300);
    expect(res.status).toBe(200);
  });

  it("passes an AbortSignal into the underlying fetch call", async () => {
    let observed: AbortSignal | undefined;
    vi.stubGlobal("fetch", (_url: string, init?: RequestInit) => {
      observed = init?.signal ?? undefined;
      return Promise.resolve(ok());
    });
    await fetchWithTimeout("https://gmail.googleapis.com/x", {}, 1000);
    expect(observed).toBeInstanceOf(AbortSignal);
    expect(observed!.aborted).toBe(false);
  });

  it("preserves caller-supplied init fields (method, headers, body) alongside the signal", async () => {
    let observedInit: RequestInit | undefined;
    vi.stubGlobal("fetch", (_url: string, init?: RequestInit) => {
      observedInit = init;
      return Promise.resolve(ok());
    });
    await fetchWithTimeout(
      "https://oauth2.googleapis.com/token",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "grant_type=refresh_token",
      },
      1000,
    );
    expect(observedInit?.method).toBe("POST");
    expect(observedInit?.headers).toEqual({ "Content-Type": "application/x-www-form-urlencoded" });
    expect(observedInit?.body).toBe("grant_type=refresh_token");
  });

  it("rethrows a genuine fetch failure unchanged rather than calling it a timeout", async () => {
    const boom = new Error("ECONNREFUSED");
    vi.stubGlobal("fetch", () => Promise.reject(boom));
    await expect(fetchWithTimeout("https://gmail.googleapis.com/x", {}, 1000)).rejects.toBe(boom);
  });

  it("defaults to GOOGLE_API_TIMEOUT_MS when no timeout is supplied", () => {
    expect(GOOGLE_API_TIMEOUT_MS).toBe(15_000);
  });
});

describe("fetchWithTimeout — the hang it exists to stop", () => {
  // This is the exact production failure: a request that never resolves and
  // never rejects on its own, so nothing downstream ever gets a chance to
  // run. hangingFetch() still rejects on abort (as real fetch() does), which
  // is exactly the behaviour this function's own AbortController is
  // responsible for triggering.
  it("throws within the deadline when the request never settles", async () => {
    vi.stubGlobal("fetch", hangingFetch());
    const start = Date.now();
    const err = await fetchWithTimeout("https://gmail.googleapis.com/x", {}, 30).catch(
      (e: unknown) => e,
    );
    expect(Date.now() - start).toBeLessThan(500);
    expect(err).toBeInstanceOf(Error);
  });

  it("aborts the underlying request instead of merely abandoning it", async () => {
    let observed: AbortSignal | undefined;
    vi.stubGlobal("fetch", (url: string, init?: RequestInit) => {
      observed = init?.signal ?? undefined;
      return hangingFetch()(url, init);
    });
    await fetchWithTimeout("https://gmail.googleapis.com/x", {}, 30).catch(() => {});
    expect(observed).toBeDefined();
    expect(observed!.aborted).toBe(true);
  });

  it("throws a plain, readable Error naming the host and the deadline, not an opaque AbortError", async () => {
    vi.stubGlobal("fetch", hangingFetch());
    const err = await fetchWithTimeout("https://oauth2.googleapis.com/token", {}, 30).catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).name).not.toBe("AbortError");
    expect((err as Error).message).toBe("Request to oauth2.googleapis.com timed out after 30ms.");
  });

  it("falls back to the raw URL in the message if the URL is unparseable", async () => {
    vi.stubGlobal("fetch", hangingFetch());
    const err = await fetchWithTimeout("not-a-real-url", {}, 30).catch((e: unknown) => e);
    expect((err as Error).message).toBe("Request to not-a-real-url timed out after 30ms.");
  });

  it("clears its timer on both success and timeout so nothing leaks", async () => {
    const clearSpy = vi.spyOn(globalThis, "clearTimeout");

    vi.stubGlobal("fetch", () => Promise.resolve(ok()));
    await fetchWithTimeout("https://gmail.googleapis.com/x", {}, 1000);
    expect(clearSpy).toHaveBeenCalled();

    clearSpy.mockClear();
    vi.stubGlobal("fetch", hangingFetch());
    await fetchWithTimeout("https://gmail.googleapis.com/x", {}, 30).catch(() => {});
    expect(clearSpy).toHaveBeenCalled();

    clearSpy.mockRestore();
  });
});
