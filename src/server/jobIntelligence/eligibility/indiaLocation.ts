// ── India-only job eligibility ──
//
// OfferLyst's catalog is India-only. This is the ONE place that decides whether
// a posting's location makes it eligible; every adapter routes through it (see
// ./jobEligibility.ts and ../crawl/eligibility/EligibilityFilteringJobParser.ts)
// so no platform can drift into its own slightly-different string checks.
//
// The governing rule is REJECT-BY-DEFAULT: a posting is eligible only when its
// own location evidence positively names India. Absence of evidence is not
// evidence of India — "Remote", "Worldwide", "Multiple Locations" and an empty
// location are all rejected. The company's headquarters is deliberately NOT an
// input: a Bengaluru-headquartered employer posting a New York role is a New
// York role.
//
// Two-sided classification, because one-sided matching is what makes naive
// filters wrong:
//   • an INDIA signal (city, state/UT, country, or the word "India")
//   • a FOREIGN signal (another country, a foreign city, a US/CA/AU state, or a
//     multi-country region like APAC/EMEA)
// A location carrying BOTH ("Mumbai / New York", "India / US") is ambiguous
// about where the role can actually be filled, so it is rejected — the spec
// lists exactly those as cases not to blindly accept. Rejecting a genuine
// India+elsewhere role is a cost we accept; showing an India-only audience a
// role they cannot take is not.
//
// Homonyms are handled by the same two-sided rule rather than by a special
// case: "Hyderabad" is an India signal, but "Hyderabad, Pakistan" also carries
// a foreign country signal and is rejected; "Salem, Oregon" is rejected by the
// US-state list even though Salem is also in Tamil Nadu.
//
// The India-side lists, and (as of 2026-09-14) the foreign-side lists, are
// both imported from features/jobs/indiaPlaces.ts rather than defined here,
// because the Jobs-page display filter needs the exact same gazetteers to
// apply the same two-sided rule this module has always used — see that
// file's header for the substring-collision bug this relocation fixed there.
// One set of lists, two enforcement points.

import {
  FOREIGN_CITIES,
  FOREIGN_COUNTRIES,
  FOREIGN_SUBDIVISIONS,
  GLOBAL_SCOPE_TOKENS,
  INDIA_CITIES,
  INDIA_COUNTRY_TOKENS,
  INDIA_PLACE_NAMES,
  INDIA_STATES,
} from "@/features/jobs/indiaPlaces";

/** Words that carry no location evidence at all — neither India nor foreign. */
const NEUTRAL_TOKENS = new Set([
  "remote",
  "hybrid",
  "onsite",
  "on-site",
  "on site",
  "in office",
  "in-office",
  "work from home",
  "wfh",
  "work from anywhere",
  "flexible",
  "multiple locations",
  "multiple location",
  "various locations",
  "various",
  "other",
  "n/a",
  "na",
  "tbd",
  "office",
  "hq",
  "headquarters",
  "full time",
  "full-time",
  "part time",
  "part-time",
  "contract",
  "internship",
  "intern",
  "permanent",
  "temporary",
]);

const INDIA_STATE_SET = new Set<string>(INDIA_STATES);
const INDIA_CITY_SET = new Set<string>(INDIA_CITIES);
const INDIA_COUNTRY_SET = new Set<string>(INDIA_COUNTRY_TOKENS);
const FOREIGN_COUNTRY_SET = new Set<string>(FOREIGN_COUNTRIES);
const FOREIGN_CITY_SET = new Set<string>(FOREIGN_CITIES);
const FOREIGN_SUBDIVISION_SET = new Set<string>(FOREIGN_SUBDIVISIONS);
const GLOBAL_SCOPE_SET = new Set<string>(GLOBAL_SCOPE_TOKENS);

/** Re-exported so callers of this module need not know where the gazetteer lives. */
export { INDIA_PLACE_NAMES };

export type LocationEvidence = {
  /** Free-text location as the source gave it ("Bengaluru, Karnataka, India"). */
  location?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  /** Extra strings that may carry location words (e.g. secondary locations, tags). */
  extras?: Array<string | null | undefined> | null;
};

export type IndiaLocationDecision =
  { eligible: true; reason: string; matched: string } | { eligible: false; reason: string };

/**
 * Lowercase, strip diacritics, collapse spaces.
 *
 * The diacritic strip is load-bearing, not cosmetic: Ashby emits
 * `addressRegion: "Tamil Nādu"` with a combining macron (U+0101), which would
 * never equal the gazetteer's "tamil nadu" without NFKD + mark removal.
 */
