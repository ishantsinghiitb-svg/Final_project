import { describe, expect, it } from "vitest";
import { buildRecommendationCandidates, type RecommendationContext } from "./candidates";

// ── Fixtures ──────────────────────────────────────────────────────────────

const baseContext: RecommendationContext = {
  resumePerformance: [],
  staleApplicationCount: 0,
  unlinkedApplicationCount: 0,
  totalApplicationCount: 0,
  upcomingInterviews: [],
  concludedMockSessions: [],
  goals: [],
  atsHistory: [],
};

function typesOf(ctx: RecommendationContext): string[] {
  return buildRecommendationCandidates(ctx).map((c) => c.type);
}

// ── Empty state ───────────────────────────────────────────────────────────

describe("buildRecommendationCandidates", () => {
  it("returns nothing when there is no evidence at all", () => {
    expect(buildRecommendationCandidates(baseContext)).toEqual([]);
  });

  // ── 1. Resume Performance ──

  it("fires resume_performance when two significant resumes have a >=15pt interview-rate gap", () => {
    const ctx: RecommendationContext = {
      ...baseContext,
      resumePerformance: [
        {
          resumeId: "r1",
          resumeName: "Product Resume",
          applications: 20,
          interviews: 10,
          offers: 2,
          interviewRate: 0.5,
          offerRate: 0.1,
          isSignificant: true,
        },
        {
          resumeId: "r2",
          resumeName: "General Resume",
          applications: 20,
          interviews: 4,
          offers: 0,
          interviewRate: 0.2,
          offerRate: 0,
          isSignificant: true,
        },
      ],
    };
    const candidates = buildRecommendationCandidates(ctx);
    expect(typesOf(ctx)).toContain("resume_performance");
    const c = candidates.find((x) => x.type === "resume_performance")!;
    expect(c.entities).toEqual(["Product Resume", "General Resume"]);
    expect(c.facts.bestApplications).toBe(20);
    expect(c.facts.bestInterviewRatePct).toBe(50);
  });

  it("does not fire resume_performance when the gap is below threshold", () => {
    const ctx: RecommendationContext = {
      ...baseContext,
      resumePerformance: [
        {
          resumeId: "r1",
          resumeName: "A",
          applications: 20,
          interviews: 6,
          offers: 0,
          interviewRate: 0.3,
          offerRate: 0,
          isSignificant: true,
        },
        {
          resumeId: "r2",
          resumeName: "B",
          applications: 20,
          interviews: 5,
          offers: 0,
          interviewRate: 0.25,
          offerRate: 0,
          isSignificant: true,
        },
      ],
    };
    expect(typesOf(ctx)).not.toContain("resume_performance");
  });

  it("does not fire resume_performance with fewer than 2 significant resumes", () => {
    const ctx: RecommendationContext = {
      ...baseContext,
      resumePerformance: [
        {
          resumeId: "r1",
          resumeName: "A",
          applications: 20,
          interviews: 10,
          offers: 0,
          interviewRate: 0.5,
          offerRate: 0,
          isSignificant: true,
        },
        {
          resumeId: "r2",
          resumeName: "B",
          applications: 2,
          interviews: 2,
          offers: 0,
          interviewRate: null,
          offerRate: null,
          isSignificant: false,
        },
      ],
    };
    expect(typesOf(ctx)).not.toContain("resume_performance");
  });

  // ── 2. Stale Applications ──

  it("fires stale_applications when count > 0", () => {
    const ctx: RecommendationContext = { ...baseContext, staleApplicationCount: 3 };
    expect(typesOf(ctx)).toContain("stale_applications");
  });

  it("does not fire stale_applications when count is 0", () => {
    expect(typesOf(baseContext)).not.toContain("stale_applications");
  });

  // ── 3. Interview Preparation ──

  it("fires interview_prep when an upcoming interview has no completed prep", () => {
    const ctx: RecommendationContext = {
      ...baseContext,
      upcomingInterviews: [{ hasPrep: false }, { hasPrep: true }],
    };
    expect(typesOf(ctx)).toContain("interview_prep");
  });

  it("does not fire interview_prep when every upcoming interview already has a prep", () => {
    const ctx: RecommendationContext = {
      ...baseContext,
      upcomingInterviews: [{ hasPrep: true }, { hasPrep: true }],
    };
    expect(typesOf(ctx)).not.toContain("interview_prep");
  });

  it("does not fire interview_prep with no upcoming interviews", () => {
    expect(typesOf(baseContext)).not.toContain("interview_prep");
  });

  // ── 4. Mock Interviews ──

  it("fires mock_interview when >=2 sessions show a >=15pt competency gap", () => {
    const ctx: RecommendationContext = {
      ...baseContext,
      concludedMockSessions: [
        {
          competencyScores: [
            { competencyId: "behavioral", label: "Behavioral", score: 90 },
            { competencyId: "product_sense", label: "Product Sense", score: 60 },
          ],
        },
        {
          competencyScores: [
            { competencyId: "behavioral", label: "Behavioral", score: 88 },
            { competencyId: "product_sense", label: "Product Sense", score: 55 },
          ],
        },
      ],
    };
    const candidates = buildRecommendationCandidates(ctx);
    expect(typesOf(ctx)).toContain("mock_interview");
    const c = candidates.find((x) => x.type === "mock_interview")!;
    expect(c.entities).toEqual(["Behavioral", "Product Sense"]);
  });

  it("does not fire mock_interview with fewer than 2 sessions", () => {
    const ctx: RecommendationContext = {
      ...baseContext,
      concludedMockSessions: [
        {
          competencyScores: [
            { competencyId: "behavioral", label: "Behavioral", score: 90 },
            { competencyId: "product_sense", label: "Product Sense", score: 20 },
          ],
        },
      ],
    };
    expect(typesOf(ctx)).not.toContain("mock_interview");
  });

  it("does not fire mock_interview when the competency gap is below threshold", () => {
    const ctx: RecommendationContext = {
      ...baseContext,
      concludedMockSessions: [
        {
          competencyScores: [
            { competencyId: "behavioral", label: "Behavioral", score: 70 },
            { competencyId: "product_sense", label: "Product Sense", score: 65 },
          ],
        },
        {
          competencyScores: [
            { competencyId: "behavioral", label: "Behavioral", score: 72 },
            { competencyId: "product_sense", label: "Product Sense", score: 68 },
          ],
        },
      ],
    };
    expect(typesOf(ctx)).not.toContain("mock_interview");
  });

  // ── 5. Goals ──

  it("fires goal_progress when a goal has current > 0 and <=3 remaining", () => {
    const ctx: RecommendationContext = {
      ...baseContext,
      goals: [
        {
          key: "interviews",
          label: "Interviews",
          current: 3,
          target: 5,
          isDefault: false,
          pct: 60,
        },
      ],
    };
    const candidates = buildRecommendationCandidates(ctx);
    expect(typesOf(ctx)).toContain("goal_progress");
    const c = candidates.find((x) => x.type === "goal_progress")!;
    expect(c.facts.remaining).toBe(2);
  });

  it("does not fire goal_progress when current is 0", () => {
    const ctx: RecommendationContext = {
      ...baseContext,
      goals: [
        { key: "interviews", label: "Interviews", current: 0, target: 5, isDefault: false, pct: 0 },
      ],
    };
    expect(typesOf(ctx)).not.toContain("goal_progress");
  });

  it("does not fire goal_progress when remaining exceeds the threshold", () => {
    const ctx: RecommendationContext = {
      ...baseContext,
      goals: [
        {
          key: "interviews",
          label: "Interviews",
          current: 1,
          target: 10,
          isDefault: false,
          pct: 10,
        },
      ],
    };
    expect(typesOf(ctx)).not.toContain("goal_progress");
  });

  // ── 6. ATS Improvement ──

  it("fires ats_improvement when a newer resume's ATS score beats an older one by >=8", () => {
    const ctx: RecommendationContext = {
      ...baseContext,
      atsHistory: [
        { resumeId: "r1", resumeName: "Old Resume", score: 60, createdAt: "2026-01-01T00:00:00Z" },
        { resumeId: "r2", resumeName: "New Resume", score: 75, createdAt: "2026-02-01T00:00:00Z" },
      ],
    };
    const candidates = buildRecommendationCandidates(ctx);
    expect(typesOf(ctx)).toContain("ats_improvement");
    const c = candidates.find((x) => x.type === "ats_improvement")!;
    expect(c.entities).toEqual(["Old Resume", "New Resume"]);
    expect(c.facts.oldScore).toBe(60);
    expect(c.facts.newScore).toBe(75);
  });

  it("does not fire ats_improvement when the gap is below threshold", () => {
    const ctx: RecommendationContext = {
      ...baseContext,
      atsHistory: [
        { resumeId: "r1", resumeName: "Old", score: 70, createdAt: "2026-01-01T00:00:00Z" },
        { resumeId: "r2", resumeName: "New", score: 74, createdAt: "2026-02-01T00:00:00Z" },
      ],
    };
    expect(typesOf(ctx)).not.toContain("ats_improvement");
  });

  it("does not fire ats_improvement when every analysis used the same resume", () => {
    const ctx: RecommendationContext = {
      ...baseContext,
      atsHistory: [
        { resumeId: "r1", resumeName: "Only", score: 50, createdAt: "2026-01-01T00:00:00Z" },
        { resumeId: "r1", resumeName: "Only", score: 90, createdAt: "2026-02-01T00:00:00Z" },
      ],
    };
    expect(typesOf(ctx)).not.toContain("ats_improvement");
  });

  // ── 7. Resume Linking ──

  it("fires resume_linking when unlinked count is >= 3", () => {
    const ctx: RecommendationContext = {
      ...baseContext,
      unlinkedApplicationCount: 3,
      totalApplicationCount: 10,
    };
    expect(typesOf(ctx)).toContain("resume_linking");
  });

  it("does not fire resume_linking below the threshold", () => {
    const ctx: RecommendationContext = {
      ...baseContext,
      unlinkedApplicationCount: 2,
      totalApplicationCount: 10,
    };
    expect(typesOf(ctx)).not.toContain("resume_linking");
  });

  // ── Registry: priority ordering, no cap ──

  it("returns every qualifying candidate, sorted by priority, with no cap", () => {
    const everything: RecommendationContext = {
      resumePerformance: [
        {
          resumeId: "r1",
          resumeName: "Product Resume",
          applications: 20,
          interviews: 10,
          offers: 2,
          interviewRate: 0.5,
          offerRate: 0.1,
          isSignificant: true,
        },
        {
          resumeId: "r2",
          resumeName: "General Resume",
          applications: 20,
          interviews: 4,
          offers: 0,
          interviewRate: 0.2,
          offerRate: 0,
          isSignificant: true,
        },
      ],
      staleApplicationCount: 3,
      unlinkedApplicationCount: 5,
      totalApplicationCount: 10,
      upcomingInterviews: [{ hasPrep: false }],
      concludedMockSessions: [
        {
          competencyScores: [
            { competencyId: "behavioral", label: "Behavioral", score: 90 },
            { competencyId: "product_sense", label: "Product Sense", score: 60 },
          ],
        },
        {
          competencyScores: [
            { competencyId: "behavioral", label: "Behavioral", score: 88 },
            { competencyId: "product_sense", label: "Product Sense", score: 55 },
          ],
        },
      ],
      goals: [
        {
          key: "interviews",
          label: "Interviews",
          current: 3,
          target: 5,
          isDefault: false,
          pct: 60,
        },
      ],
      atsHistory: [
        { resumeId: "r1", resumeName: "Old Resume", score: 60, createdAt: "2026-01-01T00:00:00Z" },
        { resumeId: "r2", resumeName: "New Resume", score: 75, createdAt: "2026-02-01T00:00:00Z" },
      ],
    };

    const candidates = buildRecommendationCandidates(everything);
    expect(candidates).toHaveLength(7);
    expect(candidates.map((c) => c.type)).toEqual([
      "resume_performance",
      "stale_applications",
      "interview_prep",
      "mock_interview",
      "goal_progress",
      "ats_improvement",
      "resume_linking",
    ]);
  });
});
