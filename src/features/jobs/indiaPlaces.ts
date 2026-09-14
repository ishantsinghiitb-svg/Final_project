// ── The canonical India gazetteer ──
//
// Lives under features/ rather than server/ on purpose: BOTH sides need it and
// the dependency may only run one way. The client build blocks any import path
// containing a "server" segment, so the ingestion-time rule
// (server/jobIntelligence/eligibility/indiaLocation.ts) imports these lists
// FROM here, and the Jobs-page query builder below also uses them. One list,
// two enforcement points — the database filter and the crawler gate can never
// drift into disagreeing about what counts as India.

/** States and union territories, plus the spelling variants sources actually emit. */
export const INDIA_STATES = [
  "andhra pradesh",
  "arunachal pradesh",
  "assam",
  "bihar",
  "chhattisgarh",
  "chattisgarh",
  "goa",
  "gujarat",
  "haryana",
  "himachal pradesh",
  "jharkhand",
  "karnataka",
  "kerala",
  "madhya pradesh",
  "maharashtra",
  "manipur",
  "meghalaya",
  "mizoram",
  "nagaland",
  "odisha",
  "orissa",
  "punjab",
  "rajasthan",
  "sikkim",
  "tamil nadu",
  "tamilnadu",
  "telangana",
  "tripura",
  "uttar pradesh",
  "uttarakhand",
  "uttaranchal",
  "west bengal",
  // Union territories
  "andaman and nicobar islands",
  "andaman & nicobar islands",
  "chandigarh",
  "dadra and nagar haveli",
  "dadra and nagar haveli and daman and diu",
  "daman and diu",
  "delhi",
  "nct of delhi",
  "national capital territory of delhi",
  "jammu and kashmir",
  "jammu & kashmir",
  "ladakh",
  "lakshadweep",
  "puducherry",
  "pondicherry",
] as const;

/**
 * Indian cities. Deliberately long: a posting that says only "Kochi" carries no
 * other India evidence, and the alternative to knowing the city is rejecting a
 * legitimate job. Variants (Bengaluru/Bangalore, Gurugram/Gurgaon) are listed
 * side by side because sources use both interchangeably.
 */
