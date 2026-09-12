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
// The India-side lists are imported from features/jobs/indiaPlaces.ts rather
// than defined here, because the Jobs-page query needs the same gazetteer and
// the client build cannot import from server/. One list, two enforcement
// points — see that file's header.

import {
  INDIA_CITIES,
  INDIA_COUNTRY_TOKENS,
  INDIA_PLACE_NAMES,
  INDIA_STATES,
} from "@/features/jobs/indiaPlaces";

/**
 * Non-India countries and demonyms. `in`/`ind` are absent here for obvious
 * reasons; two-letter codes are matched only as a WHOLE token so "IN" in
 * "Bengaluru, IN" resolves as India while "Austin, IN" (Indiana) is handled by
 * the US-state list below taking precedence as a foreign signal.
 */
const FOREIGN_COUNTRIES = [
  "united states",
  "united states of america",
  "usa",
  "u.s.",
  "u.s.a.",
  "us",
  "america",
  "canada",
  "ca",
  "can",
  "mexico",
  "united kingdom",
  "uk",
  "u.k.",
  "great britain",
  "britain",
  "england",
  "scotland",
  "wales",
  "northern ireland",
  "ireland",
  "eire",
  "germany",
  "deutschland",
  "france",
  "spain",
  "portugal",
  "italy",
  "netherlands",
  "holland",
  "belgium",
  "luxembourg",
  "switzerland",
  "austria",
  "poland",
  "czech republic",
  "czechia",
  "slovakia",
  "hungary",
  "romania",
  "bulgaria",
  "greece",
  "croatia",
  "serbia",
  "slovenia",
  "denmark",
  "sweden",
  "norway",
  "finland",
  "iceland",
  "estonia",
  "latvia",
  "lithuania",
  "ukraine",
  "russia",
  "belarus",
  "turkey",
  "cyprus",
  "malta",
  "china",
  "hong kong",
  "macau",
  "taiwan",
  "japan",
  "south korea",
  "korea",
  "north korea",
  "singapore",
  "malaysia",
  "indonesia",
  "thailand",
  "vietnam",
  "philippines",
  "cambodia",
  "laos",
  "myanmar",
  "burma",
  "brunei",
  "pakistan",
  "bangladesh",
  "sri lanka",
  "nepal",
  "bhutan",
  "maldives",
  "afghanistan",
  "australia",
  "new zealand",
  "fiji",
  "papua new guinea",
  "united arab emirates",
  "uae",
  "dubai",
  "abu dhabi",
  "sharjah",
  "saudi arabia",
  "ksa",
  "qatar",
  "kuwait",
  "bahrain",
  "oman",
  "jordan",
  "lebanon",
  "israel",
  "palestine",
  "iraq",
  "iran",
  "syria",
  "yemen",
  "egypt",
  "morocco",
  "tunisia",
  "algeria",
  "libya",
  "sudan",
  "south africa",
  "nigeria",
  "kenya",
  "ghana",
  "ethiopia",
  "tanzania",
  "uganda",
  "rwanda",
  "zimbabwe",
  "zambia",
  "botswana",
  "namibia",
  "senegal",
  "ivory coast",
  "cote d'ivoire",
  "brazil",
  "argentina",
  "chile",
  "colombia",
  "peru",
  "venezuela",
  "ecuador",
  "uruguay",
  "paraguay",
  "bolivia",
  "costa rica",
  "panama",
  "guatemala",
  "honduras",
  "el salvador",
  "nicaragua",
  "cuba",
  "dominican republic",
  "puerto rico",
  "jamaica",
  "trinidad and tobago",
  "kazakhstan",
  "uzbekistan",
  "azerbaijan",
  "armenia",
  "georgia",
  "mongolia",
] as const;

