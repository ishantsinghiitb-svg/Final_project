import { describe, expect, it } from "vitest";
import {
  buildFocusAreas,
  buildLastActivityMap,
  buildStatusHistory,
  computeFunnel,
  computeGoalFocusArea,
  computeOverview,
  computeResumePerformance,
  computeSearchHealth,
  computeStuckInsights,
} from "./utils";

// ── buildStatusHistory ───────────────────────────────────────────────────

describe("buildStatusHistory", () => {
  it("unions new_value across an application's events", () => {
    const history = buildStatusHistory([
      { application_id: "a1", kind: "application_created", new_value: "applied", created_at: "t1" },
      { application_id: "a1", kind: "status_changed", new_value: "interview", created_at: "t2" },
      { application_id: "a1", kind: "status_changed", new_value: "rejected", created_at: "t3" },
      { application_id: "a2", kind: "application_created", new_value: "applied", created_at: "t1" },
    ]);
    expect(history.get("a1")).toEqual(new Set(["applied", "interview", "rejected"]));
    expect(history.get("a2")).toEqual(new Set(["applied"]));
  });

  it("ignores events with a null new_value", () => {
    const history = buildStatusHistory([
      { application_id: "a1", kind: "archived", new_value: null, created_at: "t1" },
    ]);
    expect(history.has("a1")).toBe(false);
  });
});

// ── buildLastActivityMap ──────────────────────────────────────────────────

describe("buildLastActivityMap", () => {
  it("keeps the most recent created_at per application", () => {
    const map = buildLastActivityMap([
      {
        application_id: "a1",
        kind: "application_created",
        new_value: "applied",
        created_at: "2026-08-01T00:00:00Z",
      },
      {
        application_id: "a1",
        kind: "status_changed",
        new_value: "interview",
        created_at: "2026-08-05T00:00:00Z",
      },
      {
        application_id: "a1",
        kind: "status_changed",
        new_value: "rejected",
        created_at: "2026-08-03T00:00:00Z",
      },
    ]);
    expect(map.get("a1")).toBe("2026-08-05T00:00:00Z");
  });
});

// ── computeOverview ───────────────────────────────────────────────────────

describe("computeOverview", () => {
  it("counts an application that reached interview then rejected as progressed/interviewed, not lost", () => {
    // The whole point of history-based derivation: a later rejection must
    // never erase that this application once reached interview.
    const history = buildStatusHistory([
      { application_id: "a1", kind: "application_created", new_value: "applied", created_at: "t1" },
      { application_id: "a1", kind: "status_changed", new_value: "interview", created_at: "t2" },
      { application_id: "a1", kind: "status_changed", new_value: "rejected", created_at: "t3" },
    ]);
    const overview = computeOverview([{ id: "a1", status: "rejected" }], history, [
      { application_id: "a1", status: "completed", scheduled_at: null },
    ]);
    expect(overview.progressed).toBe(1);
    expect(overview.applicationsWithInterview).toBe(1);
  });

  it("counts an offer that was later rejected as still having reached offer", () => {
    const history = buildStatusHistory([
      { application_id: "a1", kind: "application_created", new_value: "applied", created_at: "t1" },
      { application_id: "a1", kind: "status_changed", new_value: "offer", created_at: "t2" },
      { application_id: "a1", kind: "status_changed", new_value: "rejected", created_at: "t3" },
    ]);
    const overview = computeOverview([{ id: "a1", status: "rejected" }], history, []);
    expect(overview.offers).toBe(1);
  });

  it("counts assessments from history even when the app later moved past it", () => {
    const history = buildStatusHistory([
      { application_id: "a1", kind: "application_created", new_value: "applied", created_at: "t1" },
      {
        application_id: "a1",
        kind: "status_changed",
        new_value: "online_assessment",
        created_at: "t2",
      },
      { application_id: "a1", kind: "status_changed", new_value: "interview", created_at: "t3" },
    ]);
    const overview = computeOverview([{ id: "a1", status: "interview" }], history, []);
    expect(overview.assessments).toBe(1);
    expect(overview.hasAssessmentStage).toBe(true);
  });

  it("hasAssessmentStage is false when no application ever reached it", () => {
    const history = buildStatusHistory([
      { application_id: "a1", kind: "application_created", new_value: "applied", created_at: "t1" },
    ]);
    const overview = computeOverview([{ id: "a1", status: "applied" }], history, []);
    expect(overview.hasAssessmentStage).toBe(false);
    expect(overview.assessments).toBe(0);
  });

  it("interviewOpportunities counts every round, applicationsWithInterview counts distinct applications", () => {
    const overview = computeOverview([{ id: "a1", status: "interview" }], new Map(), [
      { application_id: "a1", status: "completed", scheduled_at: null },
      { application_id: "a1", status: "scheduled", scheduled_at: null },
    ]);
    expect(overview.interviewOpportunities).toBe(2);
    expect(overview.applicationsWithInterview).toBe(1);
    expect(overview.interviewOpportunitiesUpcoming).toBe(1);
    expect(overview.interviewOpportunitiesCompleted).toBe(1);
  });

  it("never divides by zero when there are no applications", () => {
    const overview = computeOverview([], new Map(), []);
    expect(overview.progressedRate).toBe(0);
    expect(overview.interviewRate).toBe(0);
    expect(overview.assessmentRate).toBe(0);
    expect(overview.offerRate).toBe(0);
  });
});

