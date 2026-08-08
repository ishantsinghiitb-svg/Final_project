import { describe, expect, it } from "vitest";
import { loadRegistryCandidates, type RegistryCandidate } from "./registryLoader";

function candidate(overrides: Partial<RegistryCandidate> & { name: string }): RegistryCandidate {
  return {
    careersUrl: "https://boards.greenhouse.io/x",
    platform: "career-pages",
    ...overrides,
  };
}

describe("loadRegistryCandidates — duplicate prevention", () => {
  it("collapses two names for the same entity on the same platform", () => {
    const result = loadRegistryCandidates([
      candidate({ name: "Groww" }),
      candidate({ name: "Groww Invest Tech" }),
    ]);

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].companyName).toBe("Groww");
    expect(result.duplicates).toEqual([
      { name: "Groww Invest Tech", mergedInto: "Groww", platform: "career-pages" },
    ]);
  });

  it("keeps the duplicate's names as aliases so the row stays findable", () => {
    const result = loadRegistryCandidates([
      candidate({ name: "Honasa Consumer" }),
      candidate({ name: "Mamaearth" }),
    ]);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].aliases).toContain("Mamaearth");
  });

  it("never lists the canonical name as one of its own aliases", () => {
    const result = loadRegistryCandidates([
      candidate({ name: "Zomato" }),
      candidate({ name: "Eternal" }),
    ]);
    expect(result.rows[0].aliases).not.toContain("Zomato");
  });

  it("allows the same company on two DIFFERENT platforms", () => {
    const result = loadRegistryCandidates([
      candidate({ name: "Acme", platform: "career-pages" }),
      candidate({ name: "Acme", platform: "weworkremotely" }),
    ]);
    expect(result.rows).toHaveLength(2);
    expect(result.duplicates).toHaveLength(0);
  });

  it("keeps the FIRST candidate's URL when collapsing", () => {
    const result = loadRegistryCandidates([
      candidate({ name: "Groww", careersUrl: "https://first.test" }),
      candidate({ name: "Groww Invest Tech", careersUrl: "https://second.test" }),
    ]);
    expect(result.rows[0].careersUrl).toBe("https://first.test");
  });
});

describe("loadRegistryCandidates — parent/subsidiary", () => {
  it("keeps a subsidiary as its own row and records the parent", () => {
    const result = loadRegistryCandidates([
      candidate({ name: "Zomato" }),
      candidate({ name: "Blinkit", careersUrl: "https://blinkit.test" }),
    ]);

    expect(result.rows).toHaveLength(2);
    expect(result.duplicates).toHaveLength(0);
    const blinkit = result.rows.find((row) => row.companyName === "Blinkit");
    expect(blinkit?.parentCompany).toBe("Zomato");
  });

  it("keeps every Info Edge property separate", () => {
    const result = loadRegistryCandidates([
      candidate({ name: "Naukri.com / Info Edge", careersUrl: "https://a.test" }),
      candidate({ name: "99acres / Info Edge", careersUrl: "https://b.test" }),
      candidate({ name: "Jeevansathi / Info Edge", careersUrl: "https://c.test" }),
    ]);

    expect(result.rows).toHaveLength(3);
    for (const row of result.rows) {
      expect(row.parentCompany).toBe("Info Edge");
    }
  });

  it("does not treat a subsidiary as a duplicate of its parent", () => {
    const result = loadRegistryCandidates([
      candidate({ name: "Reliance Industries" }),
      candidate({ name: "Reliance Retail", careersUrl: "https://b.test" }),
      candidate({ name: "AJIO", careersUrl: "https://c.test" }),
    ]);
    expect(result.rows).toHaveLength(3);
  });
});

describe("loadRegistryCandidates — output shape", () => {
  it("carries notes and config through", () => {
    const result = loadRegistryCandidates([
      candidate({ name: "Acme", notes: "Greenhouse board.", config: { ats: "greenhouse" } }),
    ]);
    expect(result.rows[0].notes).toBe("Greenhouse board.");
    expect(result.rows[0].config).toEqual({ ats: "greenhouse" });
  });

  it("defaults notes to null and config to an empty object", () => {
    const result = loadRegistryCandidates([candidate({ name: "Acme" })]);
    expect(result.rows[0].notes).toBeNull();
    expect(result.rows[0].config).toEqual({});
  });

  it("preserves input order", () => {
    const result = loadRegistryCandidates([
      candidate({ name: "Bravo" }),
      candidate({ name: "Alpha" }),
    ]);
    expect(result.rows.map((row) => row.companyName)).toEqual(["Bravo", "Alpha"]);
  });

  it("handles an empty list", () => {
    expect(loadRegistryCandidates([])).toEqual({ rows: [], duplicates: [] });
  });

  it("produces rows that satisfy the DB unique index (lower(company_name), platform)", () => {
    const result = loadRegistryCandidates([
      candidate({ name: "Acme" }),
      candidate({ name: "ACME" }),
      candidate({ name: "acme" }),
      candidate({ name: "Acme", platform: "weworkremotely" }),
    ]);

    const keys = result.rows.map((row) => `${row.companyName.toLowerCase()}::${row.platform}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect(result.rows).toHaveLength(2);
  });
});