/** Foreign cities common in job postings — catches "New York" with no country given. */
const FOREIGN_CITIES = [
  "new york",
  "nyc",
  "new york city",
  "brooklyn",
  "manhattan",
  "san francisco",
  "sf",
  "bay area",
  "silicon valley",
  "palo alto",
  "mountain view",
  "sunnyvale",
  "santa clara",
  "san jose",
  "san mateo",
  "redwood city",
  "menlo park",
  "cupertino",
  "oakland",
  "berkeley",
  "los angeles",
  "la",
  "san diego",
  "sacramento",
  "seattle",
  "bellevue",
  "redmond",
  "portland",
  "denver",
  "boulder",
  "austin",
  "dallas",
  "houston",
  "san antonio",
  "chicago",
  "boston",
  "cambridge",
  "atlanta",
  "miami",
  "orlando",
  "tampa",
  "philadelphia",
  "pittsburgh",
  "detroit",
  "minneapolis",
  "phoenix",
  "scottsdale",
  "las vegas",
  "salt lake city",
  "nashville",
  "charlotte",
  "raleigh",
  "durham",
  "washington dc",
  "washington d.c.",
  "arlington",
  "baltimore",
  "newark",
  "jersey city",
  "toronto",
  "vancouver",
  "montreal",
  "ottawa",
  "calgary",
  "edmonton",
  "waterloo",
  "london",
  "manchester",
  "birmingham",
  "leeds",
  "glasgow",
  "edinburgh",
  "bristol",
  "cambridge uk",
  "oxford",
  "dublin",
  "belfast",
  "berlin",
  "munich",
  "münchen",
  "hamburg",
  "frankfurt",
  "cologne",
  "köln",
  "stuttgart",
  "paris",
  "lyon",
  "marseille",
  "toulouse",
  "madrid",
  "barcelona",
  "valencia",
  "lisbon",
  "porto",
  "rome",
  "milan",
  "milano",
  "turin",
  "naples",
  "amsterdam",
  "rotterdam",
  "utrecht",
  "brussels",
  "antwerp",
  "zurich",
  "zürich",
  "geneva",
  "basel",
  "vienna",
  "prague",
  "warsaw",
  "krakow",
  "kraków",
  "budapest",
  "bucharest",
  "sofia",
  "athens",
  "copenhagen",
  "stockholm",
  "oslo",
  "helsinki",
  "tallinn",
  "riga",
  "vilnius",
  "kyiv",
  "kiev",
  "moscow",
  "saint petersburg",
  "istanbul",
  "ankara",
  "beijing",
  "shanghai",
  "shenzhen",
  "guangzhou",
  "hangzhou",
  "chengdu",
  "tokyo",
  "osaka",
  "kyoto",
  "yokohama",
  "seoul",
  "busan",
  "taipei",
  "kuala lumpur",
  "jakarta",
  "bangkok",
  "hanoi",
  "ho chi minh city",
  "saigon",
  "manila",
  "cebu",
  "phnom penh",
  "sydney",
  "melbourne",
  "brisbane",
  "perth",
  "adelaide",
  "canberra",
  "auckland",
  "wellington",
  "christchurch",
  "tel aviv",
  "jerusalem",
  "haifa",
  "cairo",
  "casablanca",
  "nairobi",
  "lagos",
  "accra",
  "johannesburg",
  "cape town",
  "durban",
  "pretoria",
  "sao paulo",
  "são paulo",
  "rio de janeiro",
  "buenos aires",
  "santiago",
  "bogota",
  "bogotá",
  "lima",
  "mexico city",
  "guadalajara",
  "monterrey",
  "riyadh",
  "jeddah",
  "dammam",
  "doha",
  "manama",
  "muscat",
  "amman",
  "beirut",
] as const;

/** US / Canadian / Australian state-province names and codes — a strong foreign signal. */
const FOREIGN_SUBDIVISIONS = [
  "alabama",
  "alaska",
  "arizona",
  "arkansas",
  "california",
  "colorado",
  "connecticut",
  "delaware",
  "florida",
  "georgia",
  "hawaii",
  "idaho",
  "illinois",
  "indiana",
  "iowa",
  "kansas",
  "kentucky",
  "louisiana",
  "maine",
  "maryland",
  "massachusetts",
  "michigan",
  "minnesota",
  "mississippi",
  "missouri",
  "montana",
  "nebraska",
  "nevada",
  "new hampshire",
  "new jersey",
  "new mexico",
  "north carolina",
  "north dakota",
  "ohio",
  "oklahoma",
  "oregon",
  "pennsylvania",
  "rhode island",
  "south carolina",
  "south dakota",
  "tennessee",
  "texas",
  "utah",
  "vermont",
  "virginia",
  "washington",
  "west virginia",
  "wisconsin",
  "wyoming",
  "district of columbia",
  "ontario",
  "quebec",
  "québec",
  "british columbia",
  "alberta",
  "manitoba",
  "saskatchewan",
  "nova scotia",
  "new brunswick",
  "newfoundland",
  "new south wales",
  "victoria",
  "queensland",
  "western australia",
  "south australia",
  "tasmania",
  // Two-letter codes matched as whole tokens only.
  "al",
  "ak",
  "az",
  "ar",
  "co",
  "ct",
  "de",
  "fl",
  "ga",
  "hi",
  "id",
  "il",
  "ia",
  "ks",
  "ky",
  "me",
  "md",
  "ma",
  "mi",
  "mn",
  "ms",
  "mo",
  "mt",
  "ne",
  "nv",
  "nh",
  "nj",
  "nm",
  "ny",
  "nc",
  "nd",
  "oh",
  "ok",
  "or",
  "pa",
  "ri",
  "sc",
  "sd",
  "tn",
  "tx",
  "ut",
  "vt",
  "va",
  "wa",
  "wv",
  "wi",
  "wy",
  "dc",
  "on",
  "qc",
  "bc",
  "ab",
  "mb",
  "sk",
  "ns",
  "nb",
  "nl",
  "nsw",
  "qld",
  "vic",
  "wa",
  "sa",
  "tas",
] as const;

/**
 * Multi-country / unbounded scopes. Present in a location string, these mean
 * "not specifically India" — even beside an India token they cannot establish
 * that an India-based candidate is eligible, so they are treated as foreign.
 */
const GLOBAL_SCOPE_TOKENS = [
  "worldwide",
  "world wide",
  "global",
  "globally",
  "anywhere",
  "anywhere in the world",
  "international",
  "multiple countries",
  "any location",
  "apac",
  "asia pacific",
  "asia-pacific",
  "emea",
  "amer",
  "americas",
  "latam",
  "latin america",
  "north america",
  "south america",
  "europe",
  "european union",
  "eu",
  "middle east",
  "africa",
  "asia",
  "oceania",
  "nordics",
  "benelux",
  "dach",
  "mena",
  "us/canada",
  "us & canada",
  "eu/uk",
] as const;

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
