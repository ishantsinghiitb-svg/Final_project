import { describe, expect, it } from "vitest";
import {
  computeDeterministicResumeMatch,
  matchResumeToJob,
  type DeterministicMatchInput,
} from "./DeterministicResumeMatch";
import type { StructuredResume } from "@/features/ai/schemas";

describe("computeDeterministicResumeMatch", () => {
  it("scores a perfect skill match at 100", () => {
    const input: DeterministicMatchInput = {
      resumeSkills: ["React", "TypeScript", "Node.js"],
      resumeText: "Built products using React, TypeScript and Node.js.",
      jobSkills: ["React", "TypeScript", "Node.js"],
      jobKeywordText: "",
    };
    const result = computeDeterministicResumeMatch(input);
    expect(result.matchPercentage).toBe(100);
    expect(result.matchedSkills).toEqual(["react", "typescript", "node.js"]);
    expect(result.missingSkills).toEqual([]);
  });

  it("scores zero when nothing matches and no signal exists", () => {
    const result = computeDeterministicResumeMatch({
      resumeSkills: [],
      resumeText: "",
      jobSkills: [],
      jobKeywordText: "",
    });
    expect(result.matchPercentage).toBe(0);
    expect(result.matchedSkills).toEqual([]);
    expect(result.missingSkills).toEqual([]);
    expect(result.matchedKeywords).toEqual([]);
  });

  it("identifies missing skills the resume doesn't cover", () => {
    const result = computeDeterministicResumeMatch({
      resumeSkills: ["Python"],
      resumeText: "Data pipelines in Python.",
      jobSkills: ["Python", "Kubernetes", "AWS"],
      jobKeywordText: "",
    });
    expect(result.matchedSkills).toEqual(["python"]);
    expect(result.missingSkills).toEqual(["kubernetes", "aws"]);
    expect(result.matchPercentage).toBeGreaterThan(0);
    expect(result.matchPercentage).toBeLessThan(100);
  });

  it("matches a skill mentioned in resume free text even if absent from the explicit skills list", () => {
    const result = computeDeterministicResumeMatch({
      resumeSkills: [],
      resumeText: "Led migration of services to Kubernetes at scale.",
      jobSkills: ["Kubernetes"],
      jobKeywordText: "",
    });
    expect(result.matchedSkills).toEqual(["kubernetes"]);
  });

  it("is case-insensitive and whitespace-tolerant", () => {
    const result = computeDeterministicResumeMatch({
      resumeSkills: ["  REACT  "],
      resumeText: "",
      jobSkills: ["react"],
      jobKeywordText: "",
    });
    expect(result.matchedSkills).toEqual(["react"]);
    expect(result.matchPercentage).toBe(100);
  });

  it("falls back to keyword-only scoring when the job has no explicit skills", () => {
    const result = computeDeterministicResumeMatch({
      resumeSkills: [],
      resumeText: "Experienced with distributed systems and kubernetes orchestration.",
      jobSkills: [],
      jobKeywordText: "Looking for someone with distributed systems and kubernetes experience.",
    });
    expect(result.matchPercentage).toBeGreaterThan(0);
    expect(result.matchedKeywords.length).toBeGreaterThan(0);
  });

  it("is deterministic — identical input always produces identical output", () => {
    const input: DeterministicMatchInput = {
      resumeSkills: ["Go", "Docker"],
      resumeText: "Built microservices in Go using Docker.",
      jobSkills: ["Go", "Docker", "Kubernetes"],
      jobKeywordText: "containerized microservices",
    };
    const a = computeDeterministicResumeMatch(input);
    const b = computeDeterministicResumeMatch(input);
    expect(a).toEqual(b);
  });

  it("caps matchPercentage at 100 even with overlapping skill+keyword coverage", () => {
    const result = computeDeterministicResumeMatch({
      resumeSkills: ["Go"],
      resumeText: "Go engineer with container experience",
      jobSkills: ["Go"],
      jobKeywordText: "Go engineer with container experience",
    });
    expect(result.matchPercentage).toBeLessThanOrEqual(100);
  });
});

describe("matchResumeToJob", () => {
  function structuredResume(overrides: Partial<StructuredResume> = {}): StructuredResume {
    return {
      contact: {
        name: "Jane Doe",
        email: null,
        phone: null,
        location: null,
        linkedin: null,
        github: null,
        portfolio: null,
        links: [],
      },
      summary: "Frontend engineer focused on React and accessibility.",
      sections: [{ heading: "Experience", content: "Built dashboards with React and TypeScript." }],
      skills: ["React", "TypeScript", "CSS"],
      detectedSections: ["experience"],
      wordCount: 20,
      charCount: 120,
      ...overrides,
    };
  }

  it("aggregates structured resume sections + summary into resumeText", () => {
    const result = matchResumeToJob(structuredResume(), {
      skills: ["React"],
      requirements: [],
      preferredQualifications: [],
      technologies: [],
      description: null,
    });
    expect(result.matchedSkills).toEqual(["react"]);
  });

  it("mines job keywords from requirements/preferred/technologies/description", () => {
    const result = matchResumeToJob(structuredResume(), {
      skills: [],
      requirements: ["Experience with accessibility and React required"],
      preferredQualifications: [],
      technologies: [],
      description: null,
    });
    expect(result.matchedKeywords).toContain("accessibility");
  });
});
