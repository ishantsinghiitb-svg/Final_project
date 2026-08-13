import { describe, expect, it } from "vitest";
import {
  curatedNameVariants,
  identityKey,
} from "@/server/jobIntelligence/crawl/registry/companyIdentity";
import {
  findHomonymEntity,
  homonymBaseKey,
  homonymEntities,
  isDisambiguatedKey,
  isHomonymKey,
  resolveHomonym,
  validateHomonymTable,
  type HomonymEntity,
} from "./homonyms";
import { resolveCanonicalCompany } from "./identity";

describe("the curated homonym table", () => {
  it("is internally consistent (well-formed keys, no overlapping evidence, no displayName collisions)", () => {
    expect(validateHomonymTable()).toEqual([]);
  });

  it("declares the two name collisions the Module 11C investigation proved", () => {
    expect(isHomonymKey("slice")).toBe(true);
    expect(isHomonymKey("porter")).toBe(true);
  });

  it("also declares the two mis-attributed boards found while verifying the alias fix", () => {
    expect(isHomonymKey("zomato")).toBe(true);
    expect(isHomonymKey("fi money")).toBe(true);
  });

  it("does not claim an ordinary company is a homonym", () => {
    expect(isHomonymKey("freshworks")).toBe(false);
    expect(isHomonymKey("")).toBe(false);
  });

  it("never guesses a domain it has no evidence for", () => {
    const usPorter = findHomonymEntity("porter#lever-porter");
    expect(usPorter?.domain).toBeNull();
  });
});

describe("Module 11C-1: displayName — the companies_name_unique fix", () => {
  it("gives every declared entity a non-empty displayName", () => {
    for (const entities of Object.values(homonymEntitiesForEveryGroup())) {
      for (const entity of entities) expect(entity.displayName.trim()).not.toBe("");
    }
  });

  it("qualifies ONLY the two Slice entities, which literally share a name", () => {
    const [us, india] = homonymEntities("slice");
    expect(us.canonicalName).toBe("Slice");
    expect(us.displayName).toBe("Slice (slice.careers)");
    expect(india.canonicalName).toBe("slice");
    expect(india.displayName).toBe("slice (sliceit.com)");
    expect(us.displayName.toLowerCase()).not.toBe(india.displayName.toLowerCase());
  });

  it("qualifies the DORMANT Porter India entity, even though it has no postings today", () => {
    // Both Porter entities share the literal canonicalName "Porter" — the same
    // shape of collision as Slice. Only the India side needs qualifying,
    // because the US side (porter#lever-porter) is the one actual postings
    // resolve to and its companies.name should stay exactly what it already is.
    const [us, india] = homonymEntities("porter");
    expect(us.canonicalName).toBe("Porter");
    expect(us.displayName).toBe("Porter");
    expect(india.canonicalName).toBe("Porter");
    expect(india.displayName).toBe("Porter (porter.in)");
  });

  it("leaves Zomato/Eternal and Fi Money/Tetriz unqualified — their canonicalNames already differ", () => {
    const [eternal, zomato] = homonymEntities("zomato");
    expect(eternal.displayName).toBe(eternal.canonicalName);
    expect(zomato.displayName).toBe(zomato.canonicalName);

    const [tetriz, fiMoney] = homonymEntities("fi money");
    expect(tetriz.displayName).toBe(tetriz.canonicalName);
    expect(fiMoney.displayName).toBe(fiMoney.canonicalName);
  });

  it("every declared displayName is globally unique, case-insensitively, across ALL groups", () => {
    const all = Object.values(homonymEntitiesForEveryGroup()).flat();
    const lower = all.map((e) => e.displayName.toLowerCase());
    expect(new Set(lower).size).toBe(lower.length);
  });

  it("validateHomonymTable() actually detects a displayName collision when one exists", () => {
    // Proves the check fires, not just that today's real table happens to
    // pass it. A deliberately-colliding fixture, injected via the optional
    // parameter — the real HOMONYM_GROUPS is never mutated.
    const colliding: Record<string, HomonymEntity[]> = {
      acme: [
        {
          canonicalName: "Acme",
          displayName: "Acme Corp",
          normalizedKey: "acme#one.com",
          domain: "one.com",
          evidence: ["one.com"],
          note: "fixture",
        },
        {
          canonicalName: "Acme Two",
          // Deliberately colliding case-insensitively with the entry above.
          displayName: "acme corp",
          normalizedKey: "acme#two.com",
          domain: "two.com",
          evidence: ["two.com"],
          note: "fixture",
        },
      ],
    };
    const problems = validateHomonymTable(colliding);
    expect(problems.some((p) => p.includes("companies_name_unique"))).toBe(true);
  });

  it("validateHomonymTable() flags an empty displayName", () => {
    const bad: Record<string, HomonymEntity[]> = {
      acme: [
        {
          canonicalName: "Acme",
          displayName: "",
          normalizedKey: "acme#one.com",
          domain: null,
          evidence: ["one.com"],
          note: "fixture",
        },
        {
          canonicalName: "Acme Two",
          displayName: "Acme Two",
          normalizedKey: "acme#two.com",
          domain: null,
          evidence: ["two.com"],
          note: "fixture",
        },
      ],
    };
    expect(validateHomonymTable(bad).some((p) => p.includes("empty displayName"))).toBe(true);
  });
});

