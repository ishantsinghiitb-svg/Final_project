// ── Posted-date freshness ──
//
// OfferLyst's catalog only carries jobs posted within the last 30 days. This is
// the ONE place that parses a source's posted date and decides whether it is
// fresh enough; every adapter routes through it (see ./jobEligibility.ts).
//
// ⚠️ HISTORY — read before changing this. A `posted_at` age ceiling was shipped
// once before and REVERTED: the 2026-08-09 dry-run audit found it rejected
// 2,702 of 3,890 real postings (69%), because large-company ATS requisitions
// stay open for months while `posted_at` (the ORIGINAL publish date) never
// moves. Those warnings still stand in crawl/validate/JobValidator.ts,
// repositories/JobRepository.ts and features/jobs/activeWindow.ts, and they are
// about the `last_seen_at` lifecycle window — a DIFFERENT mechanism that keeps
// a still-open, still-seen posting visible.
//
// This module is a DELIBERATE product decision to filter on true posting age
// anyway (launch requirement, 2026-09-12): OfferLyst promises fresh jobs, and a
// six-month-old open req is not what a candidate means by "new". The cost is
// accepted knowingly — a large fraction of any ATS board will be excluded.
// `last_seen_at` continues to do its separate job unchanged.
//
// REJECT-BY-DEFAULT: a posting with no reliable posted date is rejected, never
// defaulted to "now". Dating an unknown-age posting to the crawl time would
// silently fill the catalog with jobs of unknown age wearing today's date —
// exactly the failure this gate exists to prevent.

import { MAX_JOB_AGE_DAYS, freshnessCutoffIso } from "@/features/jobs/postedWindow";

// Re-exported so server callers need not know where the shared window lives.
export { MAX_JOB_AGE_DAYS, freshnessCutoffIso };

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * How far ahead of "now" a posted date may sit and still be trusted. Sources
 * publish date-only values ("2026-09-13") which parse as UTC midnight, so a
 * posting made today can legitimately read as tomorrow from a timezone behind
 * UTC. Beyond this the date is a parse artifact, not a posting date.
 */
const FUTURE_TOLERANCE_DAYS = 2;

/** Older than this and the value is certainly a mis-parse, not a real posting. */
const ABSURD_PAST_YEARS = 10;

export type PostedDateResult =
  { ok: true; iso: string; date: Date } | { ok: false; reason: string };

/**
 * Parses whatever a source calls its posted date into a trustworthy instant.
 *
 * Accepts ISO-8601 strings, `Date`s, and epoch numbers (seconds or millis —
 * disambiguated by magnitude, since every ATS observed emits one or the other
 * with no unit marker). Everything else is rejected with a reason rather than
 * coerced, because a wrong date here silently changes what the catalog claims.
 */
export function parsePostedDate(value: unknown, now: Date = new Date()): PostedDateResult {
  if (value === null || value === undefined || value === "") {
    return { ok: false, reason: "No posted date on the posting." };
  }

  let date: Date | null = null;

  if (value instanceof Date) {
    date = value;
  } else if (typeof value === "number" && Number.isFinite(value)) {
    // Seconds vs millis: any plausible posting in seconds is < 1e11
    // (year 5138), and any plausible posting in millis is > 1e11 (1973).
    date = new Date(Math.abs(value) < 1e11 ? value * 1000 : value);
  } else if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return { ok: false, reason: "Posted date was blank." };
    // A bare epoch delivered as a string.
    if (/^\d{10}$|^\d{13}$/.test(trimmed)) {
      const numeric = Number(trimmed);
      date = new Date(trimmed.length === 10 ? numeric * 1000 : numeric);
    } else {
      date = new Date(trimmed);
    }
  } else {
    return { ok: false, reason: `Posted date had unsupported type "${typeof value}".` };
  }

  if (!date || Number.isNaN(date.getTime())) {
    return {
      ok: false,
      reason: `Posted date "${String(value).slice(0, 40)}" could not be parsed.`,
    };
  }

  const ageMs = now.getTime() - date.getTime();

  if (ageMs < -FUTURE_TOLERANCE_DAYS * MS_PER_DAY) {
    return {
      ok: false,
      reason: `Posted date ${date.toISOString()} is in the future — not a reliable posting date.`,
    };
  }

  if (ageMs > ABSURD_PAST_YEARS * 365 * MS_PER_DAY) {
    return {
      ok: false,
      reason: `Posted date ${date.toISOString()} is more than ${ABSURD_PAST_YEARS} years old — treated as a mis-parse.`,
    };
  }

  return { ok: true, iso: date.toISOString(), date };
}

