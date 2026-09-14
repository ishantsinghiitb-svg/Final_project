/**
 * Resolves a RELATIVE posting age ("Posted 3 days ago", "13 hours ago") to an
 * absolute ISO instant.
 *
 * This is an intentional, byte-for-byte-in-logic mirror of
 * `parseRelativePostedDate` in
 * `src/server/jobIntelligence/eligibility/freshness.ts` — the extension is a
 * separate Vite bundle with no import path into `src/server`, so the
 * interpretation is duplicated here rather than shared, the same way
 * `sanitizeDescriptionHtml` is duplicated between the extension and the
 * server rather than cross-imported. Any change to the meaning of "N days
 * ago" must be made in BOTH places, or a job captured by the extension and
 * the same job re-crawled by the server would compute a different posted
 * date for identical source text.
 *
 * Why this exists at all: the Jobs page only shows postings whose `posted_at`
 * falls within the last 30 days (`src/features/jobs/postedWindow.ts`), and
 * that filter treats a NULL `posted_at` as "not fresh" (a SQL `>=` comparison
 * against NULL is never true) — so a posting with no absolute date is
 * invisible even when it was captured minutes ago. LinkedIn, Internshala, and
 * Foundit all reliably render a relative "time ago" string in their own DOM
 * even when no absolute `datePosted` is present in JSON-LD or a machine-
 * readable `<time datetime>` attribute (LinkedIn's authenticated /jobs/*
 * surfaces routinely omit both). Converting that relative text is not
 * fabricating a date — the source IS stating when it posted the job, just in
 * relative form — and refusing to read it would silently make every such
 * capture disappear from the product despite passing every other check.
 *
 * Anything not confidently interpreted returns null, so the caller's
 * `postedAt` stays null and the posting is (correctly) treated as having no
 * reliable posted date, rather than a guessed one.
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

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
