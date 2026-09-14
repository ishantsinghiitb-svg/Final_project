import { describe, expect, it } from "vitest";
import {
  exactMatchAlternation,
  foreignCityPattern,
  foreignCountryPattern,
  foreignFreeTextPattern,
  foreignLocationExclusions,
  foreignSubdivisionPattern,
  indiaCityPattern,
  indiaDiscoveryFilter,
  indiaFreeTextPattern,
  indiaStatePattern,
  matchesIndiaDiscoveryFilter,
  wordBoundaryAlternation,
} from "./indiaPlaces";

/**
 * Mirrors Postgres's `~*` (case-insensitive regex match, PostgREST's `imatch`)
 * closely enough for unit testing: JS `RegExp` with the `i` flag applies the
 * exact same anchored-alternation pattern the live filter sends to Postgres.
 * This tests the REAL pattern string the production filter builds — not a
 * reimplementation of it — so a regression here is a regression in production.
 */
function matchesCityPattern(value: string): boolean {
  return new RegExp(indiaCityPattern(), "i").test(value);
}
function matchesStatePattern(value: string): boolean {
  return new RegExp(indiaStatePattern(), "i").test(value);
}

describe("2026-09-13 regression: case-insensitive India discovery matching", () => {
  // The exact bug: stored city values are Title Case, the gazetteer is
  // lowercase, and `.in()` (the previous implementation) is case-sensitive —
  // so real rows were invisible on production. These are the literal values
  // pulled from the 19 previously-hidden production rows.
  describe("Title Case values (as ATS platforms actually store them)", () => {
    it("matches 'Bengaluru'", () => expect(matchesCityPattern("Bengaluru")).toBe(true));
    it("matches 'Bangalore'", () => expect(matchesCityPattern("Bangalore")).toBe(true));
    it("matches 'Mumbai'", () => expect(matchesCityPattern("Mumbai")).toBe(true));
    it("matches 'Lucknow'", () => expect(matchesCityPattern("Lucknow")).toBe(true));
    it("matches the Title Case state 'Uttar Pradesh'", () =>
      expect(matchesStatePattern("Uttar Pradesh")).toBe(true));
    it("matches the Title Case state 'Karnataka'", () =>
      expect(matchesStatePattern("Karnataka")).toBe(true));
  });

  describe("lowercase values (the gazetteer's own casing)", () => {
    it("matches 'bengaluru'", () => expect(matchesCityPattern("bengaluru")).toBe(true));
    it("matches 'mumbai'", () => expect(matchesCityPattern("mumbai")).toBe(true));
    it("matches the lowercase state 'karnataka'", () =>
      expect(matchesStatePattern("karnataka")).toBe(true));
  });

  describe("mixed-case and unconventional-case values", () => {
    it("matches 'BENGALURU' (all caps)", () => expect(matchesCityPattern("BENGALURU")).toBe(true));
    it("matches 'bEnGaLuRu' (alternating case)", () =>
      expect(matchesCityPattern("bEnGaLuRu")).toBe(true));
    it("matches 'MuMbAi'", () => expect(matchesCityPattern("MuMbAi")).toBe(true));
    it("matches the state 'TAMIL NADU' (all caps)", () =>
      expect(matchesStatePattern("TAMIL NADU")).toBe(true));
  });

  describe("foreign cities must still be rejected", () => {
    it("rejects 'London'", () => expect(matchesCityPattern("London")).toBe(false));
    it("rejects 'New York'", () => expect(matchesCityPattern("New York")).toBe(false));
    it("rejects 'LONDON' (case does not rescue a non-match)", () =>
      expect(matchesCityPattern("LONDON")).toBe(false));
    it("rejects the foreign state-shaped value 'California'", () =>
      expect(matchesStatePattern("California")).toBe(false));
  });

  describe("ambiguous / unknown values must still be rejected", () => {
    it("rejects an empty string", () => expect(matchesCityPattern("")).toBe(false));
    it("rejects an unlisted place", () => expect(matchesCityPattern("Springfield")).toBe(false));
    it("does not substring-match a real city inside a longer, different place name", () => {
      // Anchored (^...$) — "Bengaluru Rural District" is NOT "Bengaluru" and
      // must not silently pass just because it contains the word.
      expect(matchesCityPattern("Bengaluru Rural District")).toBe(false);
    });
    it("does not let a foreign city ride in on a shared prefix", () => {
      // Guards the anchoring itself, independent of any real gazetteer entry.
      expect(new RegExp(exactMatchAlternation(["pune"]), "i").test("punetown")).toBe(false);
    });
  });

  describe("exactMatchAlternation", () => {
    it("anchors both ends", () => {
      const pattern = exactMatchAlternation(["mumbai", "pune"]);
      expect(pattern.startsWith("^(")).toBe(true);
      expect(pattern.endsWith(")$")).toBe(true);
    });

    it("escapes regex metacharacters in a value", () => {
      const pattern = exactMatchAlternation(["st. xyz"]);
      expect(new RegExp(pattern, "i").test("st. xyz")).toBe(true);
      // An unescaped "." would also match "stAxyz" (any character) — the
      // escaped version must not.
      expect(new RegExp(pattern, "i").test("stAxyz")).toBe(false);
    });
  });
});

