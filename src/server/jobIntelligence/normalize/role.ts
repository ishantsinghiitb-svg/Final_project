// ── Module 10A: Role/title normalization ──
//
// Applies ONE consistent pipeline (synonym mapping → noise-word removal →
// casing) to every raw job title so equivalent surface variants converge
// ("Product Internship" and "Product Intern" both normalize to
// "Product Intern") while genuinely different titles stay distinct but still
// canonically cased ("Product Management Intern" → "Product Management
// Intern"). The ORIGINAL string is always preserved separately — see
// NormalizedRole.original — normalization never overwrites source data.
//
// This is intentionally decoupled from the SQL `normalize_role_text()`
// helper (lowercase + whitespace collapse only, used for dedup matching) —
// that one stays conservative for merge decisions; this one is the richer,
// display/search-oriented canonicalization.

export type NormalizedRole = {
  /** Verbatim input, never mutated. */
  original: string;
  /** Canonical, consistently-cased/synonym-mapped display title. */
  normalized: string;
  /** Lowercase, deduplicated significant tokens — used for search indexing/matching. */
  tokens: string[];
};

// Word-level synonym mapping, applied to each token independently so it
// composes regardless of position ("Internship" as a whole word or trailing
// suffix both hit "product internship" → "product intern").
const SYNONYMS: Record<string, string> = {
  internship: "intern",
  interns: "intern",
  internships: "intern",
  trainee: "intern",
  jr: "junior",
  sr: "senior",
  eng: "engineer",
  engg: "engineering",
  mgr: "manager",
  mgmt: "management",
  dev: "developer",
  swe: "engineer",
};

const NOISE_WORDS = new Set([
  "the",
  "a",
  "an",
  "position",
  "role",
  "opportunity",
  "opening",
  "job",
  "vacancy",
  "wanted",
  "hiring",
]);

function titleCaseWord(word: string): string {
  if (word.length === 0) return word;
  if (word.length <= 4 && word === word.toUpperCase() && /[A-Z]/.test(word)) return word;
  return word[0].toUpperCase() + word.slice(1).toLowerCase();
}

/** Splits on whitespace and common separators (/, -, comma), keeping hyphenated compounds intact where meaningful. */
function tokenize(input: string): string[] {
  return input
    .replace(/[()]/g, " ")
    .split(/[\s/,|]+/)
    .map((t) => t.trim())
    .filter(Boolean);
}

export function normalizeRoleTitle(raw: string): NormalizedRole {
  const original = raw ?? "";
  const rawTokens = tokenize(original);

  const mapped: string[] = [];
  for (const token of rawTokens) {
    const lower = token.toLowerCase().replace(/[^a-z0-9-]/g, "");
    if (!lower) continue;
    if (NOISE_WORDS.has(lower)) continue;
    mapped.push(SYNONYMS[lower] ?? lower);
  }

  // Collapse immediate consecutive duplicates ("Senior Senior Engineer" from
  // synonym collisions like "Sr Senior Engineer").
  const deduped: string[] = [];
  for (const t of mapped) {
    if (deduped[deduped.length - 1] !== t) deduped.push(t);
  }

  const normalized = deduped.map(titleCaseWord).join(" ");
  const tokens = [...new Set(deduped)];

  return { original, normalized: normalized || original.trim(), tokens };
}
