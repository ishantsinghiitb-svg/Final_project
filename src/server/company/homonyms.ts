// ── Module 11C-1: proven company-name homonyms ──
//
// Module 11B established the principle this file operationalizes: NAME EVIDENCE
// CANNOT SEPARATE HOMONYMS (see crawl/verify/boardIdentity.ts — "Minimalist",
// "Navi" and "Bluestone" each named the expected company dozens of times and
// were each a different company). Module 11A's identity resolver is name-based
// by design, so two real employers sharing a name collapse into ONE
// `companies` row and one shared logo.
//
// The 11C investigation found FOUR such collisions live in production data.
// They have two distinct causes, and the table handles both because the fix is
// identical: postings sharing one identity key belong to different employers,
// and only URL evidence can separate them.
//
// ── Cause 1: a genuine name homonym ──
//
//   "Slice"  → boards.greenhouse.io/slice serves a US pizza-technology company
//              (Skopje / Pristina / Debar / East Rutherford NJ, 42 postings),
//              while careers.kula.ai/slice serves the Bengaluru fintech
//              (sliceit.com). Both normalized to `slice` and shared one row.
//   "Porter" → jobs.lever.co/porter serves a US healthcare staffing company
//              ("Nurse Practitioner (Sandusky, OH)", Pompano Beach FL,
//              New Jersey, Michigan — 28 postings). The registry entry that
//              produced it was seeded for the Bengaluru logistics company
//              (porter.in). No posting is the Indian company's.
//   "Zomato" → jobs.lever.co/eternal serves a US athletic-performance company
//              literally named Eternal ("Performance Technician - Open Interest
//              - SF", "the athletes we serve" — 4 postings, San Francisco and
//              New York). The slug was guessed from Zomato's real legal rename
//              to Eternal Ltd and landed on a different company of that name.
//              The board text contains ZERO occurrences of "zomato", "eternal"
//              or "zomato.com" — verified against the stored postings.
//
// ── Cause 2: a stale/reassigned ATS tenant ──
//
//   "Fi Money" → jobs.lever.co/epifi serves TETRIZ, an AI engineering-
//              intelligence platform ("About Tetriz… helps engineering orgs
//              become AI-native, faster"), across all 11 postings. Epifi is Fi
//              Money's real legal name, so the slug is not a bad guess — the
//              TENANT is stale or reassigned. Here the employer is established
//              from the postings' own content rather than from the slug: all
//              11 bodies carry an explicit "About Tetriz" self-description, and
//              none mentions Fi, Epifi or fi.money even once. The slug is the
//              only signal pointing the other way, and a self-authored,
//              unanimous self-description outweighs an ATS tenant name, which
//              carries no guarantee of currency.
//
// Note what is NOT claimed for Tetriz: no domain. The employer's identity is
// established well enough to stop the postings being shown as Fi Money; its
// DOMAIN is not, so it gets none (see `domain: null` below).
//
// ── How an entity is told apart ──
//
// ONLY by an independent, non-name signal: a host that the employer itself
// serves its postings from. That is the same bar `evaluateBoardIdentity` sets
// for `accepted` (name evidence + the employer's own domain), applied to data
// already stored rather than to a freshly fetched board.
//
// ── Why disambiguated keys look the way they do ──
//
// `normalizedKey` is `"<base key>#<discriminator>"`, where the discriminator is
// the entity's own domain when one is established and `"<platform>-<slug>"`
// otherwise. `identityKey()` strips every character except [a-z0-9&] and
// spaces, so a "#"-bearing key can NEVER be produced by normal name
// resolution — a disambiguated entity can only ever be reached deliberately,
// through this table.
//
// ── The deliberate fallback ──
//
// `resolveHomonym` returns null when the evidence matches no entity. The
// caller then keeps today's plain name-derived key. That is intentional: an
// unattributable "Slice" capture is genuinely ambiguous, and parking it on its
// own plain-keyed row is strictly safer than assigning it to either real
// company. Absence of evidence is never treated as evidence.
//
// ── `canonicalName` vs `displayName` (Module 11C-1 correction) ──
//
// `companies` carries TWO unique indexes that both matter here:
//   `companies_name_unique`      ON companies (lower(name))       — since the
//                                 table's creation, untouched, and NOT to be
//                                 weakened.
//   `companies_normalized_key_unique` ON companies (normalized_key) — Module 11A.
//
// A homonym group's whole premise is two real employers sharing a NAME, so
// `canonicalName` legitimately repeats across a group's entities (both Porter
// entities are "Porter"). The disambiguated `normalizedKey` keeps that safe for
// the second index — but the first apply attempt against production proved it
// is NOT safe for `companies_name_unique`: inserting a second `companies` row
// literally named "Slice" while one already exists raised
// `23505 duplicate key value violates unique constraint "companies_name_unique"`.
//
// `canonicalName` is what postings are titled (`global_jobs.company_name` —
// see `retitleJobs` in scripts/module11c1Cleanup.ts) and is per-posting, not
// unique. `displayName` is what a `companies` row is NAMED and MUST be globally
// unique — `validateHomonymTable()` enforces this across every declared entity,
// in every group, so a collision is a test failure long before it can reach
// production as a 23505. Qualifying only breaks ties: it is added ONLY where a
// group's two entities would otherwise share a literal name (Slice: "Slice" /
// "Slice"; Porter: "Porter" / "Porter"). Zomato and Fi Money need no
// qualification — "Eternal" ≠ "Zomato" and "Tetriz" ≠ "Fi Money" already.

