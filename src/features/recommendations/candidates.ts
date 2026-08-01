import { STUCK_APPLIED_DAYS } from "@/features/analytics/constants";
import type { GoalProgress, ResumePerformance } from "@/features/analytics/types";
import type { RecommendationCandidate, RecommendationCandidateType } from "./types";

// ── AI Recommendations — detector registry (Module 8B) ──
//
// Every "should we show this?" decision is made HERE, in plain deterministic
// code — never by the AI. A detector reads already-computed, already-real
// data and returns a candidate (with the exact numbers/names the AI may
// state) or `null` when the evidence isn't strong enough to be worth
// showing. The registry below is what makes this extensible: adding an
// eighth recommendation type is one new entry, not a new branch threaded
// through the service, the prompt builder, and the guardrail.

export type RecommendationContext = {
  /** All-time resume performance — reuses Module 8A's computeResumePerformance() output verbatim. */
  resumePerformance: ResumePerformance[];
  /** Applications stale in "Applied" — reuses Module 8A's countStaleApplications() verbatim. */
  staleApplicationCount: number;
  /** All-time applications with no resume_id. */
  unlinkedApplicationCount: number;
  /** All-time application count (denominator for the resume-linking candidate). */
  totalApplicationCount: number;
  /** Interviews with status='scheduled' and scheduled_at in the future, each flagged for whether interview_preps.generated_at is set. */
  upcomingInterviews: { hasPrep: boolean }[];
  /** Concluded mock interview sessions with a generated report. */
  concludedMockSessions: {
    competencyScores: { competencyId: string; label: string; score: number }[];
  }[];
  /** Goal progress for a last-30-days window — reuses Module 8A's buildGoalProgress() output verbatim (goals read as monthly). */
  goals: GoalProgress[];
  /** ats_score ai_analyses history, oldest first is not assumed — sorted internally. */
  atsHistory: { resumeId: string; resumeName: string; score: number; createdAt: string }[];
};

/** What a detector returns before the registry stamps its fixed display priority onto it. */
type DetectorResult = Omit<RecommendationCandidate, "priority">;

type RecommendationDetector = {
  type: RecommendationCandidateType;
  /** Lower shows first when more than 3 candidates qualify. */
  priority: number;
  detect: (ctx: RecommendationContext) => DetectorResult | null;
};

// ── 1. Resume Performance ──

const RESUME_PERFORMANCE_GAP_THRESHOLD = 0.15; // 15 percentage points

function resumePerformanceDetector(ctx: RecommendationContext): DetectorResult | null {
  const significant = ctx.resumePerformance.filter(
    (r) => r.isSignificant && r.interviewRate !== null,
  );
  if (significant.length < 2) return null;

  const sorted = [...significant].sort((a, b) => (b.interviewRate ?? 0) - (a.interviewRate ?? 0));
  const best = sorted[0];
  const worst = sorted[sorted.length - 1];
  const gap = (best.interviewRate ?? 0) - (worst.interviewRate ?? 0);
  if (gap < RESUME_PERFORMANCE_GAP_THRESHOLD) return null;

  const bestPct = Math.round((best.interviewRate ?? 0) * 100);
  const worstPct = Math.round((worst.interviewRate ?? 0) * 100);

  return {
    type: "resume_performance",
    facts: {
      bestApplications: best.applications,
      bestInterviews: best.interviews,
      bestInterviewRatePct: bestPct,
      worstApplications: worst.applications,
      worstInterviews: worst.interviews,
      worstInterviewRatePct: worstPct,
    },
    entities: [best.resumeName, worst.resumeName],
    fallback: {
      title: "Resume performance",
      explanation: `Your ${best.resumeName} has resulted in more interview opportunities (${best.interviews} of ${best.applications} applications) than your ${worst.resumeName} (${worst.interviews} of ${worst.applications} applications).`,
      action: `Use ${best.resumeName} for similar applications going forward.`,
    },
  };
}

// ── 2. Stale Applications ──

function staleApplicationsDetector(ctx: RecommendationContext): DetectorResult | null {
  const count = ctx.staleApplicationCount;
  if (count < 1) return null;

  return {
    type: "stale_applications",
    facts: { staleCount: count, staleDays: STUCK_APPLIED_DAYS },
    entities: [],
    fallback: {
      title: "Stale applications",
      explanation: `${count} application${count === 1 ? " has" : "s have"} stayed in Applied for ${STUCK_APPLIED_DAYS}+ days with no movement.`,
      action: "Follow up on these, or focus your energy on newer opportunities.",
    },
  };
}

// ── 3. Interview Preparation ──

function interviewPrepDetector(ctx: RecommendationContext): DetectorResult | null {
  const upcoming = ctx.upcomingInterviews.length;
  if (upcoming < 1) return null;
  const prepared = ctx.upcomingInterviews.filter((i) => i.hasPrep).length;
  if (prepared >= upcoming) return null;

  return {
    type: "interview_prep",
    facts: { upcomingInterviews: upcoming, preparedCount: prepared },
    entities: [],
    fallback: {
      title: "Interview preparation",
      explanation:
        prepared > 0
          ? `You have ${upcoming} upcoming interview${upcoming === 1 ? "" : "s"}, but only ${prepared} of them ${prepared === 1 ? "has" : "have"} a completed preparation.`
          : `You have ${upcoming} upcoming interview${upcoming === 1 ? "" : "s"} but limited preparation activity.`,
      action: "Complete an Interview Preparation session before your next interview.",
    },
  };
}

// ── 4. Mock Interviews ──

const MOCK_INTERVIEW_MIN_SESSIONS = 2;
const MOCK_INTERVIEW_GAP_THRESHOLD = 15; // score points, 0-100 scale

