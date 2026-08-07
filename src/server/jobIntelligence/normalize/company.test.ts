import { describe, expect, it } from "vitest";
import { normalizeCompanyName } from "./company";

describe("normalizeCompanyName", () => {
  it("resolves curated aliases (task examples)", () => {
    expect(normalizeCompanyName("Google Careers").canonicalName).toBe("Google");
    expect(normalizeCompanyName("Meta Recruiting").canonicalName).toBe("Meta");
    expect(normalizeCompanyName("Amazon.jobs").canonicalName).toBe("Amazon");
    expect(normalizeCompanyName("Groww Invest Tech").canonicalName).toBe("Groww");
  });

  it("is case-insensitive for aliases", () => {
    expect(normalizeCompanyName("google careers").canonicalName).toBe("Google");
    expect(normalizeCompanyName("GOOGLE CAREERS").canonicalName).toBe("Google");
  });

  it("strips common legal suffixes", () => {
    expect(normalizeCompanyName("Acme Inc.").canonicalName).toBe("Acme");
    expect(normalizeCompanyName("Acme, LLC").canonicalName).toBe("Acme");
    expect(normalizeCompanyName("Acme Pvt Ltd").canonicalName).toBe("Acme");
    expect(normalizeCompanyName("Acme Private Limited").canonicalName).toBe("Acme");
  });

  it("strips careers-site noise words not covered by an alias", () => {
    expect(normalizeCompanyName("Some Startup Careers").canonicalName).toBe("Some Startup");
    expect(normalizeCompanyName("Some Startup Recruiting").canonicalName).toBe("Some Startup");
  });

  it("never strips down to an empty string for a single-word noise-only company", () => {
    const result = normalizeCompanyName("Careers");
    expect(result.canonicalName).toBe("Careers");
  });

  it("preserves the original input untouched", () => {
    const result = normalizeCompanyName("  Google Careers  ");
    expect(result.original).toBe("  Google Careers  ");
  });

  it("produces a lowercase matching key equal to canonicalName.toLowerCase()", () => {
    const result = normalizeCompanyName("Acme Inc.");
    expect(result.key).toBe(result.canonicalName.toLowerCase());
  });

  it("handles empty input gracefully", () => {
    const result = normalizeCompanyName("");
    expect(result.canonicalName).toBe("");
    expect(result.key).toBe("");
  });

  it("two differently-formatted inputs for the same company converge to the same key", () => {
    const a = normalizeCompanyName("Acme Inc.");
    const b = normalizeCompanyName("ACME, LLC");
    expect(a.key).toBe(b.key);
  });
});
