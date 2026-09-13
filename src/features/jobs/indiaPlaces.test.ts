import { describe, expect, it } from "vitest";
import {
  exactMatchAlternation,
  indiaCityPattern,
  indiaDiscoveryFilter,
  indiaStatePattern,
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

  it("still includes the free-text 'india' substring clauses", () => {
    const filter = indiaDiscoveryFilter();
    expect(filter).toContain("location.ilike.*india*");
    expect(filter).toContain("city.ilike.*india*");
  });

  it("is shorter than a naive case-doubled .in() list would be (compactness check)", () => {
    // Not a hard requirement, just documents the improvement the regex
    // rewrite produces over enumerating casings.
    expect(indiaDiscoveryFilter().length).toBeLessThan(3000);
  });
});