export const INDIA_CITIES = [
  // Tier 1 + NCR
  "mumbai",
  "bombay",
  "navi mumbai",
  "thane",
  "kalyan",
  "vasai",
  "virar",
  "mira bhayandar",
  "delhi",
  "new delhi",
  "gurugram",
  "gurgaon",
  "noida",
  "greater noida",
  "ghaziabad",
  "faridabad",
  "sonipat",
  "manesar",
  "bengaluru",
  "bangalore",
  "bangalore urban",
  "whitefield",
  "electronic city",
  "hyderabad",
  "secunderabad",
  "cyberabad",
  "gachibowli",
  "hitec city",
  "chennai",
  "madras",
  "sriperumbudur",
  "tambaram",
  "kolkata",
  "calcutta",
  "howrah",
  "salt lake city",
  "pune",
  "pimpri",
  "chinchwad",
  "pimpri chinchwad",
  "hinjewadi",
  "ahmedabad",
  "amdavad",
  "gandhinagar",
  // Tier 2
  "jaipur",
  "lucknow",
  "kanpur",
  "nagpur",
  "indore",
  "bhopal",
  "visakhapatnam",
  "vizag",
  "patna",
  "vadodara",
  "baroda",
  "ludhiana",
  "agra",
  "nashik",
  "nasik",
  "meerut",
  "rajkot",
  "varanasi",
  "banaras",
  "benares",
  "srinagar",
  "aurangabad",
  "chhatrapati sambhajinagar",
  "dhanbad",
  "amritsar",
  "prayagraj",
  "allahabad",
  "ranchi",
  "jabalpur",
  "gwalior",
  "vijayawada",
  "jodhpur",
  "raipur",
  "kota",
  "guwahati",
  "chandigarh",
  "mysuru",
  "mysore",
  "bhubaneswar",
  "bhubaneshwar",
  "cuttack",
  "thiruvananthapuram",
  "trivandrum",
  "kochi",
  "cochin",
  "ernakulam",
  "kozhikode",
  "calicut",
  "thrissur",
  "trichur",
  "coimbatore",
  "madurai",
  "tiruchirappalli",
  "trichy",
  "salem",
  "tirupur",
  "erode",
  "vellore",
  "surat",
  "jamnagar",
  "bhavnagar",
  "junagadh",
  "anand",
  "vapi",
  "bharuch",
  "mangaluru",
  "mangalore",
  "hubli",
  "hubballi",
  "dharwad",
  "belgaum",
  "belagavi",
  "udaipur",
  "ajmer",
  "bikaner",
  "alwar",
  "bhilwara",
  "dehradun",
  "haridwar",
  "rishikesh",
  "roorkee",
  "haldwani",
  "shimla",
  "solan",
  "baddi",
  "jammu",
  "leh",
  "siliguri",
  "durgapur",
  "asansol",
  "kharagpur",
  "jamshedpur",
  "bokaro",
  "rourkela",
  "warangal",
  "karimnagar",
  "nizamabad",
  "tirupati",
  "guntur",
  "nellore",
  "kakinada",
  "rajahmundry",
  "kurnool",
  "anantapur",
  "kollam",
  "kannur",
  "alappuzha",
  "kottayam",
  "palakkad",
  "malappuram",
  "kasaragod",
  "puducherry",
  "pondicherry",
  "panaji",
  "panjim",
  "margao",
  "vasco da gama",
  "jhansi",
  "bareilly",
  "aligarh",
  "moradabad",
  "saharanpur",
  "gorakhpur",
  "ayodhya",
  "mathura",
  "firozabad",
  "muzaffarnagar",
  "udupi",
  "shimoga",
  "shivamogga",
  "davangere",
  "tumkur",
  "tumakuru",
  "hassan",
  "kolhapur",
  "sangli",
  "solapur",
  "satara",
  "ahmednagar",
  "latur",
  "nanded",
  "amravati",
  "akola",
  "jalgaon",
  "chandrapur",
  "bilaspur",
  "korba",
  "durg",
  "bhilai",
  "ujjain",
  "sagar",
  "rewa",
  "satna",
  "ratlam",
  "dewas",
  "muzaffarpur",
  "gaya",
  "bhagalpur",
  "darbhanga",
  "purnia",
  "imphal",
  "shillong",
  "aizawl",
  "kohima",
  "itanagar",
  "agartala",
  "gangtok",
  "dispur",
  "port blair",
  "kavaratti",
  "silvassa",
  "daman",
  "diu",
  "hosur",
  "thoothukudi",
  "tuticorin",
  "dindigul",
  "thanjavur",
  "nagercoil",
  "kanchipuram",
  "bidar",
  "raichur",
  "ballari",
  "bellary",
  "gulbarga",
  "kalaburagi",
] as const;

/** Words that by themselves mean "India" in a location string. */
export const INDIA_COUNTRY_TOKENS = ["india", "bharat", "republic of india", "ind", "in"] as const;

/** Every canonical India place name, de-duplicated. */
export const INDIA_PLACE_NAMES: readonly string[] = [
  ...new Set<string>([...INDIA_CITIES, ...INDIA_STATES]),
];

/**
 * Country tokens the filter matches against `global_jobs.country` — LinkedIn
 * writes "India", Lever/SmartRecruiters write ISO codes, Ashby writes whatever
 * `addressCountry` held. Matched case-insensitively (see `indiaDiscoveryFilter`),
 * so this needs exactly one entry per distinct WORD, not one per casing.
 *
 * "in" is included here because it is the sole, exact content of an ISO-code
 * `country` value ("IN"). It must NEVER be added to a free-text word-boundary
 * pattern (see `INDIA_FREE_TEXT_WORDS` below) — "in" is one of the commonest
 * words in English ("Backend Engineer in Bengaluru"), and scanning free text
 * for it as a whole word would match almost every location string that
 * exists, India or not.
 */
const COUNTRY_TOKENS = ["india", "in", "bharat"];

/**
 * Literal words that mean "India" when found as a WHOLE WORD inside a
 * free-text location string ("Remote, India", "India (Remote)"). Deliberately
 * excludes "in" — see `COUNTRY_TOKENS`'s comment.
 */
const INDIA_FREE_TEXT_WORDS = ["india", "bharat"];

