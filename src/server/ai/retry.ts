import { AIError } from "./errors";

// ── Retry with exponential backoff + jitter (Module 6A) ──

export type RetryOptions = {
  attempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
};

const DEFAULTS: Required<RetryOptions> = {
  attempts: 3,
  baseDelayMs: 400,
  maxDelayMs: 4000,
};

function isRetryable(err: unknown): boolean {
  if (err instanceof AIError) return err.retryable;
  return true; // network/unknown → retry
}

export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const { attempts, baseDelayMs, maxDelayMs } = { ...DEFAULTS, ...opts };
  let lastError: unknown;

  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt === attempts - 1 || !isRetryable(err)) break;
      const backoff = Math.min(baseDelayMs * 2 ** attempt, maxDelayMs);
      const jitter = Math.random() * backoff * 0.25;
      await new Promise((r) => setTimeout(r, backoff + jitter));
    }
  }
  throw lastError;
}
