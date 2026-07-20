/**
 * URL/id helpers shared by the live `IndeedParser`, the `IndeedListingParser`,
 * and the manual-URL importer — so every entry point derives the SAME
 * `sourceJobId` and canonical `sourceUrl` for a given posting and the four URL
 * forms collapse to one deduplicated Global Job.
 *
 * Indeed exposes the same job under four shapes:
 *   1. `https://in.indeed.com/?from=gnav-homepage`                 (listing — no id)
 *   2. `https://in.indeed.com/?from=gnav-homepage&vjk=<id>`        (viewjob pane)
 *   3. `https://in.indeed.com/?vjk=<id>`                           (viewjob pane)
 *   4. `https://in.indeed.com/cmp/<Company>/jobs?jk=<id>`          (company detail)
 *
 * The job key is `vjk` on the search/homepage pane and `jk` on the company
 * page (and on listing-card links / the apply widget). Both name the same
 * 16-hex-char id, so all forms canonicalize to `https://<host>/viewjob?jk=<id>`.
 */

/** Indeed job keys are 10–20 hex chars (`5ac5bc5e22dbd27a`). */
const JOB_KEY_PATTERN = /^[0-9a-f]{10,20}$/i;

/** Reads the job key from a URL's `vjk` (viewjob pane) or `jk` (company page) param. */
export function extractIndeedJobIdFromUrl(url: string): string | null {
  try {
    const params = new URL(url).searchParams;
    const vjk = params.get("vjk");
    if (vjk && JOB_KEY_PATTERN.test(vjk)) return vjk.toLowerCase();
    const jk = params.get("jk");
    if (jk && JOB_KEY_PATTERN.test(jk)) return jk.toLowerCase();
    return null;
  } catch {
    return null;
  }
}

/** True only for a syntactically valid job key. */
export function isIndeedJobId(value: string | null | undefined): value is string {
  return typeof value === "string" && JOB_KEY_PATTERN.test(value);
}

/**
 * Canonical, id-bearing detail URL so both the search pane and the company
 * page (and the listing card) dedupe to one row. Preserves the country host
 * (`in.indeed.com`, `www.indeed.com`, …) from the current page, defaulting to
 * `in.indeed.com` when the URL can't be parsed.
 */
export function buildIndeedCanonicalUrl(jobId: string, url: string): string {
  let host = "in.indeed.com";
  try {
    host = new URL(url).host || host;
  } catch {
    // keep default host
  }
  return `https://${host}/viewjob?jk=${jobId}`;
}

/**
 * Indeed writes pay periods as "a year" / "a month" / "an hour" / "a week" /
 * "a day", which the shared salary parser's period patterns (which expect
 * "per year" / "/yr" / "annual") don't recognize. Rewriting them to "per <unit>"
 * lets `parseSalary` classify the `salaryPeriod` without changing the numbers.
 */
export function normalizeIndeedSalaryText(text: string | null | undefined): string | null {
  if (!text) return null;
  return text.replace(/\ban?\s+(year|month|week|day|hour)\b/gi, "per $1");
}
