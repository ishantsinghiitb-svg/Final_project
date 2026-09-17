import { describe, expect, it } from "vitest";
import { matchTaxonomy, TAXONOMY } from "./roleTaxonomy";

describe("matchTaxonomy word-boundary correctness", () => {
  it("does not match a short acronym inside an unrelated longer word", () => {
    expect(matchTaxonomy("Global Airline Operations Associate").some((m) => m.label === "AI")).toBe(
      false,
    );
  });

  it("does match a short acronym as its own word", () => {
    expect(matchTaxonomy("AI Research Lead").some((m) => m.label === "AI Research")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(matchTaxonomy("product manager").some((m) => m.label === "Product Manager")).toBe(true);
    expect(matchTaxonomy("PRODUCT MANAGER").some((m) => m.label === "Product Manager")).toBe(true);
  });

  it("matches a multi-word phrase with flexible internal whitespace", () => {
    expect(matchTaxonomy("Full  Stack   Engineer").some((m) => m.label === "Full Stack")).toBe(
      true,
    );
  });

  it("does not match a low-signal compound phrase from its parts alone", () => {
    // "Field Sales Executive" must not fire on a title that only shares one word with it.
    const matches = matchTaxonomy("Field Marketing Manager");
    expect(matches.some((m) => m.label === "Field Sales Executive")).toBe(false);
  });

  it("empty/blank text matches nothing", () => {
    expect(matchTaxonomy("")).toEqual([]);
  });

  it("every taxonomy entry has a non-empty label and a finite non-zero weight", () => {
    for (const entry of TAXONOMY) {
      expect(entry.label.length).toBeGreaterThan(0);
      expect(Number.isFinite(entry.weight)).toBe(true);
      expect(entry.weight).not.toBe(0);
    }
  });
});