function homonymEntitiesForEveryGroup(): Record<string, HomonymEntity[]> {
  return {
    slice: homonymEntities("slice"),
    porter: homonymEntities("porter"),
    zomato: homonymEntities("zomato"),
    "fi money": homonymEntities("fi money"),
  };
}

describe("resolveHomonym", () => {
  it("attributes a greenhouse/slice.careers posting to the US pizza-technology company", () => {
    const entity = resolveHomonym("slice", [
      "https://slice.careers/careers-listing?gh_jid=7925845",
      "https://boards.greenhouse.io/slice",
    ]);
    expect(entity?.normalizedKey).toBe("slice#slice.careers");
    expect(entity?.domain).toBe("slice.careers");
  });

  it("attributes a Kula posting to the Bengaluru fintech instead", () => {
    const entity = resolveHomonym("slice", ["https://careers.kula.ai/slice/50623/apply/"]);
    expect(entity?.normalizedKey).toBe("slice#sliceit.com");
    expect(entity?.domain).toBe("sliceit.com");
  });

  it("attributes the lever/porter board to the US healthcare company, NOT porter.in", () => {
    const entity = resolveHomonym("porter", [
      "https://jobs.lever.co/porter/5cc451b2-7bb1-44e0-8ae8-85faa50e4711/apply",
    ]);
    expect(entity?.normalizedKey).toBe("porter#lever-porter");
    // The whole point: the Indian logistics company's domain must not attach.
    expect(entity?.domain).toBeNull();
  });

  it("returns null when the evidence matches no declared entity — never guesses", () => {
    expect(resolveHomonym("slice", ["https://www.linkedin.com/jobs/view/4443289108/"])).toBeNull();
    expect(resolveHomonym("porter", ["https://example.invalid/jobs/1"])).toBeNull();
  });

  it("returns null when there is no evidence at all", () => {
    expect(resolveHomonym("slice", [])).toBeNull();
    expect(resolveHomonym("slice", [null, undefined, "  "])).toBeNull();
  });

  it("returns null for a key that is not a known homonym", () => {
    expect(resolveHomonym("freshworks", ["https://freshworks.com"])).toBeNull();
  });

  it("is not fooled by a bare ATS host without the slug", () => {
    // "jobs.lever.co" alone identifies a platform, not a company.
    expect(resolveHomonym("porter", ["https://jobs.lever.co/someoneelse/abc"])).toBeNull();
  });

  it("matches case-insensitively", () => {
    expect(resolveHomonym("slice", ["HTTPS://SLICE.CAREERS/x"])?.normalizedKey).toBe(
      "slice#slice.careers",
    );
  });
});

describe("disambiguated keys", () => {
  it("can never be produced by ordinary name resolution", () => {
    // identityKey() strips everything outside [a-z0-9&] and spaces, so a
    // scraped name can never collide with a disambiguated key.
    for (const entities of [homonymEntities("slice"), homonymEntities("porter")]) {
      for (const entity of entities) {
        expect(identityKey(entity.canonicalName)).not.toBe(entity.normalizedKey);
        expect(isDisambiguatedKey(entity.normalizedKey)).toBe(true);
      }
    }
  });

  it("reports the shared base key it was derived from", () => {
    expect(homonymBaseKey("slice#sliceit.com")).toBe("slice");
    expect(homonymBaseKey("porter#lever-porter")).toBe("porter");
  });

  it("returns null for a plain key", () => {
    expect(homonymBaseKey("freshworks")).toBeNull();
    expect(isDisambiguatedKey("freshworks")).toBe(false);
  });

  it("returns null for a '#' key whose base is not a declared homonym", () => {
    expect(homonymBaseKey("acme#acme.com")).toBeNull();
  });
});

describe("findHomonymEntity", () => {
  it("round-trips every declared entity by its key", () => {
    for (const base of ["slice", "porter"]) {
      for (const entity of homonymEntities(base)) {
        expect(findHomonymEntity(entity.normalizedKey)).toBe(entity);
      }
    }
  });

  it("returns null for an unknown key", () => {
    expect(findHomonymEntity("nope#nope.com")).toBeNull();
  });
});

// ── Module 11C-1 regression: alias awareness must not reach the homonyms ──
//
// `buildNamePattern` (crawl/verify/boardIdentity.ts) now recognises curated
// company aliases so a renamed company's board is not falsely rejected. That
// widens NAME evidence. Homonym separation deliberately uses no name evidence
// at all — only URL evidence — so it must be completely unaffected. These
// assertions fail loudly if the two mechanisms ever start interacting.