// ── computeFunnel ─────────────────────────────────────────────────────────

describe("computeFunnel", () => {
  const baseOverview = {
    applications: 10,
    hasAssessmentStage: false,
    assessments: 0,
    assessmentRate: 0,
    applicationsWithInterview: 4,
    interviewRate: 0.4,
    interviewOpportunities: 5,
    interviewOpportunitiesUpcoming: 1,
    interviewOpportunitiesCompleted: 4,
    offers: 0,
    offerRate: 0,
    accepted: 0,
    progressed: 4,
    progressedRate: 0.4,
  };

  it("omits the Assessments stage when the user's pipeline never used it, and stops at Offers", () => {
    const funnel = computeFunnel(baseOverview);
    expect(funnel.map((s) => s.key)).toEqual(["applications", "interviews", "offers"]);
  });

  it("includes Assessments, in order, when it was reached", () => {
    const funnel = computeFunnel({ ...baseOverview, hasAssessmentStage: true, assessments: 6 });
    expect(funnel.map((s) => s.key)).toEqual([
      "applications",
      "assessments",
      "interviews",
      "offers",
    ]);
  });

  it("returns null pctOfPrevious when the previous stage's count is 0, never NaN/Infinity", () => {
    const funnel = computeFunnel({ ...baseOverview, applicationsWithInterview: 0 });
    const offers = funnel.find((s) => s.key === "offers")!;
    expect(offers.pctOfPrevious).toBeNull();
  });
});

// ── computeSearchHealth ───────────────────────────────────────────────────

describe("computeSearchHealth", () => {
  it("shows a neutral 'just getting started' verdict under the minimum sample", () => {
    const health = computeSearchHealth({
      applications: 3,
      hasAssessmentStage: false,
      assessments: 0,
      assessmentRate: 0,
      applicationsWithInterview: 0,
      interviewRate: 0,
      interviewOpportunities: 0,
      interviewOpportunitiesUpcoming: 0,
      interviewOpportunitiesCompleted: 0,
      offers: 0,
      offerRate: 0,
      accepted: 0,
      progressed: 0,
      progressedRate: 0,
    });
    expect(health.tone).toBe("neutral");
    expect(health.label).toBe("Just getting started");
  });

  it("matches the worked example: 5 applications, 3 interviews, 1 offer -> Strong, offer conversion is the opportunity", () => {
    const health = computeSearchHealth({
      applications: 5,
      hasAssessmentStage: false,
      assessments: 0,
      assessmentRate: 0,
      applicationsWithInterview: 3,
      interviewRate: 0.6,
      interviewOpportunities: 3,
      interviewOpportunitiesUpcoming: 0,
      interviewOpportunitiesCompleted: 3,
      offers: 1,
      offerRate: 0.2,
      accepted: 0,
      progressed: 5,
      progressedRate: 1,
    });
    expect(health.tone).toBe("good");
    expect(health.label).toBe("Strong");
    expect(health.summary).toBe("Applications progressing well");
    expect(health.stats).toEqual([
      { label: "Applications", value: 5 },
      { label: "Interviews", value: 3 },
      { label: "Offers", value: 1 },
    ]);
    expect(health.opportunity).toBe("Convert more interviews into offers.");
  });

  it("names 'progress past Applied' as the bottleneck when nothing has moved yet", () => {
    const health = computeSearchHealth({
      applications: 10,
      hasAssessmentStage: false,
      assessments: 0,
      assessmentRate: 0,
      applicationsWithInterview: 0,
      interviewRate: 0,
      interviewOpportunities: 0,
      interviewOpportunitiesUpcoming: 0,
      interviewOpportunitiesCompleted: 0,
      offers: 0,
      offerRate: 0,
      accepted: 0,
      progressed: 0,
      progressedRate: 0,
    });
    expect(health.tone).toBe("warning");
    expect(health.summary).toBe("Applications need attention");
    expect(health.opportunity).toBe("Get more applications to progress past Applied.");
  });

  it("lands on 'On Track' when the weakest stage is a middling, not failing, conversion", () => {
    const health = computeSearchHealth({
      applications: 10,
      hasAssessmentStage: false,
      assessments: 0,
      assessmentRate: 0,
      applicationsWithInterview: 4,
      interviewRate: 0.4,
      interviewOpportunities: 4,
      interviewOpportunitiesUpcoming: 0,
      interviewOpportunitiesCompleted: 4,
      offers: 1,
      offerRate: 0.1,
      accepted: 0,
      progressed: 8, // 0.8
      progressedRate: 0.8,
    });
    // progressed=0.8, interview=4/8=0.5, offer=1/4=0.25 -> weakest is offer at 0.25 (neutral band)
    expect(health.tone).toBe("neutral");
    expect(health.label).toBe("On Track");
    expect(health.opportunity).toBe("Convert more interviews into offers.");
  });
});

