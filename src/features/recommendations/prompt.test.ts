import { describe, expect, it } from "vitest";
import {
  buildEntityOwnership,
  entitiesAreValid,
  extractNumbers,
  numbersAreValid,
  validateRecommendationItem,
} from "./prompt";
import type { RecommendationCandidate } from "./types";

const resumeCandidate: RecommendationCandidate = {
  type: "resume_performance",
  priority: 1,
  facts: { bestApplications: 20, bestInterviewRatePct: 50 },
  entities: ["Product Resume", "General Resume"],
  fallback: { title: "t", explanation: "e", action: "a" },
};

const goalCandidate: RecommendationCandidate = {
  type: "goal_progress",
  priority: 5,
  facts: { current: 3, target: 5, remaining: 2 },
  entities: ["Interviews"],
  fallback: { title: "t2", explanation: "e2", action: "a2" },
};

// ── Numbers ───────────────────────────────────────────────────────────────

describe("extractNumbers", () => {
  it("finds integers and percentages", () => {
    expect(extractNumbers("You applied to 20 roles, a 50% interview rate.")).toEqual(["20", "50%"]);
  });

  it("returns an empty array for text with no digits", () => {
    expect(extractNumbers("No numbers here.")).toEqual([]);
  });
});

describe("numbersAreValid", () => {
  it("accepts numbers present in the candidate's facts, with or without a percent sign", () => {
    const text = "You had 20 applications and a 50% interview rate.";
    expect(numbersAreValid(text, resumeCandidate)).toBe(true);
  });

  it("rejects a number the AI introduced that isn't one of the facts", () => {
    const text = "You had 20 applications and a 99% interview rate.";
    expect(numbersAreValid(text, resumeCandidate)).toBe(false);
  });

  it("rejects a fabricated count with no basis in the facts", () => {
    const text = "You applied to 12 roles this week.";
    expect(numbersAreValid(text, resumeCandidate)).toBe(false);
  });
});

// ── Entities ──────────────────────────────────────────────────────────────

describe("buildEntityOwnership / entitiesAreValid", () => {
  it("accepts a candidate's own required entities and rejects a name belonging to a different candidate", () => {
    const ownership = buildEntityOwnership(
      [resumeCandidate, goalCandidate],
      ["Product Resume", "General Resume", "Interviews"],
    );

    expect(
      entitiesAreValid(
        "Your Product Resume outperformed your General Resume.",
        resumeCandidate,
        ownership,
      ),
    ).toBe(true);

    // "Interviews" is a real, known entity — but it belongs to goalCandidate,
    // not resumeCandidate. Mentioning it here is cross-contamination.
    expect(
      entitiesAreValid(
        "Your Product Resume outperformed your General Resume in Interviews.",
        resumeCandidate,
        ownership,
      ),
    ).toBe(false);
  });

  it("rejects a name that exists in the account but isn't part of any candidate this round", () => {
    // "Backend Resume" is real (in allKnownEntities) but not an entity of
    // either candidate shown this round — mentioning it is still rejected.
    const ownership = buildEntityOwnership(
      [resumeCandidate],
      ["Product Resume", "General Resume", "Backend Resume"],
    );
    expect(
      entitiesAreValid(
        "Your Product Resume outperformed your Backend Resume.",
        resumeCandidate,
        ownership,
      ),
    ).toBe(false);
  });

  it("rejects when a required entity is missing (silently substituted with a different name)", () => {
    const ownership = buildEntityOwnership([resumeCandidate], ["Product Resume", "General Resume"]);
    // The AI was told to say "Product Resume" — inventing "Startup Resume"
    // instead means the required entity never appears verbatim.
    expect(
      entitiesAreValid(
        "Your Startup Resume outperformed your General Resume.",
        resumeCandidate,
        ownership,
      ),
    ).toBe(false);
  });
});

// ── Combined validation ───────────────────────────────────────────────────

describe("validateRecommendationItem", () => {
  const ownership = buildEntityOwnership([resumeCandidate], ["Product Resume", "General Resume"]);

  it("accepts a well-formed item using only the given numbers and names", () => {
    const item = {
      type: "resume_performance" as const,
      title: "Resume performance",
      explanation:
        "Your Product Resume (20 applications, 50% interview rate) outperforms your General Resume.",
      action: "Use Product Resume for future applications.",
    };
    expect(validateRecommendationItem(item, resumeCandidate, ownership)).toBe(true);
  });

  it("rejects an item whose type doesn't match the candidate", () => {
    const item = {
      type: "goal_progress" as const,
      title: "Resume performance",
      explanation:
        "Your Product Resume (20 applications, 50% interview rate) outperforms your General Resume.",
      action: "Use Product Resume for future applications.",
    };
    expect(validateRecommendationItem(item, resumeCandidate, ownership)).toBe(false);
  });

  it("rejects an item with an empty field", () => {
    const item = {
      type: "resume_performance" as const,
      title: "",
      explanation: "Your Product Resume outperforms your General Resume.",
      action: "Use Product Resume for future applications.",
    };
    expect(validateRecommendationItem(item, resumeCandidate, ownership)).toBe(false);
  });

  it("rejects an item that invents a number", () => {
    const item = {
      type: "resume_performance" as const,
      title: "Resume performance",
      explanation: "Your Product Resume has a 95% interview rate versus your General Resume.",
      action: "Use Product Resume for future applications.",
    };
    expect(validateRecommendationItem(item, resumeCandidate, ownership)).toBe(false);
  });
});
