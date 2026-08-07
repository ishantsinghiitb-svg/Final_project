import { describe, expect, it } from "vitest";
import { normalizeRoleTitle } from "./role";

describe("normalizeRoleTitle", () => {
  it("maps Internship -> Intern consistently (task examples)", () => {
    expect(normalizeRoleTitle("Product Internship").normalized).toBe("Product Intern");
    expect(normalizeRoleTitle("Product Intern").normalized).toBe("Product Intern");
  });

  it("preserves a genuinely different title while still canonicalizing it", () => {
    const result = normalizeRoleTitle("Product Management Intern");
    expect(result.normalized).toBe("Product Management Intern");
    expect(result.normalized).not.toBe(normalizeRoleTitle("Product Intern").normalized);
  });

  it("always preserves the original input untouched", () => {
    const result = normalizeRoleTitle("  Product Internship  ");
    expect(result.original).toBe("  Product Internship  ");
  });

  it("removes noise words consistently", () => {
    const result = normalizeRoleTitle("Product Manager Position");
    expect(result.normalized).toBe("Product Manager");
  });

  it("collapses common abbreviations", () => {
    expect(normalizeRoleTitle("Sr Software Eng").normalized).toBe("Senior Software Engineer");
  });

  it("is case-insensitive going in, Title Case coming out", () => {
    expect(normalizeRoleTitle("PRODUCT INTERNSHIP").normalized).toBe("Product Intern");
    expect(normalizeRoleTitle("product internship").normalized).toBe("Product Intern");
  });

  it("token list is lowercase and deduplicated", () => {
    const result = normalizeRoleTitle("Senior Senior Engineer");
    expect(result.tokens).toEqual(["senior", "engineer"]);
  });

  it("falls back to the trimmed original when every token is noise", () => {
    const result = normalizeRoleTitle("The Position");
    expect(result.normalized).toBe("The Position");
  });
});
