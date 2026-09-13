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
 */
const COUNTRY_TOKENS = ["india", "in", "bharat"];

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

/** The regex `indiaDiscoveryFilter` matches `city` against — see its docs. */
export function indiaCityPattern(): string {
  return exactMatchAlternation(INDIA_CITIES);
}

/** The regex `indiaDiscoveryFilter` matches `state` against — see its docs. */
export function indiaStatePattern(): string {
  return exactMatchAlternation(INDIA_STATES);
}

/**
 * The Jobs-page India predicate, as a PostgREST `.or()` argument.
 *
 * Defence in depth, not the primary control: the crawler already refuses
 * non-India postings at ingestion (server/jobIntelligence/eligibility). This
 * exists so a malformed or legacy row that predates that gate — or one written
 * by the extension path, which has no such gate — still cannot surface on the
 * public Jobs page.
 *
 * Deliberately generous in WHAT it matches (country code, country name, the
 * word "India" anywhere in the free-text location, or a known Indian city or
 * state) and strict in its default: a row matching none of these is hidden.
 *
 * ⚠️ `city`/`state` are matched with `imatch` (Postgres `~*`, a case-INsensitive
 * anchored regex) rather than `in.()`. `in.()` performs an exact, CASE-SENSITIVE
 * string comparison — real rows overwhelmingly store Title Case ("Bengaluru",
 * "Uttar Pradesh") while this module's gazetteer is lowercase, so `in.()`
 * silently matched almost nothing (found live in production 2026-09-13: 19 of
 * 318 valid India jobs were invisible on the Jobs page for exactly this
 * reason). `imatch` performs the same EXACT-match semantics (anchored with
 * `^...$`, so "Bengaluru" matches but "Bengaluru Rural District" does not)
 * while being case-insensitive by construction — no casing enumeration, no
 * gazetteer changes, and per-request measurement shows the resulting query
 * string is a few hundred characters SHORTER than the `in.()` version it
 * replaces (one regex per column vs. one quoted literal per gazetteer entry).
 */
export function indiaDiscoveryFilter(): string {
  const clauses: string[] = [
    `country.imatch.${quote(exactMatchAlternation(COUNTRY_TOKENS))}`,
    "location.ilike.*india*",
    "city.ilike.*india*",
    `city.imatch.${quote(indiaCityPattern())}`,
    `state.imatch.${quote(indiaStatePattern())}`,
  ];
  return clauses.join(",");
}
