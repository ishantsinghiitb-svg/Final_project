import { describe, expect, it } from "vitest";
import { normalizeLocationText } from "./location";

describe("normalizeLocationText", () => {
  it("lowercases and collapses whitespace", () => {
    expect(normalizeLocationText("  San   Francisco, CA  ")).toBe("san francisco, ca");
  });

  it("returns null for empty/whitespace-only input", () => {
    expect(normalizeLocationText("")).toBeNull();
    expect(normalizeLocationText("   ")).toBeNull();
    expect(normalizeLocationText(null)).toBeNull();
    expect(normalizeLocationText(undefined)).toBeNull();
  });

  it("two differently-cased/spaced inputs converge", () => {
    expect(normalizeLocationText("Bangalore")).toBe(normalizeLocationText("  bangalore  "));
  });
});
