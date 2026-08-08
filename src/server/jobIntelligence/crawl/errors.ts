// ── Module 10B.1: crawl error taxonomy ──
//
// A crawl run touches many independent targets, so "this one failed" must
// never read the same as "the run failed". These errors carry the two facts
// the crawl report needs to say something useful about a failed target:
// whether it was a platform BLOCK (anti-bot, auth, rate limit — a standing
// limitation) or an ordinary configuration/transport failure (retry later).

export type CrawlErrorDetail = {
  /** Anti-bot, auth wall, or rate limit — reported as a platform limitation, not a bug. */
  blocked?: boolean;
};

/** Raised when a target cannot be crawled at all (bad config, unreadable board, blocked). */
export class CrawlTargetError extends Error {
  readonly blocked: boolean;

  constructor(message: string, detail: CrawlErrorDetail = {}) {
    super(message);
    this.name = "CrawlTargetError";
    this.blocked = detail.blocked ?? false;
  }
}

/** True when an unknown error came from a platform block. */
export function isBlockedError(error: unknown): boolean {
  return error instanceof CrawlTargetError && error.blocked;
}

/** Safe message extraction — never leaks a non-Error object into a report. */
export function crawlErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  return fallback;
}
