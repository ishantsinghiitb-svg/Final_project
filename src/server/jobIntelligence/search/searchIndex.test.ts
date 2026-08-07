import { describe, expect, it } from "vitest";
import { buildSearchIndexDocument } from "./searchIndex";
import type { NormalizedJobPosting } from "../types";

function makeNormalized(overrides: Partial<NormalizedJobPosting> = {}): NormalizedJobPosting {
  return {
    source: "test-platform",
    companyName: "Google Careers",
    role: "Product Internship",
    normalizedCompany: "Google",
    normalizedRole: "Product Intern",
    normalizedLocation: "bangalore",
    fingerprint: "fp-1",
    parserVersion: "test-1",
    city: "Bangalore",
    skills: ["React", "TypeScript"],
    tags: ["urgent-hiring"],
    description: "Build delightful product experiences.",
    employmentType: "Internship",
    experienceLevel: "Intern",
    ...overrides,
  };
}

describe("buildSearchIndexDocument", () => {
  it("indexes every required field from the search strategy (role, company, skills, tags, location, employment, experience, description)", () => {
    const doc = buildSearchIndexDocument("job-1", makeNormalized());

    expect(doc.jobId).toBe("job-1");
    expect(doc.originalRole).toBe("Product Internship");
    expect(doc.normalizedRole).toBe("Product Intern");
    expect(doc.company).toBe("Google Careers");
    expect(doc.normalizedCompany).toBe("Google");
    expect(doc.skills).toEqual(["React", "TypeScript"]);
    expect(doc.tags).toEqual(["urgent-hiring"]);
    expect(doc.location).toContain("Bangalore");
    expect(doc.employmentType).toBe("Internship");
    expect(doc.experienceLevel).toBe("Intern");
    expect(doc.description).toContain("delightful");
  });

  it("searchText contains lowercase tokens drawn from every indexed field", () => {
    const doc = buildSearchIndexDocument("job-1", makeNormalized());
    expect(doc.searchText).toContain("google");
    expect(doc.searchText).toContain("intern");
    expect(doc.searchText).toContain("react");
    expect(doc.searchText).toContain("bangalore");
    expect(doc.searchText).toContain("delightful");
  });

  it("technologies are folded into the skills field alongside explicit skills", () => {
    const doc = buildSearchIndexDocument(
      "job-1",
      makeNormalized({ skills: [], technologies: ["Kubernetes"] }),
    );
    expect(doc.skills).toEqual(["Kubernetes"]);
  });

  it("handles a posting with no optional fields without throwing", () => {
    const minimal = makeNormalized({
      skills: undefined,
      technologies: undefined,
      tags: undefined,
      description: undefined,
      city: undefined,
      state: undefined,
      country: undefined,
      location: undefined,
      employmentType: undefined,
      experienceLevel: undefined,
    });
    const doc = buildSearchIndexDocument("job-2", minimal);
    expect(doc.skills).toEqual([]);
    expect(doc.tags).toEqual([]);
    expect(doc.searchText.length).toBeGreaterThan(0);
  });
});
