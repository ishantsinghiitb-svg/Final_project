import { describe, expect, it } from "vitest";
import { normalizeCompanyName, sqlNormalizeCompanyName } from "./company";

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

// ── Module 11C-1 ──
describe("sqlNormalizeCompanyName", () => {
  it("reproduces the SQL helper's lowercase + punctuation + whitespace handling", () => {
    expect(sqlNormalizeCompanyName("Google, Inc.")).toBe("google");
    expect(sqlNormalizeCompanyName("  Acme   Robotics  ")).toBe("acme robotics");
    expect(sqlNormalizeCompanyName("Eternal")).toBe("eternal");
    expect(sqlNormalizeCompanyName("Tetriz")).toBe("tetriz");
  });

  it("strips exactly ONE trailing legal suffix, like the SQL regex does", () => {
    expect(sqlNormalizeCompanyName("Razorpay Software Private Limited")).toBe("razorpay software");
    expect(sqlNormalizeCompanyName("Foo Ltd")).toBe("foo");
  });

  it("does NOT apply the curated alias table — that is normalizeCompanyName's job", () => {
    // Decisive: this must agree with the DATABASE, not with the richer TS
    // resolver, or global_jobs.normalized_company would drift from every row
    // the ingest RPC writes.
    expect(sqlNormalizeCompanyName("Amazon Jobs")).toBe("amazon jobs");
    expect(normalizeCompanyName("Amazon Jobs").canonicalName).toBe("Amazon");
  });

  it("does not strip careers-site noise words the way normalizeCompanyName does", () => {
    expect(sqlNormalizeCompanyName("Google Careers")).toBe("google careers");
    expect(normalizeCompanyName("Google Careers").canonicalName).toBe("Google");
  });

  it("handles empty input", () => {
    expect(sqlNormalizeCompanyName("")).toBe("");
    expect(sqlNormalizeCompanyName(null)).toBe("");
  });
});