import { identityKey } from "@/server/jobIntelligence/crawl/registry/companyIdentity";

export type HomonymEntity = {
  /**
   * Name POSTINGS are titled with (`global_jobs.company_name`). Two entities
   * in a group may legitimately share this — that is the definition of a
   * homonym. Never written to `companies.name`; see `displayName`.
   */
  canonicalName: string;
  /**
   * Name the `companies` ROW is given (`companies.name`). MUST be globally
   * unique (case-insensitively) across every declared entity in every group —
   * `companies_name_unique` enforces this in the database, and
   * `validateHomonymTable()` enforces it here, offline, before a value ever
   * reaches an INSERT. Equals `canonicalName` except where a group's two
   * entities would otherwise collide.
   */
  displayName: string;
  /** Disambiguated `companies.normalized_key`. Always contains "#". */
  normalizedKey: string;
  /**
   * The employer's OWN domain, when independently established from hosts it
   * serves its own postings from. Null when no such evidence exists — never
   * guessed, and null must never be filled in from the other entity's domain.
   */
  domain: string | null;
  /**
   * Hosts/URL fragments that PROVE a posting belongs to this entity. Matched
   * case-insensitively as substrings of a posting's URLs. An ATS host alone
   * (`jobs.lever.co`) is never enough — entries here always carry the slug
   * too, so they identify one board rather than a whole platform.
   */
  evidence: string[];
  /** Operator-facing explanation of what this entity actually is. */
  note: string;
};

/**
 * Shared `identityKey()` → the real employers that collide on it.
 *
 * Adding an entry is a curation decision backed by observed evidence, never a
 * similarity score. An employer with no observed postings may still be listed
 * (see Porter/India) so that its curated domain can never be attached to the
 * homonym that DOES have postings.
 */