function mockInterviewDetector(ctx: RecommendationContext): DetectorResult | null {
  const sessions = ctx.concludedMockSessions;
  if (sessions.length < MOCK_INTERVIEW_MIN_SESSIONS) return null;

  const totals = new Map<string, { label: string; sum: number; count: number }>();
  for (const session of sessions) {
    for (const c of session.competencyScores) {
      const entry = totals.get(c.competencyId) ?? {
        label: c.label || c.competencyId,
        sum: 0,
        count: 0,
      };
      entry.sum += c.score;
      entry.count += 1;
      totals.set(c.competencyId, entry);
    }
  }
  if (totals.size < 2) return null;

  const averages = [...totals.entries()]
    .map(([id, v]) => ({ id, label: v.label, avg: v.sum / v.count }))
    .sort((a, b) => b.avg - a.avg);
  const strongest = averages[0];
  const weakest = averages[averages.length - 1];
  const gap = strongest.avg - weakest.avg;
  if (gap < MOCK_INTERVIEW_GAP_THRESHOLD) return null;

  const strongestScore = Math.round(strongest.avg);
  const weakestScore = Math.round(weakest.avg);

  return {
    type: "mock_interview",
    facts: { sessionsCount: sessions.length, strongestScore, weakestScore },
    entities: [strongest.label, weakest.label],
    fallback: {
      title: "Mock interview performance",
      explanation: `Across ${sessions.length} mock interviews, your strongest area is ${strongest.label} (average ${strongestScore}/100), while ${weakest.label} scored lower (average ${weakestScore}/100).`,
      action: `Practice another mock interview focused on ${weakest.label}.`,
    },
  };
}

// ── 5. Goals ──

const GOAL_REMAINING_THRESHOLD = 3;

function goalDetector(ctx: RecommendationContext): DetectorResult | null {
  const qualifying = ctx.goals.filter(
    (g) =>
      g.current > 0 && g.current < g.target && g.target - g.current <= GOAL_REMAINING_THRESHOLD,
  );
  if (qualifying.length === 0) return null;

  const goal = [...qualifying].sort((a, b) => a.target - a.current - (b.target - b.current))[0];
  const remaining = goal.target - goal.current;
  const goalLabelLower = goal.label.toLowerCase();

  return {
    type: "goal_progress",
    facts: { current: goal.current, target: goal.target, remaining },
    entities: [goal.label],
    fallback: {
      title: "Goal progress",
      explanation: `You're close to your monthly ${goalLabelLower} goal — ${goal.current} of ${goal.target} so far.`,
      action: `${remaining} more ${goalLabelLower} will complete this goal.`,
    },
  };
}

// ── 6. ATS Improvement ──

const ATS_IMPROVEMENT_THRESHOLD = 8; // score points, 0-100 scale

function atsImprovementDetector(ctx: RecommendationContext): DetectorResult | null {
  if (ctx.atsHistory.length < 2) return null;
  const history = [...ctx.atsHistory].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const newer = history[history.length - 1];
  const older = [...history]
    .slice(0, -1)
    .reverse()
    .find((h) => h.resumeId !== newer.resumeId);
  if (!older) return null;

  const gap = newer.score - older.score;
  if (gap < ATS_IMPROVEMENT_THRESHOLD) return null;

  return {
    type: "ats_improvement",
    facts: { oldScore: older.score, newScore: newer.score },
    entities: [older.resumeName, newer.resumeName],
    fallback: {
      title: "ATS score improvement",
      explanation: `Your ATS score improved from ${older.score} to ${newer.score} after switching from ${older.resumeName} to ${newer.resumeName}.`,
      action: `Continue using ${newer.resumeName} for similar applications.`,
    },
  };
}

// ── 7. Resume Linking ──

const UNLINKED_APPLICATIONS_THRESHOLD = 3;

function resumeLinkingDetector(ctx: RecommendationContext): DetectorResult | null {
  if (ctx.unlinkedApplicationCount < UNLINKED_APPLICATIONS_THRESHOLD) return null;

  return {
    type: "resume_linking",
    facts: {
      unlinkedCount: ctx.unlinkedApplicationCount,
      totalApplications: ctx.totalApplicationCount,
    },
    entities: [],
    fallback: {
      title: "Resume linking",
      explanation: `${ctx.unlinkedApplicationCount} of your ${ctx.totalApplicationCount} applications aren't linked to a resume.`,
      action: "Link them to a resume to improve your analytics.",
    },
  };
}

// ── Registry ──
//
// Order here is only the tie-break for display priority (the `priority`
// field) — it has no bearing on which detectors run; every one always runs.

export const RECOMMENDATION_DETECTORS: RecommendationDetector[] = [
  { type: "resume_performance", priority: 1, detect: resumePerformanceDetector },
  { type: "stale_applications", priority: 2, detect: staleApplicationsDetector },
  { type: "interview_prep", priority: 3, detect: interviewPrepDetector },
  { type: "mock_interview", priority: 4, detect: mockInterviewDetector },
  { type: "goal_progress", priority: 5, detect: goalDetector },
  { type: "ats_improvement", priority: 6, detect: atsImprovementDetector },
  { type: "resume_linking", priority: 7, detect: resumeLinkingDetector },
];

/** Runs every registered detector, drops the ones with insufficient evidence, and caps at 3 by priority. */
export function buildRecommendationCandidates(
  ctx: RecommendationContext,
): RecommendationCandidate[] {
  return RECOMMENDATION_DETECTORS.map((d) => {
    const result = d.detect(ctx);
    return result ? { ...result, priority: d.priority } : null;
  })
    .filter((c): c is RecommendationCandidate => c !== null)
    .sort((a, b) => a.priority - b.priority)
    .slice(0, 3);
}