describe("indiaDiscoveryFilter — the full production filter string", () => {
  it("uses imatch (case-insensitive), never the case-sensitive in.() operator, for city/state/country", () => {
    const filter = indiaDiscoveryFilter();
    expect(filter).toContain("city.imatch.");
    expect(filter).toContain("state.imatch.");
    expect(filter).toContain("country.imatch.");
    expect(filter).not.toMatch(/city\.in\.\(/);
    expect(filter).not.toMatch(/state\.in\.\(/);
    expect(filter).not.toMatch(/country\.in\.\(/);
  });

  it("matches the free-text word 'india'/'bharat' via a WORD-BOUNDARY pattern, never a blind substring", () => {
    // 2026-09-14 fix: `location.ilike.*india*` / `city.ilike.*india*` were
    // replaced — a blind substring check also matches "Indianapolis" and
    // "Indiana", neither of which is India. See the describe block below for
    // the full regression coverage; this just pins the filter string shape.
    const filter = indiaDiscoveryFilter();
    expect(filter).not.toContain("ilike.*india*");
    expect(filter).toContain("location.imatch.");
    expect(filter).toContain("city.imatch.");
    // The word-boundary pattern itself, embedded in the filter string.
    expect(filter).toContain("\\y(india|bharat)\\y");
  });

  it("is shorter than a naive case-doubled .in() list would be (compactness check)", () => {
    // Not a hard requirement, just documents the improvement the regex
    // rewrite produces over enumerating casings.
    expect(indiaDiscoveryFilter().length).toBeLessThan(3000);
  });
});

// ── 2026-09-14 fix: the India/Indianapolis substring collision ──
//
// `matchesIndiaDiscoveryFilter` is a pure, in-process mirror of the FULL
// two-sided rule the Jobs page applies: `indiaDiscoveryFilter()`'s India-
// signal OR-group AND NOT any of `foreignLocationExclusions()`. This is what
// "actual Jobs page discovery behaviour" means for a row that never touches
// a database: it is built from, and tested against, the exact same pattern
// functions `JobRepository.applyDiscoveryVisibility` calls in production —
// not a re-implementation with its own logic that could quietly drift.
//
// Every PASS/FAIL case below is constructed the way a REAL captured row
// would actually populate city/state/country/location — e.g. "Hyderabad,
// Pakistan" is `{ city: "Hyderabad", country: "Pakistan" }`, not a single
// opaque string, because that is what a structured capture (JSON-LD address,
// a parsed top-card line) produces. Where a case is genuinely just free text
// with no structured split (a manual entry, an ambiguous 2-part string), the
// `location` field alone carries it, exactly as it would for a real
// unparsed capture.
describe("matchesIndiaDiscoveryFilter — the substring-collision fix (2026-09-14)", () => {
  describe("PASS — genuine India locations remain visible", () => {
    it("Mumbai (bare city)", () => {
      expect(matchesIndiaDiscoveryFilter({ city: "Mumbai" })).toBe(true);
    });
    it("Mumbai, India", () => {
      expect(
        matchesIndiaDiscoveryFilter({
          location: "Mumbai, India",
          city: "Mumbai",
          country: "India",
        }),
      ).toBe(true);
    });
    it("Bengaluru (bare city)", () => {
      expect(matchesIndiaDiscoveryFilter({ city: "Bengaluru" })).toBe(true);
    });
    it("Bengaluru, India", () => {
      expect(
        matchesIndiaDiscoveryFilter({
          location: "Bengaluru, India",
          city: "Bengaluru",
          country: "India",
        }),
      ).toBe(true);
    });
    it("Delhi (bare city)", () => {
      expect(matchesIndiaDiscoveryFilter({ city: "Delhi" })).toBe(true);
    });
    it("Delhi, India", () => {
      expect(
        matchesIndiaDiscoveryFilter({ location: "Delhi, India", city: "Delhi", country: "India" }),
      ).toBe(true);
    });
    it("Hyderabad, India (the homonym city, with its real country attached)", () => {
      expect(
        matchesIndiaDiscoveryFilter({
          location: "Hyderabad, India",
          city: "Hyderabad",
          country: "India",
        }),
      ).toBe(true);
    });
    it("Remote, India", () => {
      expect(matchesIndiaDiscoveryFilter({ location: "Remote, India" })).toBe(true);
    });
    it("India (Remote)", () => {
      expect(matchesIndiaDiscoveryFilter({ location: "India (Remote)" })).toBe(true);
    });
    it("a state alone: Karnataka", () => {
      expect(matchesIndiaDiscoveryFilter({ state: "Karnataka" })).toBe(true);
    });
    it("country alone: India", () => {
      expect(matchesIndiaDiscoveryFilter({ country: "India" })).toBe(true);
    });
    it("country alone: the ISO code IN", () => {
      expect(matchesIndiaDiscoveryFilter({ country: "IN" })).toBe(true);
    });
  });

  describe("FAIL — the Indianapolis/Indiana substring collision must never read as India", () => {
    it("Indianapolis (bare city)", () => {
      expect(matchesIndiaDiscoveryFilter({ city: "Indianapolis" })).toBe(false);
    });
    it("Indianapolis, Indiana", () => {
      expect(
        matchesIndiaDiscoveryFilter({
          location: "Indianapolis, Indiana",
          city: "Indianapolis",
          state: "Indiana",
        }),
      ).toBe(false);
    });
    it("Indianapolis, IN", () => {
      expect(
        matchesIndiaDiscoveryFilter({
          location: "Indianapolis, IN",
          city: "Indianapolis",
          state: "IN",
        }),
      ).toBe(false);
    });
    it("Indiana (bare state)", () => {
      expect(matchesIndiaDiscoveryFilter({ state: "Indiana" })).toBe(false);
    });
    it("Indiana, USA", () => {
      expect(
        matchesIndiaDiscoveryFilter({ location: "Indiana, USA", state: "Indiana", country: "USA" }),
      ).toBe(false);
    });
    it("Indianapolis, Indiana, USA", () => {
      expect(
        matchesIndiaDiscoveryFilter({
          location: "Indianapolis, Indiana, USA",
          city: "Indianapolis",
          state: "Indiana",
          country: "USA",
        }),
      ).toBe(false);
    });
  });

  describe("FAIL — homonym cities that are genuinely NOT India once another field names a foreign place", () => {
    it("Hyderabad, Pakistan — Hyderabad is a real Indian city, but this one is not", () => {
      expect(
        matchesIndiaDiscoveryFilter({
          location: "Hyderabad, Pakistan",
          city: "Hyderabad",
          country: "Pakistan",
        }),
      ).toBe(false);
    });
    it("Salem, Oregon — Salem is a real Tamil Nadu city, but this one is not", () => {
      expect(
        matchesIndiaDiscoveryFilter({
          location: "Salem, Oregon",
          city: "Salem",
          state: "Oregon",
        }),
      ).toBe(false);
    });
    it("Salem, Oregon, USA", () => {
      expect(
        matchesIndiaDiscoveryFilter({
          location: "Salem, Oregon, USA",
          city: "Salem",
          state: "Oregon",
          country: "USA",
        }),
      ).toBe(false);
    });
    it("Mumbai, New York — a real India city name beside a foreign place in the same free text", () => {
      expect(matchesIndiaDiscoveryFilter({ location: "Mumbai, New York", city: "Mumbai" })).toBe(
        false,
      );
    });
  });

  describe("FAIL — ambiguous mixed-scope free text naming both India and a foreign place", () => {
    it("India / US", () => {
      expect(matchesIndiaDiscoveryFilter({ location: "India / US" })).toBe(false);
    });
    it("India / United States", () => {
      expect(matchesIndiaDiscoveryFilter({ location: "India / United States" })).toBe(false);
    });
  });

  describe("FAIL — locations with no India signal at all (unrelated to the substring bug, still must not regress)", () => {
    it("London, United Kingdom", () => {
      expect(
        matchesIndiaDiscoveryFilter({
          location: "London, United Kingdom",
          city: "London",
          country: "United Kingdom",
        }),
      ).toBe(false);
    });
    it("an empty/unknown location", () => {
      expect(matchesIndiaDiscoveryFilter({})).toBe(false);
    });
  });

  describe("casing and punctuation variants", () => {
    it("is fully case-insensitive on both sides of the rule", () => {
      expect(matchesIndiaDiscoveryFilter({ city: "MUMBAI" })).toBe(true);
      expect(matchesIndiaDiscoveryFilter({ city: "mUmBaI" })).toBe(true);
      expect(matchesIndiaDiscoveryFilter({ city: "INDIANAPOLIS" })).toBe(false);
      expect(
        matchesIndiaDiscoveryFilter({
          city: "hyderabad",
          country: "PAKISTAN",
        }),
      ).toBe(false);
      expect(
        matchesIndiaDiscoveryFilter({
          city: "Salem",
          state: "oregon",
        }),
      ).toBe(false);
    });

    it("is robust to punctuation around the India word in free text", () => {
      expect(matchesIndiaDiscoveryFilter({ location: "India, Remote" })).toBe(true);
      expect(matchesIndiaDiscoveryFilter({ location: "(India)" })).toBe(true);
      expect(matchesIndiaDiscoveryFilter({ location: "India." })).toBe(true);
      expect(matchesIndiaDiscoveryFilter({ location: "India/Remote" })).toBe(true);
      expect(matchesIndiaDiscoveryFilter({ location: "Remote - India" })).toBe(true);
    });

    it("does not let punctuation turn Indianapolis/Indiana into a match", () => {
      expect(matchesIndiaDiscoveryFilter({ location: "(Indianapolis)" })).toBe(false);
      expect(matchesIndiaDiscoveryFilter({ location: "Indianapolis." })).toBe(false);
      expect(matchesIndiaDiscoveryFilter({ location: "Indianapolis/Remote" })).toBe(false);
      expect(matchesIndiaDiscoveryFilter({ city: "Indianapolis," })).toBe(false);
    });
  });
});

describe("pattern builders behind the two-sided rule", () => {
  // ⚠️ `wordBoundaryAlternation`/`indiaFreeTextPattern`/`foreignFreeTextPattern`
  // produce POSTGRES-flavored patterns (`\y` word boundaries — Postgres ARE
  // syntax). JavaScript's RegExp does not understand `\y` at all (it is
  // treated as a literal "y", not a word boundary), so these three are tested
  // here only for their STRING SHAPE — the actual matching BEHAVIOUR these
  // patterns produce is exercised through `matchesIndiaDiscoveryFilter`
  // (above), which uses the separate, JS-flavored `\b` variant built from the
  // exact same word lists. Executing a `\y` pattern through `new RegExp(...)`
  // to assert behaviour would be testing the wrong regex dialect — this is
  // the actual mistake this file's own first draft made, caught by these
  // tests failing when they should have passed.
  it("wordBoundaryAlternation produces a Postgres-flavored (\\y) word-boundary pattern", () => {
    const pattern = wordBoundaryAlternation(["india", "bharat"]);
    expect(pattern).toBe("\\y(india|bharat)\\y");
  });

  it("indiaFreeTextPattern is word-boundary anchored and excludes the bare word 'in'", () => {
    const pattern = indiaFreeTextPattern();
    expect(pattern).toBe("\\y(india|bharat)\\y");
    expect(pattern).not.toContain("|in|");
    expect(pattern).not.toMatch(/\(in\|/);
  });

  it("foreignCountryPattern rejects real foreign country names/codes exactly", () => {
    const pattern = new RegExp(foreignCountryPattern(), "i");
    expect(pattern.test("Pakistan")).toBe(true);
    expect(pattern.test("USA")).toBe(true);
    expect(pattern.test("United States")).toBe(true);
    expect(pattern.test("India")).toBe(false);
  });

  it("foreignCityPattern rejects real foreign cities exactly, including the Mumbai/New York case", () => {
    const pattern = new RegExp(foreignCityPattern(), "i");
    expect(pattern.test("New York")).toBe(true);
    expect(pattern.test("London")).toBe(true);
    expect(pattern.test("Mumbai")).toBe(false);
  });

  it("foreignSubdivisionPattern rejects Oregon (the Salem homonym case) and global-scope tokens", () => {
    const pattern = new RegExp(foreignSubdivisionPattern(), "i");
    expect(pattern.test("Oregon")).toBe(true);
    expect(pattern.test("Indiana")).toBe(true);
    expect(pattern.test("Worldwide")).toBe(true);
    expect(pattern.test("Karnataka")).toBe(false);
  });

  it("foreignFreeTextPattern is word-boundary anchored over countries+cities+subdivisions+global-scope", () => {
    const pattern = foreignFreeTextPattern();
    expect(pattern.startsWith("\\y(")).toBe(true);
    expect(pattern.endsWith(")\\y")).toBe(true);
    // Spot-check a member from each of the four contributing lists is present.
    expect(pattern).toContain("pakistan");
    expect(pattern).toContain("new york");
    expect(pattern).toContain("oregon");
    expect(pattern).toContain("worldwide");
  });

  it("foreignLocationExclusions returns one NULL-SAFE .or() clause per column, never a bare negated match", () => {
    // Regression pin for the live bug this fix caught: a bare
    // `column.not.imatch.pattern` (no `column.is.null` escape hatch) drops
    // every row with a NULL in that column, foreign or not — verified live
    // against production, where it wrongly hid 118 of 319 genuine India
    // rows. Every clause here MUST include the `.is.null` half.
    const clauses = foreignLocationExclusions();
    expect(clauses).toHaveLength(4);
    const columns = ["country", "city", "state", "location"];
    for (const column of columns) {
      const clause = clauses.find((c) => c.startsWith(`${column}.is.null,`));
      expect(clause, `expected a null-safe clause for "${column}"`).toBeDefined();
      expect(clause).toContain(`${column}.not.imatch.`);
    }
  });
});
