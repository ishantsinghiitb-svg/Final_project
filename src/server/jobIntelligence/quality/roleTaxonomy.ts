// ── Job quality: shared role taxonomy ──
//
// Deterministic, explainable signal patterns used by `jobQuality.ts` to
// score a posting's title (and, weakly, its description) — never an
// external AI call, and never a blunt keyword blacklist. Every pattern here
// is a whole-PHRASE, word-boundary match, specific enough that a legitimate
// technical/professional role with an incidental word overlap ("Technical
// SALES Engineer" vs. the low-signal "Field Sales Executive") never
// collides with it.
//
// Five tiers, in descending strength:
//   - CORE_HIGH_SIGNAL: the four explicitly product-defined families
//     (Software/Engineering, Product, AI/Data, Quant/Finance-Tech) named in
//     the OfferLyst product requirement, verbatim.
//   - TECHNICAL_SUFFIX: role-defining suffix words ("Engineer", "Architect",
//     "Scientist", "Analyst", ...) that imply a technical/analytical role
//     regardless of the qualifier in front of them ("Sales Engineer",
//     "Solutions Architect") — this is what keeps a genuinely technical
//     title from being misclassified just because it also contains a
//     low-signal-sounding word like "Sales" or "Support".
//   - SENIORITY: scope words that make an otherwise-ambiguous title more
//     likely to be a real professional role. Deliberately weak (see
//     jobQuality.ts's capped, once-only bonus) — never strong enough alone
//     to rescue a title that also matches a LOW_SIGNAL phrase (a "Senior
//     Relationship Manager" must not be rescued by "Senior").
//   - PROFESSIONAL_DOMAIN: adjacent professional functions the product brief
//     explicitly says CAN be high quality (Revenue/Business Operations,
//     Growth, technical Program Management, Solutions Consulting, senior
//     Business Development, ...) without hardcoding every possible good
//     title into the core taxonomy.
//   - LOW_SIGNAL: the explicit low-value listing types from the product
//     brief, matched as SPECIFIC compound phrases — never a bare, common
//     word like "Sales" or "Manager" alone — so a legitimate role can never
//     be caught by incidental word overlap. This is the opposite of a
//     blacklist: it names known-bad PHRASES, not words.

export type RoleFamily =
  | "software_engineering"
  | "product"
  | "ai_data"
  | "quant_finance"
  | "technical_suffix"
  | "seniority"
  | "professional_domain"
  | "low_signal";

export type TaxonomyEntry = {
  family: RoleFamily;
  label: string;
  pattern: RegExp;
  weight: number;
  /** When this ALSO matches the text, the entry is treated as not matching (e.g. "Technical Writer" is not a generic "Writer"). */
  unless?: RegExp;
};

export type TaxonomyMatch = { family: RoleFamily; label: string; weight: number };

/** Whole-phrase, word-boundary, case-insensitive match. Internal spaces become flexible whitespace. */
function phrasePattern(label: string): RegExp {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
  return new RegExp(`\\b${escaped}\\b`, "i");
}

function entries(family: RoleFamily, weight: number, labels: string[]): TaxonomyEntry[] {
  return labels.map((label) => ({ family, label, pattern: phrasePattern(label), weight }));
}

/**
 * Software / Engineering — verbatim from the product requirement, plus two
 * literal word-form variants the production dry run surfaced as real gaps
 * ("Software Development"/"Software Testing" internships were scoring
 * neutral and getting rejected on Internshala's strict tier purely because
 * "Development"/"Testing" are different word forms from "Developer" — the
 * underlying discipline is the same core engineering family).
 */
const SOFTWARE_ENGINEERING = entries("software_engineering", 3, [
  "Software Engineer",
  "Software Developer",
  "Software Development",
  "Software Testing",
  "SDE",
  "Backend",
  "Frontend",
  "Full Stack",
  "Mobile",
  "iOS",
  "Android",
  "Platform",
  "Systems",
  "Infrastructure",
  "DevOps",
  "SRE",
  "Cloud",
  "Security",
  "Cybersecurity",
]);

/** Product — verbatim from the product requirement. */
const PRODUCT = entries("product", 3, [
  "Product Manager",
  "Associate Product Manager",
  "Product Analyst",
  "Technical Product Manager",
  "Product Strategy",
  "Product Operations",
  "Growth Product",
]);

