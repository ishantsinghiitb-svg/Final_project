// ── Module 10B.2: the 30-day active-job window ──
//
// ⚠️ Lives in features/jobs/ (NOT under src/server/) on purpose: this policy is
// shared by the SERVER ingestion gate and the CLIENT discovery query, and the
// client build rejects any import path containing a "server" segment. This is
// the same placement Module 10A used for `fingerprint.ts`, which the server
// normalizer imports from here for exactly the same reason.
//
// Product rule: jobs older than 30 days are not surfaced as ACTIVE jobs.
//
// Three boundaries have to agree on that, so the rule is defined once here and
// imported by all of them rather than being re-typed as a magic 30:
//
//   1. INGESTION  — a crawled posting that is already older than the window is
//      rejected before it can become a new `global_jobs` row (see
//      validate/JobValidator.ts). There is no value in importing a job that
//      would be invisible the moment it landed.
//   2. RETENTION  — nothing is deleted. A job that ages out simply stops
//      matching the active window; its row, its `job_sources` attribution and
//      its dedup identity all survive untouched. This is deliberate: deleting
//      aged rows would break cross-platform deduplication (a re-post would
//      look brand new) and destroy history the schema was built to keep.
//   3. SEARCH     — see the warning below. The discovery query is deliberately
//      NOT filtered on `posted_at`.
//
// ⚠️ DO NOT add a `posted_at` age ceiling to JobRepository.applyDiscoveryVisibility.
// That exact change has already been made once in this codebase and was
// reverted as a reported regression — its comment explains why: `posted_at` is
// the ORIGINAL post date, so a still-open, freshly captured REPOST legitimately
// carries a months-old date, and an age ceiling silently dropped those valid
// rows from the feed while they remained visible under Applications/Saved/Job
// Detail (which don't apply the filter).
//
// So the active window is enforced where the date is trustworthy — at
// ingestion, on postings this module itself crawls — and by ageing crawled
// jobs out via `last_seen_at` (a signal we control: a job that has vanished
// from its board stops being refreshed), never by second-guessing `posted_at`
// on rows the extension captured.
//
// ⚠️ A posting with NO posted_at is NEVER treated as stale. Plenty of real
// sources omit the date (and every extension-captured job predates this rule),
// so treating "unknown age" as "too old" would silently empty the Jobs page.
// Unknown means unknown, and unknown stays visible.

export const ACTIVE_WINDOW_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

/** The oldest `posted_at` still considered active, as an ISO timestamp. */
export function activeWindowCutoffIso(now: number = Date.now()): string {
  return new Date(now - ACTIVE_WINDOW_DAYS * DAY_MS).toISOString();
}

/**
 * True when a posting is older than the active window.
 *
 * Null/unparseable dates return FALSE (not stale) — see the note above. A date
 * in the future is also not stale; that is a source with a clock problem, not
 * an old job, and the validator handles implausible future dates separately.
 */
export function isOutsideActiveWindow(
  postedAt: string | null | undefined,
  now: number = Date.now(),
): boolean {
  if (!postedAt) return false;
  const parsed = Date.parse(postedAt);
  if (Number.isNaN(parsed)) return false;
  return parsed < now - ACTIVE_WINDOW_DAYS * DAY_MS;
}

/** Whole days since posting, or null when the date is absent/unparseable. */
export function ageInDays(
  postedAt: string | null | undefined,
  now: number = Date.now(),
): number | null {
  if (!postedAt) return null;
  const parsed = Date.parse(postedAt);
  if (Number.isNaN(parsed)) return null;
  return Math.floor((now - parsed) / DAY_MS);
}
