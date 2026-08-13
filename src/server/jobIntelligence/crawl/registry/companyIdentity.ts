// ── Module 10B.1.5: registry company identity ──
//
// A curated company list arrives full of aliases ("Zomato / Eternal"),
// parent-company framing ("Mamaearth / Honasa Consumer") and shared-parent
// groups ("Naukri.com / Info Edge"). Three different things are tangled
// together there, and collapsing them all would be wrong:
//
//   1. ALIAS — two names for ONE hiring entity. "Groww Invest Tech" and
//      "Groww" post the same jobs to the same board. Must become ONE entry.
//   2. PARENT — a distinct hiring entity that happens to be owned by another.
//      Blinkit is Zomato-owned but runs its own board; Naukri, 99acres and
//      Jeevansathi are all Info Edge but hire separately. Must stay SEPARATE
//      entries, with the parent recorded.
//   3. RENAME — the company legally renamed itself (Zomato → Eternal Ltd).
//      One entity, one entry, canonical name = the name candidates recognize.
//
// This module answers only "what is this company called, and who owns it".
// It never decides whether a URL works — that is SourceVerifier's job.
//
// ⚠️ Distinct from `normalize/company.ts` (Module 10A), which canonicalizes
// the company string found INSIDE a scraped posting for dedup/display. This
// one canonicalizes an OPERATOR-SUPPLIED registry name before it is written.
// They are deliberately separate: a mistake here merges two registry entries
// (an operator-visible config error), a mistake there merges two jobs.
//
// Module 11A (server/company/identity.ts) is a second, later caller: for a
// plain (non-"A / B") input, `resolveCompanyIdentity` is a pure alias lookup
// with no registry-specific side effects, so reusing the SAME curated
// rename/alias table for scraped company names (not just registry names) is
// safe — the aliases are facts about the real company, independent of which
// input produced the string.

/** Canonical identity for one registry company. */
export type CompanyIdentity = {
  /** The name stored in `crawl_company_registry.company_name`. */
  canonicalName: string;
  /** Owning group, when the company is a subsidiary that still hires separately. */
  parentCompany: string | null;
  /** Other names this entity is known by, including the raw input if it differed. */
  aliases: string[];
};

/**
 * Alias → canonical. Keyed by `identityKey()` (lowercased, punctuation-free).
 *
 * ONLY true aliases of a single hiring entity belong here. If two names run
 * separate boards, they are two entries and belong in PARENT_COMPANIES.
 */
const CANONICAL_ALIASES: Record<string, string> = {
  // Legal renames / trading names.
  eternal: "Zomato",
  "eternal ltd": "Zomato",
  "zomato eternal": "Zomato",
  "one97 communications": "Paytm",
  "paytm one97 communications": "Paytm",
  "honasa consumer": "Honasa Consumer",
  mamaearth: "Honasa Consumer",
  "mamaearth honasa consumer": "Honasa Consumer",
  "imagine marketing": "boAt",
  "boat imagine marketing": "boAt",
  "verse innovation": "VerSe Innovation",
  "dailyhunt verse innovation": "VerSe Innovation",
  "pb fintech": "PB Fintech",
  "policybazaar pb fintech": "PB Fintech",
  "dream sports": "Dream Sports",
  "dream11 dream sports": "Dream Sports",
  curefit: "Cult.fit",
  "cult fit curefit": "Cult.fit",
  "fpl technologies": "FPL Technologies",
  "onecard fpl technologies": "FPL Technologies",
  "amica financial technologies": "Jupiter",
  "jupiter amica financial technologies": "Jupiter",
  epifi: "Fi Money",
  "fi money epifi": "Fi Money",
  "groww invest tech": "Groww",
  "billionbrains garage ventures": "Groww",
  "6sense": "6sense",
  "slintel 6sense": "6sense",
  "wingify vwo": "Wingify",
  vwo: "Wingify",
  "rea india": "REA India",
  "housing com rea india": "REA India",
  // Freshdesk is a product of Freshworks, not a separate employer.
  freshdesk: "Freshworks",
  "freshdesk freshworks": "Freshworks",
  // Module 11C-1: Razorpay's Greenhouse board posts under its registered legal
  // entity name ("Razorpay Software Private Limited"), which
  // `normalizeCompanyName` reduces to "Razorpay Software" — a second row
  // holding 23 postings alongside the plain "Razorpay" one. Same company, same
  // hiring entity; this is a legal-name alias, not a similarity guess.
  "razorpay software": "Razorpay",
  "razorpay software private limited": "Razorpay",
};

/**
 * Subsidiary → parent. These stay SEPARATE registry entries: each runs its own
 * hiring. The parent is recorded so an operator can see the group structure
 * without the entries being merged.
 */
