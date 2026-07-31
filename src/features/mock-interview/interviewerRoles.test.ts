import { describe, expect, it } from "vitest";
import {
  INTERVIEWER_ROLES,
  interviewerRolesFor,
  resolveRoleFamily,
  suggestedRoleFor,
} from "./interviewerRoles";

describe("resolveRoleFamily", () => {
  it("classifies a software engineering role", () => {
    expect(resolveRoleFamily("Senior Software Engineer", "")).toBe("engineering");
  });

  it("classifies a product management role", () => {
    expect(resolveRoleFamily("Product Manager", "")).toBe("product");
  });

  it("classifies a marketing role", () => {
    expect(resolveRoleFamily("Growth Marketing Lead", "")).toBe("marketing");
  });

  it("falls back to general for an unrecognized title with no job description signal", () => {
    expect(resolveRoleFamily("Chief Vibes Officer", "")).toBe("general");
  });

  it("uses the job description as a secondary signal", () => {
    expect(
      resolveRoleFamily("Team Lead", "We need a strong data scientist for our ML platform"),
    ).toBe("data");
  });
});

describe("interviewerRolesFor", () => {
  it("returns a non-empty ordered list for every known family", () => {
    const families = [
      "product",
      "engineering",
      "data",
      "design",
      "marketing",
      "sales",
      "finance",
      "operations",
      "hr",
      "consulting",
      "general",
    ] as const;
    for (const family of families) {
      const roles = interviewerRolesFor(family, "");
      expect(roles.length).toBeGreaterThan(0);
    }
  });

  it("pre-selects HR Recruiter for an HR round, but keeps it changeable", () => {
    const roles = interviewerRolesFor("engineering", "HR Round");
    expect(roles[0].id).toBe("hr_recruiter");
    // Still changeable: every other engineering-family role remains in the list.
    expect(roles.some((r) => r.id === "engineering_manager")).toBe(true);
  });

  it("suggests the Hiring Manager round match over an unrelated first entry", () => {
    const roles = interviewerRolesFor("product", "Hiring Manager");
    expect(roles[0].id).toBe("hiring_manager");
  });

  it("never duplicates a role across the returned list", () => {
    for (const family of ["product", "engineering", "general"] as const) {
      const roles = interviewerRolesFor(family, "Technical Round");
      const ids = roles.map((r) => r.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});

describe("suggestedRoleFor", () => {
  it("always returns a defined role, never undefined", () => {
    expect(suggestedRoleFor("general", "")).toBeDefined();
  });
});

describe("INTERVIEWER_ROLES catalogue", () => {
  it("gives every role a unique id", () => {
    const ids = INTERVIEWER_ROLES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("gives every role at least one family and one brief objective", () => {
    for (const role of INTERVIEWER_ROLES) {
      expect(role.families.length).toBeGreaterThan(0);
      expect(role.brief.objectives.length).toBeGreaterThan(0);
    }
  });
});
