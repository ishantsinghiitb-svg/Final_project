// ── Module 10A: Company normalization ──
//
// Maps a raw, platform-specific company string ("Google Careers", "Amazon.jobs",
// "Groww Invest Tech") to a canonical display name ("Google", "Amazon",
// "Groww") while the caller keeps the original untouched — see
// normalizeCompanyName's return shape.
//
// This is DISTINCT from the SQL `normalize_company_name()` helper (see
// supabase/migrations/20260722000001_module4a_hierarchical_dedup.sql), which
// is deliberately conservative (only strips legal suffixes) because a false
// positive there silently merges two different real companies into one
// `global_jobs` row. This module is more aggressive on purpose — it also
// strips recruiting/careers-site noise words and applies a curated alias
// table — because its output is a DISPLAY name and a search/grouping key,
// never a merge decision by itself. The dedup engine (see ../dedup) still
// gates merges on the SQL rules.

export type NormalizedCompany = {
  /** Verbatim input, never mutated. */
  original: string;
  /** Canonical, display-ready company name. */
  canonicalName: string;
  /** Lowercase matching key derived from canonicalName — stable for grouping/search. */
  key: string;
};

// Curated overrides for cases generic suffix-stripping can't resolve (a
// company's own recruiting-subsidiary name has no general pattern). Keyed by
// the lowercase, punctuation-stripped input. Extend this table as new
// platforms surface new noise — it's additive, no code changes needed.
const COMPANY_ALIASES: Record<string, string> = {
  "google careers": "Google",
  "meta recruiting": "Meta",
  "meta careers": "Meta",
  "amazon jobs": "Amazon",
  amazonjobs: "Amazon",
  "groww invest tech": "Groww",
  "microsoft careers": "Microsoft",
  "apple careers": "Apple",
  "netflix jobs": "Netflix",
  "flipkart internet": "Flipkart",
  "swiggy limited": "Swiggy",
};

// Legal-entity suffixes, stripped from either end of the token list.
const LEGAL_SUFFIXES = new Set([
  "inc",
  "llc",
  "ltd",
  "limited",
  "corp",
  "corporation",
  "co",
  "gmbh",
  "plc",
  "llp",
  "srl",
  "sa",
  "ag",
  "bv",
  "nv",
  "pvt",
  "private",
]);

// Recruiting/careers-site noise words — meaningful to a job board, not to the
// company's identity.
const NOISE_WORDS = new Set([
  "careers",
  "career",
  "recruiting",
  "recruitment",
  "hiring",
  "jobs",
  "job",
  "talent",
  "talentacquisition",
  "official",
  "team",
  "hr",
]);

// Common job-board / careers-site TLD-like suffixes glued onto a company
// token (e.g. "amazon.jobs", "netflix.io").
const DOMAIN_SUFFIX_RE = /\.(com|jobs|io|co|in|careers|net|org)$/i;

function stripPunctuation(input: string): string {
  return input
    .replace(DOMAIN_SUFFIX_RE, "")
    .replace(/[.,'’]/g, "")
    .replace(/[^a-zA-Z0-9&]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function titleCaseWord(word: string): string {
  if (word.length === 0) return word;
  // Preserve short all-caps tokens that are plausibly acronyms (e.g. "IBM").
  if (word.length <= 4 && word === word.toUpperCase() && /[A-Z]/.test(word)) return word;
  return word[0].toUpperCase() + word.slice(1).toLowerCase();
}

/**
 * Normalizes a raw company string into a canonical display name + matching
 * key. Never returns an empty canonicalName for non-empty input — falls back
 * to a best-effort title-cased cleanup when no rule strips anything useful.
 */
export function normalizeCompanyName(raw: string): NormalizedCompany {
  const original = raw ?? "";
  const cleaned = stripPunctuation(original.toLowerCase());

  if (!cleaned) {
    return { original, canonicalName: "", key: "" };
  }

  const alias = COMPANY_ALIASES[cleaned];
  if (alias) {
    return { original, canonicalName: alias, key: alias.toLowerCase() };
  }

  let tokens = cleaned.split(" ");

  // Strip trailing legal suffixes (possibly more than one, e.g. "pvt ltd").
  while (tokens.length > 1 && LEGAL_SUFFIXES.has(tokens[tokens.length - 1])) {
    tokens = tokens.slice(0, -1);
  }
  // Strip trailing noise words (careers-site framing), but never down to nothing.
  while (tokens.length > 1 && NOISE_WORDS.has(tokens[tokens.length - 1])) {
    tokens = tokens.slice(0, -1);
  }

  const canonicalName = tokens.map(titleCaseWord).join(" ");
  return { original, canonicalName, key: canonicalName.toLowerCase() };
}

/**
 * ── Module 11C-1 ──
 *
 * Mirrors the SQL `normalize_company_name()` helper EXACTLY (see
 * supabase/migrations/20260722000001_module4a_hierarchical_dedup.sql): lowercase,
 * drop `.` and `,`, collapse whitespace, then strip ONE trailing legal suffix.
 *
 * Deliberately NOT `normalizeCompanyName` above, which additionally applies a
 * curated alias table and noise-word stripping. This one exists for the single
 * case where a caller must write `global_jobs.normalized_company` directly and
 * has to produce the same value the database's own ingest path would — that
 * column is the cross-platform dedup grouping key `find_cross_platform_match`
 * reads, so a value computed by the richer normalizer would silently disagree
 * with every row written through the RPC.
 *
 * Same relationship, and same reason, as `normalizeLocationText` in
 * ./location.ts.
 */
export function sqlNormalizeCompanyName(input: string | null | undefined): string {
  return (input ?? "")
    .toLowerCase()
    .replace(/[.,]/g, "")
    .replace(/\s+/g, " ")
    .replace(/\s+(inc|llc|ltd|limited|corp|corporation|co|gmbh|plc|pvt ltd|private limited)$/, "")
    .trim();
}