/** AI / Data — verbatim from the product requirement. */
const AI_DATA = entries("ai_data", 3, [
  "AI Engineer",
  "ML Engineer",
  "Machine Learning",
  "Data Scientist",
  "Data Engineer",
  "Analytics Engineer",
  "Applied Scientist",
  "Research Engineer",
  "AI Research",
  "NLP",
  "Computer Vision",
]);

/** Quant / Finance Technology — verbatim from the product requirement. */
const QUANT_FINANCE = entries("quant_finance", 3, [
  "Quant",
  "Quantitative Research",
  "Quantitative Developer",
  "Algorithmic Trading",
  "Trading Technology",
  "Financial Engineering",
  "Risk Quant",
]);

/**
 * Role-defining suffix/qualifier words that mark a technical or analytical
 * role independent of what precedes them. This is the mechanism that
 * correctly RETAINS "Technical Sales Engineer" (an explicit false-positive
 * risk named in the product requirement) without needing a special case:
 * bare "Engineer" matches and outweighs any incidental low-signal word.
 */
const TECHNICAL_SUFFIX = entries("technical_suffix", 2, [
  "Engineer",
  "Engineering",
  "Architect",
  "Developer",
  "Scientist",
  "Researcher",
  "Data Analyst",
  "Business Analyst",
  "Financial Analyst",
  "Research Analyst",
  // A formally recognized, multi-year Chartered Accountancy professional
  // credential — real client accounting/financial-analysis/compliance work,
  // not a generic internship. Production sanity check found it scoring pure
  // neutral (rejected on Internshala) purely because neither the title nor
  // description used any word this taxonomy already recognized ("Articleship"
  // is the term of art; "Accounting"/"Finance" never appear). Weighted at
  // this tier, not the weaker PROFESSIONAL_DOMAIN one, because — like
  // "Engineer"/"Architect" — it is itself the credential/role designation,
  // not just an adjacent domain word.
  "Articleship",
]);
/** Bare "Analyst" alone is weaker — it's common enough to be ambiguous on its own. */
const TECHNICAL_SUFFIX_WEAK = entries("technical_suffix", 1, ["Analyst"]);

/** Scope/seniority words — see the module doc comment for why these are capped and weak. */
const SENIORITY = entries("seniority", 1, [
  "Senior",
  "Sr",
  "Lead",
  "Principal",
  "Staff",
  "Head",
  "Director",
  "VP",
  "Chief",
  "Manager",
]);

/**
 * Adjacent professional functions the product brief explicitly says can be
 * high quality: Revenue/Business Operations, growth/performance marketing,
 * technical program management, solutions consulting, senior (Manager-level,
 * not Executive-level — see LOW_SIGNAL) business development, design, and
 * the finance/strategy/consulting functions Internshala's graduate roles
 * need to stay retainable without matching the strict Quant list.
 */
const PROFESSIONAL_DOMAIN = entries("professional_domain", 1, [
  "Revenue Operations",
  "Business Operations",
  "Sales Operations",
  "Marketing Operations",
  "Growth Marketing",
  "Performance Marketing",
  "Marketing Analytics",
  // Bare "Growth" — the product brief explicitly calls out growth roles as
  // able to be high quality; without this a plain "Growth Associate"/"Growth
  // Intern" title (no other qualifying word) scored as pure neutral.
  "Growth",
  "Technical Program Manager",
  "Program Manager",
  "Solutions Consultant",
  "Solutions Engineer",
  "Solutions Architect",
  "Sales Engineering",
  "Customer Success Manager",
  "Technical Account Manager",
  "Business Development Manager",
  "Product Design",
  "UX Design",
  "UI Design",
  "People Analytics",
  "HR Business Partner",
  "Finance",
  "Accounting",
  "Strategy",
  "Consulting",
  // Role-TITLE word forms of the domain-noun entries just above — a real
  // posting says "Product Designer"/"Strategy Consultant", not "Product
  // Design"/"Strategy" (the same word-form gap fixed for "Software
  // Development"/"Software Testing" in SOFTWARE_ENGINEERING above).
  "Designer",
  "Consultant",
  "Strategist",
  "Accountant",
]);

/**
 * The explicit low-value listing types from the product brief. Matched as
 * SPECIFIC compound phrases only — "Sales" and "Manager" alone are never
 * patterns here — so a legitimate role can never be caught by incidental
 * word overlap. ("Generic"/"Basic" in the product brief's own phrasing was
 * descriptive framing, not part of a real title — dropped here.)
 */
