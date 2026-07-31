import { AITimeoutError } from "../errors";
import type { AICompletionRaw, AICompletionRequest, AIProvider } from "./types";

// ── Provider deadline decorator (infrastructure hotfix) ──
//
// Applied by the provider registry to EVERY provider, so every AI capability —
// current and future — inherits a hard deadline without changing a single
// orchestration. Adding a capability requires no timeout wiring; it gets this
// for free by calling getProvider().
//
// ── Why this exists ──
// Nothing in the AI engine bounded how long a provider call could take.
// `withRetry` only reacts to a THROW, and a hung request never throws, so a
// stalled upstream call meant: the retry never fired, no ai_runs row was ever
// written (that happens after the call returns), and the feature sat disabled
// indefinitely with no error surfaced. Observed live on a mock interview turn
// that stopped responding after several ~10s turns — the candidate's answer
// was safely persisted, but the UI had no way forward.
//
// ── Why abort rather than Promise.race alone ──
// Racing a timer against the request settles the promise but leaves the HTTP
// request running: the connection, the tokens and the spend all continue. The
// AbortController is what actually cancels it. The race is still needed as a
// backstop for a provider that ignores the signal, so this does both.

/** Recognizes an abort from any layer — DOMException, node fetch, or the OpenAI SDK's own error. */
export function isAbortError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { name?: string; code?: string; message?: string };
  return (
    e.name === "AbortError" ||
    e.name === "APIUserAbortError" ||
    e.code === "ABORT_ERR" ||
    (typeof e.message === "string" && e.message.toLowerCase().includes("aborted"))
  );
}

/**
 * Wraps a provider so `complete()` cannot outlive `timeoutMs`.
 *
 * On expiry the underlying request is aborted and an `AITimeoutError` is
 * thrown — a retryable AIError, so the caller's existing `withRetry` gets one
 * more attempt with a fresh deadline, and `toResultCode` maps it to a distinct
 * `timeout` code rather than burying it in `unknown_error`.
 */
export function withTimeout(provider: AIProvider, timeoutMs: number): AIProvider {
  // A non-positive/NaN timeout would abort instantly and take every AI feature
  // down, so a misconfigured value disables the deadline rather than breaking
  // the product. Config is validated at the edge, not trusted here.
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return provider;

  return {
    id: provider.id,
    async complete(req: AICompletionRequest): Promise<AICompletionRaw> {
      const controller = new AbortController();
      // Honour a caller-supplied signal too, so an outer cancellation (a
      // future request-scoped abort) still propagates through the deadline.
      const abortFromCaller = () => controller.abort();
      req.signal?.addEventListener("abort", abortFromCaller, { once: true });

      let timer: ReturnType<typeof setTimeout> | undefined;
      let timedOut = false;

      try {
        return await Promise.race([
          provider.complete({ ...req, signal: controller.signal }),
          new Promise<never>((_resolve, reject) => {
            timer = setTimeout(() => {
              timedOut = true;
              controller.abort();
              reject(new AITimeoutError(timeoutMs));
            }, timeoutMs);
          }),
        ]);
      } catch (err) {
        // The provider usually rejects with its own abort error slightly
        // before the race's rejection lands. Both mean the same thing to the
        // caller, so normalize to the timeout error.
        if (timedOut || isAbortError(err)) throw new AITimeoutError(timeoutMs);
        throw err;
      } finally {
        if (timer) clearTimeout(timer);
        req.signal?.removeEventListener("abort", abortFromCaller);
      }
    },
  };
}