export const HOMONYM_GROUPS: Record<string, HomonymEntity[]> = {
  slice: [
    {
      canonicalName: "Slice",
      // Qualified: the other entity in this group is ALSO plain "Slice"/"slice"
      // — this is the pair that raised the 23505 on the first apply attempt.
      displayName: "Slice (slice.careers)",
      normalizedKey: "slice#slice.careers",
      domain: "slice.careers",
      evidence: ["slice.careers", "boards.greenhouse.io/slice"],
      note: "US pizza-technology company. Serves its own postings from slice.careers; offices in North Macedonia, Kosovo and New Jersey.",
    },
    {
      canonicalName: "slice",
      displayName: "slice (sliceit.com)",
      normalizedKey: "slice#sliceit.com",
      domain: "sliceit.com",
      evidence: ["careers.kula.ai/slice", "sliceit.com"],
      note: "Bengaluru consumer-fintech company (sliceit.com). Hires through Kula.",
    },
  ],
  porter: [
    {
      canonicalName: "Porter",
      // Not qualified: this is the entity actual postings resolve to today
      // (28, from the disabled jobs.lever.co/porter board), and "Porter" alone
      // is what companies.name already holds — no functional change.
      displayName: "Porter",
      normalizedKey: "porter#lever-porter",
      // No employer domain is established for this company: every posting is
      // served from the ATS host itself. Left null rather than guessed — the
      // company then simply receives no domain-based logo, which is safe.
      domain: null,
      evidence: ["jobs.lever.co/porter"],
      note: "US healthcare staffing company posting clinical roles across the US. NOT the Bengaluru logistics company; the registry entry that produced these postings was a slug-guess false positive.",
    },
    {
      canonicalName: "Porter",
      // Qualified: this entity shares the literal name "Porter" with the one
      // above. It currently has zero postings and is never created today, but
      // the qualification is declared now so a future genuine Porter-India
      // board can never collide with the US company's row.
      displayName: "Porter (porter.in)",
      normalizedKey: "porter#porter.in",
      domain: "porter.in",
      evidence: ["porter.in"],
      // Declared with no observed postings on purpose: its presence is what
      // stops the curated `porter.in` domain attaching to the US company above.
      note: "Bengaluru intra-city logistics company (porter.in). No postings currently captured.",
    },
  ],
  // `zomato` is the identity key for BOTH the Indian company and the unrelated
  // US company, because Zomato's curated rename ("Eternal") resolves onto it.
  zomato: [
    {
      canonicalName: "Eternal",
      // Not qualified: "Eternal" and "Zomato" already differ, so this group
      // has no lower(name) collision to break.
      displayName: "Eternal",
      normalizedKey: "zomato#lever-eternal",
      // Every posting is served from the ATS host; no employer domain is
      // established, and porter-style, none is guessed.
      domain: null,
      evidence: ["jobs.lever.co/eternal"],
      note: "US athletic-performance company named Eternal (Performance Technician / Performance Team roles, San Francisco and New York, 'the athletes we serve'). NOT Zomato, whose legal rename to Eternal Ltd is what caused this slug to be guessed.",
    },
    {
      canonicalName: "Zomato",
      displayName: "Zomato",
      normalizedKey: "zomato#zomato.com",
      domain: "zomato.com",
      evidence: ["zomato.com", "careers.zomato.com", "eternal.co.in"],
      // Declared with no observed postings: its presence keeps the curated
      // zomato.com domain off the US company above, and gives a future genuine
      // Zomato board somewhere correct to land.
      note: "Indian food-delivery company (zomato.com), legally renamed Eternal Ltd. No postings currently captured.",
    },
  ],
  "fi money": [
    {
      canonicalName: "Tetriz",
      // Not qualified: "Tetriz" and "Fi Money" already differ.
      displayName: "Tetriz",
      normalizedKey: "fi money#lever-epifi",
      // Identity established from unanimous posting content; DOMAIN is not
      // established and is deliberately left null.
      domain: null,
      evidence: ["jobs.lever.co/epifi"],
      note: "AI engineering-intelligence platform. Established from an explicit 'About Tetriz' self-description in all 11 posting bodies, none of which mentions Fi, Epifi or fi.money. Occupies Fi Money's former Lever tenant (slug 'epifi'), which is stale.",
    },
    {
      canonicalName: "Fi Money",
      displayName: "Fi Money",
      normalizedKey: "fi money#fi.money",
      domain: "fi.money",
      evidence: ["fi.money", "careers.fi.money"],
      note: "Bengaluru neobank (Epifi Technologies, fi.money). No postings currently captured — its Lever tenant now serves Tetriz.",
    },
  ],
};

/** True when a plain name-derived key is known to be shared by more than one real employer. */
export function isHomonymKey(normalizedKey: string): boolean {
  return Object.hasOwn(HOMONYM_GROUPS, (normalizedKey ?? "").trim().toLowerCase());
}

/** Every declared entity for a shared key, or an empty array. */
export function homonymEntities(normalizedKey: string): HomonymEntity[] {
  return HOMONYM_GROUPS[(normalizedKey ?? "").trim().toLowerCase()] ?? [];
}

/** True when a key was produced by this module rather than by name resolution. */
export function isDisambiguatedKey(normalizedKey: string): boolean {
  return (normalizedKey ?? "").includes("#");
}

/**
 * Picks the entity a posting belongs to, using only URL evidence.
 *
 * Returns null when the key is not a known homonym, when no evidence is
 * supplied, or when the evidence matches no entity — the caller must then fall
 * back to plain name resolution. Returns null ALSO when the evidence matches
 * more than one entity, which would mean the curated `evidence` lists overlap
 * and neither can be trusted.
 */
