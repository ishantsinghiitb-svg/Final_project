import { describe, expect, it } from "vitest";
import { isRegionRelevant, regionExclusionReason, type RegionRelevance } from "./regionRelevance";

function relevance(
  classification: RegionRelevance["classification"],
  restrictedTo: string | null = null,
): RegionRelevance {
  return { classification, restrictedTo };
}

describe("isRegionRelevant", () => {
  it("allows india", () => {
    expect(isRegionRelevant(relevance("india"))).toBe(true);
  });

  it("allows worldwide", () => {
    expect(isRegionRelevant(relevance("worldwide"))).toBe(true);
  });

  it("allows unrestricted", () => {
    expect(isRegionRelevant(relevance("unrestricted"))).toBe(true);
  });

  it("excludes restricted_non_india", () => {
    expect(isRegionRelevant(relevance("restricted_non_india", "United States of America"))).toBe(
      false,
    );
  });
});

describe("regionExclusionReason", () => {
  it("names the restriction verbatim", () => {
    expect(regionExclusionReason(relevance("restricted_non_india", "United Kingdom"))).toBe(
      "Explicitly restricted to United Kingdom.",
    );
  });

  it("falls back to a generic reason when no restriction text is available", () => {
    expect(regionExclusionReason(relevance("restricted_non_india", null))).toBe(
      "Explicitly restricted to a region that excludes India.",
    );
  });
});