const LOW_SIGNAL = entries("low_signal", -3, [
  "Data Entry",
  "Telecaller",
  "Telecalling",
  "Content Writer",
  "Copywriter",
  "Video Editor",
  "Field Sales",
  "Back Office",
  "Translator",
  "Teacher",
  "Tutor",
  "Customer Support",
  "Recruitment Executive",
  "HR Executive",
  "Social Media Executive",
  "Digital Marketing Executive",
  "Business Development Executive",
  "Relationship Manager",
]);

/**
 * A bare "Writer" is a generic content role, but "Technical Writer", "UX
 * Writer" and "Documentation Writer" are legitimate professional roles — so
 * those are excluded rather than the bare word being left out (an exclusion
 * on one entry, not lookbehind: older Safari builds reject lookbehind).
 */
const GENERIC_WRITER: TaxonomyEntry[] = [
  {
    family: "low_signal",
    label: "Writer",
    pattern: /\bwriter\b/i,
    weight: -3,
    unless: /\b(?:technical|ux|documentation|api|medical|scientific)\s+writer\b/i,
  },
];

/** Every entry, ordered strongest-first — used by `matchTaxonomy` to break ties. */
export const TAXONOMY: readonly TaxonomyEntry[] = [
  ...SOFTWARE_ENGINEERING,
  ...PRODUCT,
  ...AI_DATA,
  ...QUANT_FINANCE,
  ...TECHNICAL_SUFFIX,
  ...TECHNICAL_SUFFIX_WEAK,
  ...PROFESSIONAL_DOMAIN,
  ...LOW_SIGNAL,
  ...GENERIC_WRITER,
  ...SENIORITY,
];

/** Every entry belonging to one of the four core, product-named high-signal families. */
export const CORE_HIGH_SIGNAL_FAMILIES: readonly RoleFamily[] = [
  "software_engineering",
  "product",
  "ai_data",
  "quant_finance",
];

/** Finds every taxonomy phrase present in `text`. Pure, case-insensitive, no I/O. */
export function matchTaxonomy(
  text: string,
  pool: readonly TaxonomyEntry[] = TAXONOMY,
): TaxonomyMatch[] {
  if (!text) return [];
  const matches: TaxonomyMatch[] = [];
  for (const entry of pool) {
    if (entry.pattern.test(text) && !entry.unless?.test(text)) {
      matches.push({ family: entry.family, label: entry.label, weight: entry.weight });
    }
  }
  return matches;
}

export const SENIORITY_ENTRIES = SENIORITY;
export const LOW_SIGNAL_ENTRIES = [...LOW_SIGNAL, ...GENERIC_WRITER];
export const CORE_HIGH_SIGNAL_ENTRIES = [
  ...SOFTWARE_ENGINEERING,
  ...PRODUCT,
  ...AI_DATA,
  ...QUANT_FINANCE,
];
export const TECHNICAL_SUFFIX_ENTRIES = [...TECHNICAL_SUFFIX, ...TECHNICAL_SUFFIX_WEAK];
export const PROFESSIONAL_DOMAIN_ENTRIES = PROFESSIONAL_DOMAIN;

/**
 * Single common English words that are strong, deliberate signals when they
 * appear as (part of) a TITLE, but far too loose to scan a free-text
 * DESCRIPTION with — "our platform", "job security", "mobile number" and
 * "operating systems" are unremarkable phrases in almost any corporate JD,
 * regardless of what the role actually is. Excluded from the description-
 * only fallback pool (see jobQuality.ts) for exactly this reason; still full
 * signals when matched in the title itself.
 */
const DESCRIPTION_UNSAFE_LABELS = new Set(["Platform", "Systems", "Security", "Mobile", "Cloud"]);

/** `CORE_HIGH_SIGNAL_ENTRIES` + `TECHNICAL_SUFFIX_ENTRIES`, minus the labels too generic to scan free text with. */
export const DESCRIPTION_SAFE_ENTRIES = [
  ...SOFTWARE_ENGINEERING,
  ...PRODUCT,
  ...AI_DATA,
  ...QUANT_FINANCE,
  ...TECHNICAL_SUFFIX,
  ...TECHNICAL_SUFFIX_WEAK,
].filter((entry) => !DESCRIPTION_UNSAFE_LABELS.has(entry.label));