// ── Foreign signal lists ──
//
// server/jobIntelligence/eligibility/indiaLocation.ts imports these FROM
// here — one canonical set of foreign-place lists shared by both enforcement
// points, not two. That module's header explains in full why a TWO-SIDED
// classification is required (an India signal is necessary but not
// sufficient; a foreign signal anywhere REJECTS the posting even alongside a
// real India signal) and gives the exact "Hyderabad, Pakistan" / "Salem,
// Oregon" homonym examples this list exists to resolve — a real Indian city
// name is not proof of an India location when another field says otherwise.
//
// ⚠️ 2026-09-14 fix: `indiaDiscoveryFilter` previously matched its India side
// with a blind substring check (`location.ilike.*india*`,
// `city.ilike.*india*`), which also matches "Indianapolis" and "Indiana" —
// neither is India; both merely CONTAIN the letters "india" as a prefix of a
// longer word. Found live: a job in Indianapolis, Indiana would have shown up
// as an India job on the public Jobs page. Fixed two ways together, mirroring
// `isIndiaJobLocation`'s own two-sided intent instead of a one-off patch:
//   1. The free-text India check is now WORD-BOUNDARY anchored
//      (`\y(india|bharat)\y`, see `INDIA_FREE_TEXT_WORDS`), so "Indianapolis"
//      no longer satisfies it — this alone fixes every "Indianapolis"/
//      "Indiana" variant, since none of them carry an India signal anymore.
//   2. A genuine India signal is no longer sufficient by itself: the filter
//      now also rejects a row that carries a FOREIGN signal in ANY field,
//      which is what "Hyderabad, Pakistan" and "Salem, Oregon" need — their
//      city genuinely matches a real Indian city, so word-boundary fixing
//      alone would not have hidden them.
export const FOREIGN_COUNTRIES = [
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
export const FOREIGN_CITIES = [
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
export const FOREIGN_SUBDIVISIONS = [
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
  "sa",
  "tas",
] as const;

/**
 * Multi-country / unbounded scopes. Present in a location string, these mean
 * "not specifically India" — even beside an India token they cannot establish
 * that an India-based candidate is eligible, so they are treated as foreign.
 */
export const GLOBAL_SCOPE_TOKENS = [
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

/** PostgREST `or=` values must be quoted when they contain spaces, commas, or parentheses. */
function quote(value: string): string {
  return `"${value.replace(/"/g, '\\"')}"`;
}

/** Escapes a literal string for safe use inside a POSIX regex alternation. */
function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * An anchored, case-insensitive-by-caller regex alternation matching any one
 * of `values` exactly (not a substring) — e.g. `^(bengaluru|mumbai)$`.
 * Exported so tests can exercise the exact pattern the live filter uses,
 * without needing a database.
 */
export function exactMatchAlternation(values: readonly string[]): string {
  return `^(${values.map(escapeRegex).join("|")})$`;
}

/**
 * A case-insensitive-by-caller regex alternation matching any one of `values`
 * as a WHOLE WORD anywhere in a longer string — e.g. `\y(india|bharat)\y`
 * matches "Remote, India" but not "Indianapolis" (Postgres's `\y` is a word
 * boundary, the ARE — advanced regular expression — equivalent of `\b`).
 * This is the substring-collision fix: unlike a plain `ilike '*india*'`
 * check, "india" only matches here when it starts and ends on a word
 * boundary, which "Indianapolis" and "Indiana" never do (the letters
 * immediately following "india" in both are ordinary word characters, not a
 * boundary).
 */
export function wordBoundaryAlternation(values: readonly string[]): string {
  return `\\y(${values.map(escapeRegex).join("|")})\\y`;
}

/**
 * The JavaScript-native equivalent of `wordBoundaryAlternation`, used only by
 * `matchesIndiaDiscoveryFilter` (the in-process mirror) and its tests.
 *
 * ⚠️ `\y` is Postgres ARE syntax and Postgres-only — JavaScript's `RegExp` does
 * not recognize it at all (an unrecognized escape like `\y` is treated as a
 * literal "y", which silently matches nothing useful and nothing harmful,
 * rather than throwing — exactly the kind of bug that passes review by
 * looking reasonable). JavaScript's own word-boundary escape is `\b`. The two
 * engines are deliberately given their own boundary SYNTAX here rather than
 * forcing one pattern string to serve both — but the WORD LISTS
 * (`INDIA_FREE_TEXT_WORDS`, `FOREIGN_COUNTRIES` ∪ `FOREIGN_CITIES` ∪
 * `FOREIGN_SUBDIVISIONS` ∪ `GLOBAL_SCOPE_TOKENS`) are still the single source
 * of truth passed into both builders — only the two-character boundary
 * marker differs.
 */
function jsWordBoundaryRegex(values: readonly string[]): RegExp {
  return new RegExp(`\\b(${values.map(escapeRegex).join("|")})\\b`, "i");
}

/** The regex `indiaDiscoveryFilter` matches `city`/`state` against for an EXACT India match — see its docs. */
export function indiaCityPattern(): string {
  return exactMatchAlternation(INDIA_CITIES);
}

export function indiaStatePattern(): string {
  return exactMatchAlternation(INDIA_STATES);
}

/** Word-boundary "India"/"Bharat" pattern for a free-text field (`location`, or a compound `city` value like "Bengaluru, India"). */
export function indiaFreeTextPattern(): string {
  return wordBoundaryAlternation(INDIA_FREE_TEXT_WORDS);
}

/** The exact-match pattern `country` is rejected against — any of the foreign country names/codes. */
export function foreignCountryPattern(): string {
  return exactMatchAlternation(FOREIGN_COUNTRIES);
}

/** The exact-match pattern `city` is rejected against — any of the foreign cities. */
export function foreignCityPattern(): string {
  return exactMatchAlternation(FOREIGN_CITIES);
}

/** The exact-match pattern `state` is rejected against — a foreign state/province/territory, or a global/multi-country scope. */
export function foreignSubdivisionPattern(): string {
  return exactMatchAlternation([...FOREIGN_SUBDIVISIONS, ...GLOBAL_SCOPE_TOKENS]);
}

/**
 * The word-boundary pattern `location` (free text) is rejected against — any
 * foreign country, city, subdivision, or global/multi-country scope appearing
 * as a whole word/phrase anywhere in the string. This is what catches a
 * compound value with no separate structured fields, e.g. a single
 * `location = "Mumbai, New York"` or `location = "India / US"` string: the
 * India side matches ("Mumbai" is a real city, "India" is a real word), but
 * this foreign check also matches ("New York" / "US"), and the row is
 * rejected — exactly the ambiguous-mix rule `isIndiaJobLocation` applies.
 */
export function foreignFreeTextPattern(): string {
  return wordBoundaryAlternation([
    ...FOREIGN_COUNTRIES,
    ...FOREIGN_CITIES,
    ...FOREIGN_SUBDIVISIONS,
    ...GLOBAL_SCOPE_TOKENS,
  ]);
}

/**
 * The Jobs-page India SIGNAL predicate, as a PostgREST `.or()` argument.
 *
 * This is one half of the two-sided rule — "does this row name India
 * anywhere" — not the whole rule. It must always be combined with
 * `foreignLocationExclusions()` (see below); a caller that applies this
 * alone re-introduces the "Hyderabad, Pakistan" / "Salem, Oregon" class of
 * false positive this module's header documents. `JobRepository`'s
 * `applyDiscoveryVisibility` is the one caller and applies both together.
 *
 * Defence in depth, not the primary control: the crawler already refuses
 * non-India postings at ingestion (server/jobIntelligence/eligibility). This
 * exists so a malformed or legacy row that predates that gate — or one written
 * by the extension path, which has no such gate — still cannot surface on the
 * public Jobs page.
 *
 * ⚠️ `city`/`state` are matched with `imatch` (Postgres `~*`, a case-INsensitive
 * anchored regex) rather than `in.()`. `in.()` performs an exact, CASE-SENSITIVE
 * string comparison — real rows overwhelmingly store Title Case ("Bengaluru",
 * "Uttar Pradesh") while this module's gazetteer is lowercase, so `in.()`
 * silently matched almost nothing (found live in production 2026-09-13: 19 of
 * 318 valid India jobs were invisible on the Jobs page for exactly this
 * reason). `imatch` performs the same EXACT-match semantics (anchored with
 * `^...$`, so "Bengaluru" matches but "Bengaluru Rural District" does not)
 * while being case-insensitive by construction.
 */
export function indiaDiscoveryFilter(): string {
  const clauses: string[] = [
    `country.imatch.${quote(exactMatchAlternation(COUNTRY_TOKENS))}`,
    `location.imatch.${quote(indiaFreeTextPattern())}`,
    `city.imatch.${quote(indiaFreeTextPattern())}`,
    `city.imatch.${quote(indiaCityPattern())}`,
    `state.imatch.${quote(indiaStatePattern())}`,
  ];
  return clauses.join(",");
}

/**
 * The foreign-signal HALF of the two-sided rule: one NULL-SAFE PostgREST
 * `.or()` clause per column, each meant to be applied as its own separate
 * `.or()` call alongside `indiaDiscoveryFilter()`'s OR-group — exactly the
 * same "chain several `.or()` calls, PostgREST ANDs them together" idiom
 * `applyDiscoveryVisibility` already uses for `expiry_date`/`last_seen_at`.
 * De Morgan's law means "reject if ANY foreign signal is present" is just
 * every exclusion ANDed together, which is what chaining these clauses does.
 *
 * ⚠️ Each clause is `column.is.null,column.not.imatch."PATTERN"` — NOT a bare
 * `.not(column, "imatch", pattern)`. This is load-bearing, found live:
 * `NOT (city ~* pattern)` evaluates to SQL NULL (not TRUE) when `city IS
 * NULL`, and a `WHERE`/PostgREST filter only keeps rows where the condition
 * is TRUE — so a bare negated `imatch` silently drops every row with a NULL
 * value in ANY of country/city/state/location, foreign or not. Verified
 * live against production (2026-09-14): the bare-`.not()` version dropped
 * 118 of 319 genuine India rows (Mumbai, Bengaluru, Hyderabad, "Work from
 * home" with country=India, …) purely because they had a NULL in some other
 * column, not because anything foreign was found. The `column.is.null` half
 * of each clause is what makes "no value" mean "no foreign evidence from
 * this column" rather than "reject" — the same "unknown is not evidence"
 * rule the rest of this file and `isIndiaJobLocation` both already apply.
 */
export function foreignLocationExclusions(): readonly string[] {
  return [
    `country.is.null,country.not.imatch.${quote(foreignCountryPattern())}`,
    `city.is.null,city.not.imatch.${quote(foreignCityPattern())}`,
    `state.is.null,state.not.imatch.${quote(foreignSubdivisionPattern())}`,
    `location.is.null,location.not.imatch.${quote(foreignFreeTextPattern())}`,
  ];
}

/**
 * A pure, in-process mirror of the FULL two-sided rule
 * (`indiaDiscoveryFilter()` AND NOT each of `foreignLocationExclusions()`),
 * evaluated directly against a row's fields instead of building a query
 * string. Exists so the actual Jobs-page discovery behaviour can be unit
 * tested without a live database — see indiaPlaces.test.ts — and to give
 * any other caller that already has a row in hand (rather than a query to
 * build) a one-call answer. Must stay behaviourally identical to what the
 * two exported filter pieces above produce in Postgres; the test suite
 * checks both surfaces against the same case list for exactly this reason.
 */
const INDIA_FREE_TEXT_JS_PATTERN = jsWordBoundaryRegex(INDIA_FREE_TEXT_WORDS);
const FOREIGN_FREE_TEXT_JS_PATTERN = jsWordBoundaryRegex([
  ...FOREIGN_COUNTRIES,
  ...FOREIGN_CITIES,
  ...FOREIGN_SUBDIVISIONS,
  ...GLOBAL_SCOPE_TOKENS,
]);

export function matchesIndiaDiscoveryFilter(fields: {
  country?: string | null;
  location?: string | null;
  city?: string | null;
  state?: string | null;
}): boolean {
  const country = fields.country ?? "";
  const location = fields.location ?? "";
  const city = fields.city ?? "";
  const state = fields.state ?? "";

  // The exact-match (`^...$`) patterns below behave identically whether run
  // through JavaScript's RegExp or Postgres's `~*` — case-insensitive
  // anchored matching is not dialect-specific. Only the free-text word-
  // boundary checks are (see `jsWordBoundaryRegex`'s docs), so those two use
  // the JS-flavored patterns instead of the Postgres-flavored ones the real
  // query sends.
  const indiaSignal =
    new RegExp(exactMatchAlternation(COUNTRY_TOKENS), "i").test(country) ||
    INDIA_FREE_TEXT_JS_PATTERN.test(location) ||
    INDIA_FREE_TEXT_JS_PATTERN.test(city) ||
    new RegExp(indiaCityPattern(), "i").test(city) ||
    new RegExp(indiaStatePattern(), "i").test(state);

  if (!indiaSignal) return false;

  const foreignSignal =
    new RegExp(foreignCountryPattern(), "i").test(country) ||
    new RegExp(foreignCityPattern(), "i").test(city) ||
    new RegExp(foreignSubdivisionPattern(), "i").test(state) ||
    FOREIGN_FREE_TEXT_JS_PATTERN.test(location);

  return !foreignSignal;
}
