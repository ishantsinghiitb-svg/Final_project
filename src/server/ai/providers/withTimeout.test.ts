import { describe, expect, it, vi } from "vitest";
import { isAbortError, withTimeout } from "./withTimeout";
import { AIError } from "../errors";
import type { AICompletionRaw, AICompletionRequest, AIProvider } from "./types";

// ── Provider deadline (infrastructure) ──
//
// Every AI capability in the product routes through this wrapper, so a
// regression here either hangs every feature (deadline stops firing) or breaks
// every feature (deadline fires on healthy calls). Both are pinned below.

const OK: AICompletionRaw = {
  raw: { ok: true },
  model: "test-model",
  usage: { inputTokens: 1, outputTokens: 1 },
};

function req(): AICompletionRequest {
  return {
    system: "s",
    user: "u",
    model: "test-model",
    schema: { safeParse: () => ({ success: true, data: {} }) } as never,
    schemaName: "test",
  };
}

function providerThat(impl: (r: AICompletionRequest) => Promise<AICompletionRaw>): AIProvider {
  return { id: "openai", complete: impl };
}

describe("withTimeout — healthy calls", () => {
  it("passes the result straight through when the provider responds in time", async () => {
    const p = withTimeout(
      providerThat(async () => OK),
      1000,
    );
    await expect(p.complete(req())).resolves.toEqual(OK);
  });

  it("preserves the provider id", () => {
    expect(
      withTimeout(
        providerThat(async () => OK),
        1000,
      ).id,
    ).toBe("openai");
  });

  it("does not fire for a call that finishes just inside the deadline", async () => {
    const p = withTimeout(
      providerThat(async () => {
        await new Promise((r) => setTimeout(r, 20));
        return OK;
      }),
      300,
    );
    await expect(p.complete(req())).resolves.toEqual(OK);
  });

  it("rethrows a genuine provider failure unchanged rather than calling it a timeout", async () => {
    const boom = new Error("upstream 500");
    const p = withTimeout(
      providerThat(async () => {
        throw boom;
      }),
      1000,
    );
    await expect(p.complete(req())).rejects.toBe(boom);
  });
});

describe("withTimeout — the hang it exists to stop", () => {
  it("rejects with a retryable AIError coded `timeout` when the provider never settles", async () => {
    // A promise that never resolves is exactly the observed failure: no error,
    // no response, nothing for withRetry to react to.
    const p = withTimeout(
      providerThat(() => new Promise<AICompletionRaw>(() => {})),
      30,
    );
    const err = await p.complete(req()).catch((e) => e);
    expect(err).toBeInstanceOf(AIError);
    expect(err.code).toBe("timeout");
    expect(err.retryable).toBe(true);
  });

  it("aborts the underlying request instead of merely abandoning it", async () => {
    let observed: AbortSignal | undefined;
    const p = withTimeout(
      providerThat((r) => {
        observed = r.signal;
        return new Promise<AICompletionRaw>(() => {});
      }),
      30,
    );
    await p.complete(req()).catch(() => {});
    expect(observed).toBeDefined();
    expect(observed!.aborted).toBe(true);
  });

  it("normalizes a provider's own abort rejection into the timeout error", async () => {
    // Real SDKs reject with their own abort error slightly before the race
    // does; the caller must still see one consistent failure.
    const p = withTimeout(
      providerThat(
        (r) =>
          new Promise<AICompletionRaw>((_res, rej) => {
            r.signal?.addEventListener("abort", () => {
              const e = new Error("Request was aborted.");
              e.name = "AbortError";
              rej(e);
            });
          }),
      ),
      30,
    );
    const err = await p.complete(req()).catch((e) => e);
    expect(err).toBeInstanceOf(AIError);
    expect(err.code).toBe("timeout");
  });

  it("clears its timer so a resolved call leaves nothing pending", async () => {
    vi.useFakeTimers();
    try {
      const clearSpy = vi.spyOn(globalThis, "clearTimeout");
      const p = withTimeout(
        providerThat(async () => OK),
        60_000,
      );
      await p.complete(req());
      expect(clearSpy).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("withTimeout — misconfiguration must not take AI down", () => {
  it.each([0, -1, Number.NaN])("returns the provider unwrapped for timeoutMs=%s", async (ms) => {
    const inner = providerThat(async () => OK);
    const p = withTimeout(inner, ms as number);
    expect(p).toBe(inner);
    await expect(p.complete(req())).resolves.toEqual(OK);
  });
});

describe("isAbortError", () => {
  it("recognizes the shapes different layers actually throw", () => {
    const domLike = new Error("aborted");
    domLike.name = "AbortError";
    const sdkLike = new Error("Request was aborted.");
    sdkLike.name = "APIUserAbortError";
    const nodeLike = Object.assign(new Error("aborted"), { code: "ABORT_ERR" });

    expect(isAbortError(domLike)).toBe(true);
    expect(isAbortError(sdkLike)).toBe(true);
    expect(isAbortError(nodeLike)).toBe(true);
  });

  it("does not mistake ordinary failures for aborts", () => {
    expect(isAbortError(new Error("upstream 500"))).toBe(false);
    expect(isAbortError(null)).toBe(false);
    expect(isAbortError("aborted")).toBe(false);
  });
});