// ── computeStuckInsights / buildFocusAreas / computeGoalFocusArea ────────

const NOW = new Date("2026-08-15T12:00:00.000Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000).toISOString();

const emptyOverview = {
  applications: 0,
  hasAssessmentStage: false,
  assessments: 0,
  assessmentRate: 0,
  applicationsWithInterview: 0,
  interviewRate: 0,
  interviewOpportunities: 0,
  interviewOpportunitiesUpcoming: 0,
  interviewOpportunitiesCompleted: 0,
  offers: 0,
  offerRate: 0,
  accepted: 0,
  progressed: 0,
  progressedRate: 0,
};

describe("computeStuckInsights", () => {
  it("flags applications stale in Applied for 10+ days, and not fresher ones", () => {
    const lastActivityAt = new Map([
      ["stale", daysAgo(15)],
      ["fresh", daysAgo(2)],
    ]);
    const insights = computeStuckInsights(
      [
        { id: "stale", status: "applied" },
        { id: "fresh", status: "applied" },
      ],
      lastActivityAt,
      2, // both unlinked — keeps the low-resume-link rule from also firing here
      emptyOverview,
      NOW,
    );
    expect(insights).toHaveLength(1);
    expect(insights[0].text).toBe("1 application has stayed in Applied for 10+ days.");
  });

  it("flags Online Assessments currently waiting", () => {
    const insights = computeStuckInsights(
      [
        { id: "a1", status: "online_assessment" },
        { id: "a2", status: "online_assessment" },
      ],
      new Map(),
      0,
      emptyOverview,
      NOW,
    );
    expect(insights.map((i) => i.text)).toContain("2 Online Assessments waiting.");
  });

  it("nudges to prepare for upcoming interviews", () => {
    const insights = computeStuckInsights(
      [],
      new Map(),
      0,
      { ...emptyOverview, interviewOpportunitiesUpcoming: 2 },
      NOW,
    );
    expect(insights.map((i) => i.text)).toContain("Prepare for 2 upcoming interviews.");
  });

  it("flags low resume linkage above zero, but leaves zero to Resume Performance's own empty state", () => {
    const applications = Array.from({ length: 5 }, (_, i) => ({ id: `a${i}`, status: "applied" }));

    const low = computeStuckInsights(applications, new Map(), 4, emptyOverview, NOW); // 1 linked
    expect(low.map((i) => i.text)).toContain("Only 1 application is linked to a resume.");

    const none = computeStuckInsights(applications, new Map(), 5, emptyOverview, NOW); // 0 linked
    expect(none.some((i) => i.id === "low-resume-link")).toBe(false);

    const plenty = computeStuckInsights(applications, new Map(), 0, emptyOverview, NOW); // 5 linked
    expect(plenty.some((i) => i.id === "low-resume-link")).toBe(false);
  });

  it("flags no offers yet only once interviews have actually happened", () => {
    const withInterviews = computeStuckInsights(
      [],
      new Map(),
      0,
      { ...emptyOverview, applicationsWithInterview: 2, offers: 0 },
      NOW,
    );
    expect(withInterviews.map((i) => i.text)).toContain("No offers yet.");

    const withoutInterviews = computeStuckInsights(
      [],
      new Map(),
      0,
      { ...emptyOverview, applicationsWithInterview: 0, offers: 0 },
      NOW,
    );
    expect(withoutInterviews.map((i) => i.text)).not.toContain("No offers yet.");
  });

  it("returns an empty list when nothing is worth surfacing", () => {
    expect(computeStuckInsights([], new Map(), 0, emptyOverview, NOW)).toEqual([]);
  });
});

describe("computeGoalFocusArea", () => {
  it("returns null once the applications goal is met", () => {
    const goals = [
      {
        key: "applications" as const,
        label: "Applications",
        current: 20,
        target: 20,
        isDefault: true,
        pct: 100,
      },
    ];
    expect(computeGoalFocusArea(goals)).toBeNull();
  });

  it("nudges to keep applying when the goal isn't met yet", () => {
    const goals = [
      {
        key: "applications" as const,
        label: "Applications",
        current: 7,
        target: 20,
        isDefault: true,
        pct: 35,
      },
    ];
    expect(computeGoalFocusArea(goals)?.text).toBe(
      "Continue applying — you're at 7 of 20 toward your goal.",
    );
  });
});

describe("buildFocusAreas", () => {
  it("pads with filler, skipping duplicates, when there are fewer than the cap", () => {
    const genuine = [
      {
        id: "stale-applied",
        tone: "warning" as const,
        text: "1 application has stayed in Applied for 10+ days.",
      },
    ];
    const result = buildFocusAreas(genuine, 5);
    expect(result).toHaveLength(5);
    expect(result[0]).toEqual(genuine[0]);
    expect(new Set(result.map((r) => r.id)).size).toBe(5); // no duplicate ids
  });

  it("caps at maxItems even when more genuine insights exist", () => {
    const genuine = Array.from({ length: 7 }, (_, i) => ({
      id: `insight-${i}`,
      tone: "neutral" as const,
      text: `Insight ${i}`,
    }));
    expect(buildFocusAreas(genuine, 5)).toHaveLength(5);
  });

  it("never returns an empty list, even with zero genuine insights", () => {
    expect(buildFocusAreas([], 5)).toHaveLength(4); // exactly the 4 filler items available
  });
});

// ── computeResumePerformance ─────────────────────────────────────────────

describe("computeResumePerformance", () => {
  it("hides rates below the significance floor and shows them at/above it", () => {
    const applications = [
      ...Array.from({ length: 9 }, (_, i) => ({ id: `below-${i}`, resume_id: "r-below" })),
      ...Array.from({ length: 10 }, (_, i) => ({ id: `at-${i}`, resume_id: "r-at" })),
    ];
    const { performance } = computeResumePerformance(applications, new Map(), new Set(), [
      { id: "r-below", name: "Below threshold" },
      { id: "r-at", name: "At threshold" },
    ]);

    const below = performance.find((r) => r.resumeId === "r-below")!;
    const at = performance.find((r) => r.resumeId === "r-at")!;

    expect(below.isSignificant).toBe(false);
    expect(below.interviewRate).toBeNull();
    expect(below.offerRate).toBeNull();
    expect(below.applications).toBe(9);

    expect(at.isSignificant).toBe(true);
    expect(at.interviewRate).toBe(0);
    expect(at.applications).toBe(10);
  });

  it("counts unlinked applications separately and orders significant resumes first", () => {
    const applications = [
      { id: "u1", resume_id: null },
      ...Array.from({ length: 10 }, (_, i) => ({ id: `s-${i}`, resume_id: "r-sig" })),
      { id: "small-1", resume_id: "r-small" },
    ];
    const { performance, unlinkedCount } = computeResumePerformance(
      applications,
      new Map(),
      new Set(),
      [
        { id: "r-sig", name: "Significant" },
        { id: "r-small", name: "Small" },
      ],
    );
    expect(unlinkedCount).toBe(1);
    expect(performance[0].resumeId).toBe("r-sig");
    expect(performance[0].isSignificant).toBe(true);
  });
});
