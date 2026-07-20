/**
 * Extraction helpers shared by `FounditJobParser` (detail pages) and
 * `FounditListingParser` (search cards). `extractFounditJobId` is what
 * guarantees a listing card and its detail page resolve to the SAME
 * `source_job_id` — both a card's `/job/…-<id>` href and the detail page's
 * own URL/JSON-LD end in the identical numeric id — which is what lets the
 * detail parse enrich (COALESCE), rather than duplicate, a card's preview row.
 */

/** The trailing numeric id in a Foundit job URL, e.g. "…-hyderabad-59142082" → "59142082". */
export function extractFounditJobId(url: string): string | null {
  try {
    const path = new URL(url).pathname.replace(/\/$/, "");
    const match = /-(\d{6,})$/.exec(path);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

/**
 * Foundit displays Indian salary ranges as "₹ 0.5 - 25 LPA" — an abbreviation
 * the shared `parseSalary` doesn't recognize (it looks for "lakh"/"per
 * annum" as whole words), so the ×1e5 magnitude and Yearly period would
 * silently be dropped. Expanding the abbreviation first keeps `parseSalary`
 * itself untouched (it's shared with LinkedIn/Internshala/Naukri) while
 * fixing this one board's own display convention.
 */
export function normalizeIndianSalaryText(raw: string | null): string | null {
  if (!raw) return raw;
  return raw.replace(/\bLPA\b/gi, "Lakh per annum").replace(/\bLPM\b/gi, "Lakh per month");
}

/**
 * Foundit's JSON-LD frequently uses the literal string "NA" (or an empty
 * string) as a "field not applicable" placeholder rather than omitting the
 * key — treated as unavailable here, exactly like any other missing field,
 * so it's never stored as if it were real data.
 */
export function readJsonLdText(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.replace(/\s+/g, " ").trim();
  if (!trimmed || /^n\/?a$/i.test(trimmed)) return null;
  return trimmed;
}

/**
 * Foundit's JSON-LD `datePosted`/`validThrough` are `DD-MM-YYYY` (optionally
 * with a trailing time), not ISO 8601 — `new Date(raw)` misparses that
 * format, so the day/month/year fields are read explicitly instead.
 */
export function parseFounditDate(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const match = /^(\d{2})-(\d{2})-(\d{4})/.exec(raw.trim());
  if (!match) return null;
  const [, dd, mm, yyyy] = match;
  const parsed = new Date(`${yyyy}-${mm}-${dd}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

/**
 * Placeholder company-logo filenames Foundit serves when a company has no
 * real logo. Deliberately narrow — only genuine "default"/"no-logo" assets —
 * so it can never reject a real logo whose CDN path happens to contain a
 * common word (an over-broad pattern here silently blanks real logos, which
 * is exactly the failure mode this guards against).
 */
export const FOUNDIT_PLACEHOLDER_LOGO_PATTERN =
  /companylogodefault|company[-_]?default|default[-_]?(?:company|logo)|no[-_]?logo/i;

export const FOUNDIT_CLOSED_PHRASES = [
  "this job is no longer available",
  "no longer accepting applications",
  "job has expired",
  "job has been closed",
];