const PARENT_COMPANIES: Record<string, string> = {
  blinkit: "Zomato",
  ajio: "Reliance Industries",
  "reliance retail": "Reliance Industries",
  "jio platforms": "Reliance Industries",
  haptik: "Reliance Industries",
  "tata digital": "Tata Sons",
  "tata motors": "Tata Sons",
  "tata elxsi": "Tata Sons",
  "tata communications": "Tata Sons",
  "titan company": "Tata Sons",
  tcs: "Tata Sons",
  "tata consultancy services": "Tata Sons",
  naukri: "Info Edge",
  "naukri com": "Info Edge",
  "99acres": "Info Edge",
  jeevansathi: "Info Edge",
  "lt technology services": "Larsen & Toubro",
  ltimindtree: "Larsen & Toubro",
  "bajaj finserv": "Bajaj Group",
  "bajaj auto": "Bajaj Group",
  "hdfc life": "HDFC Group",
  "hdfc bank": "HDFC Group",
  "icici lombard": "ICICI Group",
  "icici bank": "ICICI Group",
  "ola electric": "Ola",
  setu: "Pine Labs",
  "ola krutrim": "Ola",
};

/**
 * Lowercased, punctuation-normalized matching key.
 *
 * Apostrophes are DELETED but dots are SEPARATORS, and the difference matters:
 * "Byju's" and "Byjus" are the same word with a possessive, so the apostrophe
 * has to vanish — but "Cult.fit" and "Cult Fit" are the same name with a dot
 * standing in for a space, so deleting it would produce "cultfit" while the
 * spaced form produces "cult fit", and the two would never match.
 */
export function identityKey(name: string): string {
  return (name ?? "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9&]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Splits a curated "A / B" entry into its two names. The list uses that form
 * for BOTH aliases and parent/subsidiary pairs, so this only separates them —
 * `resolveCompanyIdentity` decides which relationship applies.
 */
export function splitCuratedName(raw: string): string[] {
  return (raw ?? "")
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean);
}

/**
 * Resolves an operator-supplied (or curated-list) company name to its canonical
 * identity. Never throws, never returns an empty canonical name for non-empty
 * input: an unrecognized company is simply itself, with no parent.
 */
export function resolveCompanyIdentity(raw: string): CompanyIdentity {
  const parts = splitCuratedName(raw);
  const primary = parts[0] ?? (raw ?? "").trim();

  // A curated "A / B" is an ALIAS only when the joined form, or either side,
  // maps to a single canonical name. Otherwise the two sides are distinct
  // entities and the caller should have registered them separately.
  const joinedKey = identityKey(parts.join(" "));
  const canonicalFromJoined = CANONICAL_ALIASES[joinedKey];

  const primaryKey = identityKey(primary);
  const canonical = canonicalFromJoined ?? CANONICAL_ALIASES[primaryKey] ?? primary.trim();

  const canonicalKey = identityKey(canonical);
  // A company is never its own parent — that would render as "Zomato (Zomato)".
  const parentRaw = PARENT_COMPANIES[canonicalKey] ?? null;
  const parentCompany = parentRaw && identityKey(parentRaw) !== canonicalKey ? parentRaw : null;

  const aliases = [...new Set(parts.concat(raw))]
    .map((name) => name.trim())
    .filter((name) => name && identityKey(name) !== canonicalKey);

  return { canonicalName: canonical, parentCompany, aliases };
}

/**
 * Every curated name that denotes the SAME hiring entity as `raw` — its
 * canonical name plus every alias the table maps onto that canonical name.
 *
 * An EXACT reverse lookup over `CANONICAL_ALIASES`: a name is included only if
 * the curated table already says it is the same entity. There is no fuzzy
 * matching, no substring similarity and no inference from name resemblance —
 * "Eternal" is a variant of "Zomato" solely because the table records that
 * legal rename, and nothing else qualifies.
 *
 * Module 11C-1 added this for the board-identity guard, which previously
 * searched board text for the canonical name ALONE. A company that renamed
 * itself posts under the new name, so the guard read a legitimate board as
 * belonging to someone else. Widening the NAME evidence does not widen what
 * gets auto-registered: `accepted` still additionally requires the employer's
 * own domain (see crawl/verify/boardIdentity.ts), so alias awareness can move
 * a board from `rejected` to `needs_review`, never straight to `accepted`.
 *
 * Deliberately does NOT include parent companies: Blinkit is Zomato-owned but
 * is a different hiring entity with its own board, and treating the parent's
 * name as evidence for the subsidiary's board is exactly the conflation
 * PARENT_COMPANIES exists to prevent.
 */
export function curatedNameVariants(raw: string): string[] {
  const canonical = resolveCompanyIdentity(raw).canonicalName;
  const canonicalKey = identityKey(canonical);
  if (!canonicalKey) return [];

  const seen = new Set<string>([canonicalKey]);
  const variants = [canonical];

  for (const [aliasKey, target] of Object.entries(CANONICAL_ALIASES)) {
    if (identityKey(target) !== canonicalKey) continue;
    if (seen.has(aliasKey)) continue;
    seen.add(aliasKey);
    variants.push(aliasKey);
  }

  // The caller's own string, when the tables reduced it to something else.
  const rawKey = identityKey(raw ?? "");
  if (rawKey && !seen.has(rawKey)) variants.push((raw ?? "").trim());

  return variants;
}

/**
 * True when two names denote the SAME hiring entity — the duplicate-prevention
 * test the registry loader applies before inserting. Deliberately does NOT
 * treat a parent/subsidiary pair as the same entity.
 */
export function isSameCompany(a: string, b: string): boolean {
  return (
    identityKey(resolveCompanyIdentity(a).canonicalName) ===
    identityKey(resolveCompanyIdentity(b).canonicalName)
  );
}