export function resolveHomonym(
  normalizedKey: string,
  evidenceUrls: readonly (string | null | undefined)[],
): HomonymEntity | null {
  const entities = homonymEntities(normalizedKey);
  if (entities.length === 0) return null;

  const haystack = evidenceUrls
    .map((u) => (u ?? "").trim().toLowerCase())
    .filter(Boolean)
    .join(" ");
  if (!haystack) return null;

  const matched = entities.filter((entity) =>
    entity.evidence.some((fragment) => haystack.includes(fragment.toLowerCase())),
  );
  return matched.length === 1 ? matched[0] : null;
}

/**
 * Looks an entity up by its disambiguated key — how a caller that already
 * stored a split company re-reads its curated domain and note.
 */
export function findHomonymEntity(disambiguatedKey: string): HomonymEntity | null {
  const key = (disambiguatedKey ?? "").trim();
  for (const entities of Object.values(HOMONYM_GROUPS)) {
    const hit = entities.find((entity) => entity.normalizedKey === key);
    if (hit) return hit;
  }
  return null;
}

/**
 * The shared base key a disambiguated key was derived from ("slice#..." →
 * "slice"), or null when the key is not disambiguated.
 */
export function homonymBaseKey(disambiguatedKey: string): string | null {
  const key = (disambiguatedKey ?? "").trim();
  if (!key.includes("#")) return null;
  const base = key.slice(0, key.indexOf("#"));
  return isHomonymKey(base) ? base : null;
}

/**
 * Guards the curated table itself: keys must be well-formed and unambiguous.
 *
 * Takes the table as a parameter (defaulting to the real `HOMONYM_GROUPS`)
 * purely so tests can prove the displayName-collision check actually fires,
 * by feeding it a deliberately-colliding fixture — every production call site
 * calls this with no argument and validates the real table, unchanged.
 */
export function validateHomonymTable(
  groups: Record<string, HomonymEntity[]> = HOMONYM_GROUPS,
): string[] {
  const problems: string[] = [];
  const seenKeys = new Set<string>();
  // `displayName` becomes `companies.name`, which `companies_name_unique`
  // constrains GLOBALLY (case-insensitively) across the WHOLE table — not per
  // group. Tracked across every group's entities, not reset per iteration, so
  // a collision between two DIFFERENT groups is caught exactly like one within
  // the same group. This is the check that would have caught the "Slice" /
  // "Slice" collision before it ever reached production as a 23505.
  const seenDisplayNames = new Map<string, string>(); // lower(displayName) -> normalizedKey
  for (const [base, entities] of Object.entries(groups)) {
    if (identityKey(base) !== base) {
      problems.push(`group key "${base}" is not a canonical identityKey()`);
    }
    if (entities.length < 2) {
      problems.push(`group "${base}" declares fewer than two entities — not a homonym`);
    }
    for (const entity of entities) {
      if (!entity.normalizedKey.startsWith(`${base}#`)) {
        problems.push(`"${entity.normalizedKey}" does not derive from group key "${base}"`);
      }
      if (seenKeys.has(entity.normalizedKey)) {
        problems.push(`duplicate normalizedKey "${entity.normalizedKey}"`);
      }
      seenKeys.add(entity.normalizedKey);
      if (entity.evidence.length === 0) {
        problems.push(
          `"${entity.normalizedKey}" declares no evidence — it could never be resolved`,
        );
      }
      if (!entity.displayName.trim()) {
        problems.push(`"${entity.normalizedKey}" declares an empty displayName`);
      } else {
        const lower = entity.displayName.trim().toLowerCase();
        const holder = seenDisplayNames.get(lower);
        if (holder && holder !== entity.normalizedKey) {
          problems.push(
            `displayName "${entity.displayName}" is shared by "${holder}" and "${entity.normalizedKey}" — ` +
              `would violate companies_name_unique (lower(name)) if both were ever inserted`,
          );
        }
        seenDisplayNames.set(lower, entity.normalizedKey);
      }
    }
    // Overlapping evidence would make resolveHomonym permanently ambiguous.
    for (const entity of entities) {
      for (const other of entities) {
        if (entity === other) continue;
        const clash = entity.evidence.find((fragment) =>
          other.evidence.some(
            (otherFragment) =>
              fragment.toLowerCase().includes(otherFragment.toLowerCase()) ||
              otherFragment.toLowerCase().includes(fragment.toLowerCase()),
          ),
        );
        if (clash) {
          problems.push(
            `evidence "${clash}" is shared by "${entity.normalizedKey}" and "${other.normalizedKey}"`,
          );
        }
      }
    }
  }
  return problems;
}