/**
 * Resolves a RELATIVE posting age ("Posted 3 days ago") to an absolute instant.
 *
 * Some sources never publish an absolute date and state the age instead —
 * Internshala is the one in this codebase, whose detail pages carry "Posted 2
 * weeks ago" / "Posted just now" and no `datePosted` anywhere. Converting that
 * is NOT fabricating a date: the source is stating when it posted the job, just
 * in relative form. Refusing to read it would silently drop every Internshala
 * job from the catalog, which is a worse answer than arithmetic the source
 * itself implies.
 *
 * Anything it cannot confidently interpret returns null, so the caller falls
 * back to "no reliable posted date" and the posting is rejected — the same
 * reject-by-default rule the rest of this module follows. Deliberately lives
 * here, not in the Internshala adapter, so any future source with the same
 * habit uses the identical interpretation.
 */
export function parseRelativePostedDate(
  input: string | null | undefined,
  now: Date = new Date(),
): string | null {
  const text = (input ?? "").trim().toLowerCase();
  if (!text) return null;

  const at = (ms: number): string => new Date(now.getTime() - ms).toISOString();

  // "just now", "today", "a few hours ago" — all within today.
  if (/\b(just now|today|few (?:hours|minutes)|moments? ago)\b/.test(text)) return at(0);
  if (/\byesterday\b/.test(text)) return at(MS_PER_DAY);

  const match = text.match(
    /\b(?:an?|\d+)\s*(minute|min|hour|hr|day|week|month|year)s?\s*(?:ago)?\b/,
  );
  if (!match) return null;

  const amountText = match[0].match(/\d+/)?.[0];
  // "a day ago" / "an hour ago" both mean one.
  const amount = amountText ? Number(amountText) : 1;
  if (!Number.isFinite(amount) || amount < 0) return null;

  const unit = match[1];
  const MS: Record<string, number> = {
    minute: 60_000,
    min: 60_000,
    hour: 3_600_000,
    hr: 3_600_000,
    day: MS_PER_DAY,
    week: 7 * MS_PER_DAY,
    month: 30 * MS_PER_DAY,
    year: 365 * MS_PER_DAY,
  };
  const perUnit = MS[unit];
  if (!perUnit) return null;

  return at(amount * perUnit);
}

export type FreshnessDecision =
  | { fresh: true; ageDays: number; iso: string }
  | { fresh: false; reason: string; ageDays: number | null };

/**
 * Whether a posting is within the freshness window.
 *
 * Boundary is INCLUSIVE at exactly `maxAgeDays` (a posting exactly 30×24h old
 * is fresh; one millisecond older is not), and is measured between absolute
 * instants, so it is timezone-independent by construction — a "2026-08-13"
 * from a source in IST and the same date from a source in PST both resolve to
 * the same UTC instant before comparison.
 */
export function isFreshJob(
  postedAt: unknown,
  now: Date = new Date(),
  maxAgeDays: number = MAX_JOB_AGE_DAYS,
): FreshnessDecision {
  const parsed = parsePostedDate(postedAt, now);
  if (!parsed.ok) return { fresh: false, reason: parsed.reason, ageDays: null };

  const ageMs = now.getTime() - parsed.date.getTime();
  const ageDays = ageMs / MS_PER_DAY;

  if (ageMs > maxAgeDays * MS_PER_DAY) {
    return {
      fresh: false,
      reason: `Posted ${ageDays.toFixed(1)} days ago — older than the ${maxAgeDays}-day window.`,
      ageDays,
    };
  }

  // A within-tolerance future date counts as age 0, not negative age.
  return { fresh: true, ageDays: Math.max(0, ageDays), iso: parsed.iso };
}