function normalizeToken(raw: string): string {
  return (
    raw
      .normalize("NFKD")
      // U+0300-U+036F is the combining-diacritical block, written as escapes so
      // the source stays ASCII and no editor can silently mangle it.
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[()[\]{}"'’`]/g, " ")
      .replace(/[.]/g, ".")
      .replace(/\s+/g, " ")
      .trim()
  );
}

/**
 * Splits a location string into comparable tokens. Splits on the separators
 * sources actually use between distinct places — comma, slash, pipe, semicolon,
 * bullet, " - ", " and ", " or ", " & ". A bare hyphen inside a word
 * ("Bengaluru-VTP", "on-site") is NOT a separator, so hyphenated place names
 * survive intact and are additionally split for a second look.
 */
export function splitLocationTokens(raw: string): string[] {
  const normalized = normalizeToken(raw);
  if (!normalized) return [];

  const pieces = normalized
    .split(/\s*(?:,|\/|\||;|•|·|•|\s-\s|\s–\s|\s—\s|\band\b|\bor\b|&|\+)\s*/g)
    .map((piece) => piece.trim())
    .filter(Boolean);

  const tokens = new Set<string>();
  for (const piece of pieces) {
    tokens.add(piece);
    // "bengaluru-vtp" → also consider "bengaluru" and "vtp"; "remote india" →
    // "remote", "india". Sub-words are additive evidence, never a replacement.
    for (const word of piece.split(/[-\s]+/).filter(Boolean)) tokens.add(word);
    // Two-word phrases ("new delhi", "tamil nadu") inside a longer piece.
    const words = piece.split(/\s+/).filter(Boolean);
    for (let i = 0; i + 1 < words.length; i++) tokens.add(`${words[i]} ${words[i + 1]}`);
    for (let i = 0; i + 2 < words.length; i++) {
      tokens.add(`${words[i]} ${words[i + 1]} ${words[i + 2]}`);
    }
  }
  return [...tokens];
}

type TokenClass = "india" | "foreign" | "neutral" | "unknown";

function classifyToken(token: string): TokenClass {
  if (!token) return "neutral";
  if (NEUTRAL_TOKENS.has(token)) return "neutral";

  // Foreign subdivisions are checked BEFORE India cities so "Salem, Oregon" and
  // "Austin, IN"-style collisions resolve as foreign rather than Indian.
  if (FOREIGN_SUBDIVISION_SET.has(token)) {
    // "in" is the India ISO code, never a foreign subdivision; "wa"/"sa"/"vic"
    // are genuinely ambiguous but only ever appear beside a foreign city or
    // country in practice, so the whole-token match stands.
    if (token === "in") return "india";
    return "foreign";
  }
  if (GLOBAL_SCOPE_SET.has(token)) return "foreign";
  if (FOREIGN_COUNTRY_SET.has(token)) return "foreign";
  if (FOREIGN_CITY_SET.has(token)) return "foreign";

  if (INDIA_COUNTRY_SET.has(token)) return "india";
  if (INDIA_STATE_SET.has(token)) return "india";
  if (INDIA_CITY_SET.has(token)) return "india";

  return "unknown";
}

/**
 * Whether a posting's location makes it eligible for an India-only catalog.
 *
 * Eligible only when at least one India signal is present AND no foreign signal
 * is. Everything else — no evidence, foreign evidence, or both at once — is
 * rejected, with a reason the crawl report prints verbatim.
 */
export function isIndiaJobLocation(evidence: LocationEvidence): IndiaLocationDecision {
  const fields = [
    evidence.location,
    evidence.city,
    evidence.state,
    evidence.country,
    ...(evidence.extras ?? []),
  ]
    .map((value) => (typeof value === "string" ? value : ""))
    .filter((value) => value.trim().length > 0);

  if (fields.length === 0) {
    return { eligible: false, reason: "No location information on the posting." };
  }

  const indiaMatches: string[] = [];
  const foreignMatches: string[] = [];

  for (const field of fields) {
    for (const token of splitLocationTokens(field)) {
      const kind = classifyToken(token);
      if (kind === "india") indiaMatches.push(token);
      else if (kind === "foreign") foreignMatches.push(token);
    }
  }

  if (foreignMatches.length > 0 && indiaMatches.length > 0) {
    return {
      eligible: false,
      reason:
        `Location names both India (${unique(indiaMatches).slice(0, 3).join(", ")}) and ` +
        `non-India (${unique(foreignMatches).slice(0, 3).join(", ")}) — India eligibility is not established.`,
    };
  }

  if (foreignMatches.length > 0) {
    return {
      eligible: false,
      reason: `Location is outside India (${unique(foreignMatches).slice(0, 3).join(", ")}).`,
    };
  }

  if (indiaMatches.length === 0) {
    return {
      eligible: false,
      reason: `Location "${fields.join(" | ").slice(0, 120)}" does not name an India location.`,
    };
  }

  return {
    eligible: true,
    reason: `India location recognised (${unique(indiaMatches).slice(0, 3).join(", ")}).`,
    matched: unique(indiaMatches)[0],
  };
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