describe("homonym separation is independent of curated-alias name evidence", () => {
  it("keeps splitting Slice by URL evidence alone, with no alias involved", () => {
    expect(curatedNameVariants("Slice").map(identityKey)).toEqual(["slice"]);

    const us = resolveHomonym("slice", ["https://slice.careers/careers-listing?gh_jid=7925845"]);
    const india = resolveHomonym("slice", ["https://careers.kula.ai/slice/50623/apply/"]);
    expect(us?.normalizedKey).toBe("slice#slice.careers");
    expect(india?.normalizedKey).toBe("slice#sliceit.com");
    expect(us?.normalizedKey).not.toBe(india?.normalizedKey);
  });

  it("keeps Porter's US healthcare board off the Indian logistics identity", () => {
    expect(curatedNameVariants("Porter").map(identityKey)).toEqual(["porter"]);

    const entity = resolveHomonym("porter", ["https://jobs.lever.co/porter/abc/apply"]);
    expect(entity?.normalizedKey).toBe("porter#lever-porter");
    expect(entity?.domain).toBeNull();
  });

  it("still refuses to attribute a posting that carries no URL evidence", () => {
    // Identical company NAME, no board evidence — must stay unattributed even
    // though name matching elsewhere in the system has become more generous.
    expect(resolveHomonym("slice", ["https://www.linkedin.com/jobs/view/4438170130/"])).toBeNull();
    expect(resolveHomonym("porter", [])).toBeNull();
  });
});

// ── Module 11C-1 extension: the two mis-attributed Lever boards ──

describe("Zomato / Eternal collision", () => {
  it("attributes the lever/eternal board to the US athletics company, NOT Zomato", () => {
    const entity = resolveHomonym("zomato", [
      "https://jobs.lever.co/eternal/3efb90c7-b877-414e-9f95-36ab6c0a1f5a/apply",
    ]);
    expect(entity?.canonicalName).toBe("Eternal");
    expect(entity?.normalizedKey).toBe("zomato#lever-eternal");
    // Zomato's own domain must never attach to it.
    expect(entity?.domain).toBeNull();
  });

  it("reaches the collision through Zomato's curated rename, not by name alone", () => {
    // "Eternal" resolves to identity key `zomato` via CANONICAL_ALIASES, which
    // is exactly why the two companies collided in the first place.
    expect(resolveCanonicalCompany("Eternal Ltd").normalizedKey).toBe("zomato");
    const entity = resolveCanonicalCompany("Eternal Ltd", null, [
      "https://jobs.lever.co/eternal/abc/apply",
    ]);
    expect(entity.canonicalName).toBe("Eternal");
    expect(entity.normalizedKey).toBe("zomato#lever-eternal");
  });

  it("keeps a genuine Zomato board on Zomato's own identity", () => {
    const entity = resolveHomonym("zomato", ["https://www.zomato.com/careers/openings"]);
    expect(entity?.canonicalName).toBe("Zomato");
    expect(entity?.domain).toBe("zomato.com");
  });

  it("refuses to attribute a Zomato-keyed posting with no board evidence", () => {
    expect(resolveHomonym("zomato", ["https://www.linkedin.com/jobs/view/1/"])).toBeNull();
  });
});

describe("Fi Money / Tetriz collision", () => {
  it("attributes the lever/epifi board to Tetriz, NOT Fi Money", () => {
    const entity = resolveHomonym("fi money", [
      "https://jobs.lever.co/epifi/1b3fb7e6-495d-43ec-a82f-06df53822a09/apply",
    ]);
    expect(entity?.canonicalName).toBe("Tetriz");
    expect(entity?.normalizedKey).toBe("fi money#lever-epifi");
  });

  it("claims NO domain for Tetriz — identity is established, the domain is not", () => {
    expect(findHomonymEntity("fi money#lever-epifi")?.domain).toBeNull();
  });

  it("keeps fi.money reserved for the real Fi Money identity", () => {
    const entity = resolveHomonym("fi money", ["https://fi.money/careers"]);
    expect(entity?.canonicalName).toBe("Fi Money");
    expect(entity?.domain).toBe("fi.money");
  });

  it("routes an Epifi-named posting through the same collision key", () => {
    // Epifi is Fi Money's curated legal-name alias, so a posting scraped as
    // "Epifi" lands on the same key and is separated by URL evidence too.
    expect(resolveCanonicalCompany("Epifi").normalizedKey).toBe("fi money");
    const resolved = resolveCanonicalCompany("Epifi", null, [
      "https://jobs.lever.co/epifi/abc/apply",
    ]);
    expect(resolved.canonicalName).toBe("Tetriz");
    expect(resolved.domain).toBeNull();
  });

  it("is not fooled by the bare lever host without the epifi slug", () => {
    expect(resolveHomonym("fi money", ["https://jobs.lever.co/someoneelse/abc"])).toBeNull();
  });
});
