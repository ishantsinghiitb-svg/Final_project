import { subDays } from "date-fns";
import type { Profile } from "@/types";
import type {
  AnalyticsData,
  AnalyticsOverview,
  AnalyticsRangePreset,
  FunnelStage,
  FunnelStageKey,
  GoalKey,
  GoalProgress,
  ResumePerformance,
  SearchHealth,
  SearchHealthTone,
  StuckInsight,
} from "@/features/analytics/types";
import {
  DEFAULT_GOALS,
  FUNNEL_STAGE_LABELS,
  GOAL_LABELS,
  GOAL_ORDER,
  HEALTH_MIN_SAMPLE,
  HEALTH_STAGE_THRESHOLDS,
  LOW_RESUME_LINK_THRESHOLD,
  MAX_FOCUS_AREAS,
  RESUME_MIN_SAMPLE,
  STUCK_APPLIED_DAYS,
} from "@/features/analytics/constants";

// ── Time range ────────────────────────────────────────────────────────────

/**
 * Converts a range preset into an { after, before } ISO range for filtering
 * `applied_at`. Mirrors the shape of features/applications/utils.ts's
 * dateRangeForPreset, but as its own small helper — "All Time" (→ no lower
 * bound) isn't part of that feature's preset enum.
 */
export function rangeToDates(range: AnalyticsRangePreset): { after?: string; before?: string } {
  const now = new Date();
  switch (range) {
    case "last_7_days":
      return { after: subDays(now, 7).toISOString() };
    case "last_30_days":
      return { after: subDays(now, 30).toISOString() };
    case "last_90_days":
      return { after: subDays(now, 90).toISOString() };
    case "all_time":
      return {};
  }
}

// ── Raw data shapes the pure compute functions below work over ──────────
// (Structurally compatible with AnalyticsRepository's row types, but kept
// independent here so this file has no Supabase dependency.)

export type ActivityEvent = {
  application_id: string;
  kind: string;
  new_value: string | null;
  created_at: string;
};
export type OverviewApplication = { id: string; status: string };
export type OverviewInterview = {
  application_id: string;
  status: string;
  scheduled_at: string | null;
};

/**
 * Reduces the activity trigger's log into, per application, the complete set
 * of statuses it ever reached — not just its current one. `new_value` is
 * logged on both creation (the app's initial status) and every subsequent
 * status change (see supabase/migrations/20260717000001_module3a_...sql), so
 * the union across an application's rows is the source of truth for
 * Assessments/Offers/Accepted — a later rejection never erases that an
 * application once reached an earlier stage.
 */
export function buildStatusHistory(events: ActivityEvent[]): Map<string, Set<string>> {
  const history = new Map<string, Set<string>>();
  for (const event of events) {
    if (!event.new_value) continue;
    const set = history.get(event.application_id) ?? new Set<string>();
    set.add(event.new_value);
    history.set(event.application_id, set);
  }
  return history;
}

/**
 * The timestamp of each application's most recent status-relevant event —
 * i.e. when it entered its CURRENT status. Same underlying events as
 * buildStatusHistory, just reduced to a max() instead of a union — feeds
 * the "stale in Applied" rule in computeStuckInsights. ISO timestamps sort
 * correctly as strings, so no Date parsing needed here.
 */
export function buildLastActivityMap(events: ActivityEvent[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const event of events) {
    const existing = map.get(event.application_id);
    if (!existing || event.created_at > existing) {
      map.set(event.application_id, event.created_at);
    }
  }
  return map;
}

const OFFER_PLUS = new Set(["offer", "accepted"]);

function reachedAny(statuses: Set<string>, targets: Set<string>): boolean {
  for (const status of statuses) {
    if (targets.has(status)) return true;
  }
  return false;
}

/**
 * Builds the one clear set of KPIs every other section reads from.
 *
 * - assessments/offers/accepted/progressed all come from `history` (see
 *   buildStatusHistory) — "ever reached", not current status.
 * - Interviews are a genuinely different data source: real interview events
 *   from the `interviews` table (Module 7A), not a derived application
 *   status. `interviewOpportunities` counts every round (an application can
 *   earn more than one); `applicationsWithInterview` is the distinct-app
 *   count used for the funnel and "X out of Y applications" language, so it
 *   never exceeds `applications`.
 */
export function computeOverview(
  applications: OverviewApplication[],
  history: Map<string, Set<string>>,
  interviews: OverviewInterview[],
): AnalyticsOverview {
  let assessments = 0;
  let progressed = 0;
  let offers = 0;
  let accepted = 0;

  for (const app of applications) {
    const reached = history.get(app.id) ?? new Set<string>();
    if (reached.has("online_assessment")) assessments++;
    if ([...reached].some((status) => status !== "applied")) progressed++;
    if (reachedAny(reached, OFFER_PLUS)) offers++;
    if (reached.has("accepted")) accepted++;
  }

  const applicationsWithInterviewIds = new Set(interviews.map((i) => i.application_id));
  const applicationsWithInterview = applicationsWithInterviewIds.size;
  const interviewOpportunities = interviews.length;
  const interviewOpportunitiesUpcoming = interviews.filter((i) => i.status === "scheduled").length;
  const interviewOpportunitiesCompleted = interviewOpportunities - interviewOpportunitiesUpcoming;

  const total = applications.length;
  return {
    applications: total,
    hasAssessmentStage: assessments > 0,
    assessments,
    assessmentRate: total > 0 ? assessments / total : 0,
    applicationsWithInterview,
    interviewRate: total > 0 ? applicationsWithInterview / total : 0,
    interviewOpportunities,
    interviewOpportunitiesUpcoming,
    interviewOpportunitiesCompleted,
    offers,
    offerRate: total > 0 ? offers / total : 0,
    accepted,
    progressed,
    progressedRate: total > 0 ? progressed / total : 0,
  };
}

/**
 * Applications → [Assessments] → Interviews → Offers. Assessments only
 * appears when this user's pipeline actually reached it in range — an
 * always-empty stage is worse than no stage at all. Stops at Offers —
 * Accepted isn't useful for this dashboard's funnel view.
 */
export function computeFunnel(overview: AnalyticsOverview): FunnelStage[] {
  const order: FunnelStageKey[] = overview.hasAssessmentStage
    ? ["applications", "assessments", "interviews", "offers"]
    : ["applications", "interviews", "offers"];

  const countOf = (key: FunnelStageKey): number => {
    switch (key) {
      case "applications":
        return overview.applications;
      case "assessments":
        return overview.assessments;
      case "interviews":
        return overview.applicationsWithInterview;
      case "offers":
        return overview.offers;
    }
  };

  const first = overview.applications;
  return order.map((key, i) => {
    const count = countOf(key);
    const prevCount = i === 0 ? null : countOf(order[i - 1]);
    return {
      key,
      label: FUNNEL_STAGE_LABELS[key],
      count,
      pctOfFirst: first > 0 ? Math.round((count / first) * 100) : 0,
      pctOfPrevious:
        prevCount === null ? null : prevCount > 0 ? Math.round((count / prevCount) * 100) : null,
    };
  });
}

// ── Job Search Health ────────────────────────────────────────────────────
// Deterministic, rule-based — no AI call (that's Module 8B). Always leads
// with the real counts, then names whichever of the three stage-to-stage
// conversions (Applied→progressed, progressed→interview, interview→offer)
// is currently weakest as "your biggest opportunity" — there's always a
// weakest link, and naming it is the whole point of this card.

const STAGE_DEFS = [
  { key: "progressed" as const, action: "Get more applications to progress past Applied." },
  { key: "interview" as const, action: "Convert more applications into interviews." },
  { key: "offer" as const, action: "Convert more interviews into offers." },
];

const HEALTH_SUMMARIES: Record<SearchHealthTone, string> = {
  good: "Applications progressing well",
  neutral: "Applications moving steadily",
  warning: "Applications need attention",
};

export function computeSearchHealth(overview: AnalyticsOverview): SearchHealth {
  const stats = [
    { label: "Applications", value: overview.applications },
    { label: "Interviews", value: overview.applicationsWithInterview },
    { label: "Offers", value: overview.offers },
  ];

  if (overview.applications < HEALTH_MIN_SAMPLE) {
    return {
      tone: "neutral",
      label: "Just getting started",
      summary: "Not enough data yet",
      stats,
      opportunity: `Apply to a few more roles — health insights need at least ${HEALTH_MIN_SAMPLE} applications in this range to be meaningful.`,
    };
  }

  const rates: Record<(typeof STAGE_DEFS)[number]["key"], number> = {
    progressed: overview.applications > 0 ? overview.progressed / overview.applications : 0,
    interview:
      overview.progressed > 0 ? overview.applicationsWithInterview / overview.progressed : 0,
    offer:
      overview.applicationsWithInterview > 0
        ? overview.offers / overview.applicationsWithInterview
        : 0,
  };

  const weakest = STAGE_DEFS.reduce(
    (min, stage) => (rates[stage.key] < rates[min.key] ? stage : min),
    STAGE_DEFS[0],
  );
  const weakestRate = rates[weakest.key];

  const tone: SearchHealthTone =
    weakestRate >= HEALTH_STAGE_THRESHOLDS.good
      ? "good"
      : weakestRate >= HEALTH_STAGE_THRESHOLDS.warning
        ? "neutral"
        : "warning";
  const label = tone === "good" ? "Strong" : tone === "neutral" ? "On Track" : "Needs Attention";

  return {
    tone,
    label,
    summary: HEALTH_SUMMARIES[tone],
    stats,
    opportunity: weakest.action,
  };
}

// ── Focus areas ───────────────────────────────────────────────────────────
// Deterministic cards answering "what should I do next?" — each rule is a
// plain, independently-verifiable fact from real application data. Priority
// order below doubles as display order. When fewer than MAX_FOCUS_AREAS
// genuine rules fire, buildFocusAreas pads with fixed, generic guidance
// (below) so the panel never looks sparse or half-empty.

export function computeStuckInsights(
  applications: OverviewApplication[],
  lastActivityAt: Map<string, string>,
  unlinkedApplicationCount: number,
  overview: AnalyticsOverview,
  now: Date = new Date(),
): StuckInsight[] {
  const insights: StuckInsight[] = [];
  const nowMs = now.getTime();

  // 1. Stale in Applied — no movement in over STUCK_APPLIED_DAYS.
  const staleMs = STUCK_APPLIED_DAYS * 24 * 60 * 60 * 1000;
  const staleCount = applications.filter((app) => {
    if (app.status !== "applied") return false;
    const lastActivity = lastActivityAt.get(app.id);
    return Boolean(lastActivity) && nowMs - new Date(lastActivity!).getTime() > staleMs;
  }).length;
  if (staleCount > 0) {
    insights.push({
      id: "stale-applied",
      tone: "warning",
      text: `${staleCount} application${staleCount === 1 ? " has" : "s have"} stayed in Applied for ${STUCK_APPLIED_DAYS}+ days.`,
    });
  }

  // 2. Online Assessments currently awaiting an outcome.
  const assessmentsWaiting = applications.filter(
    (app) => app.status === "online_assessment",
  ).length;
  if (assessmentsWaiting > 0) {
    insights.push({
      id: "assessments-waiting",
      tone: "neutral",
      text: `${assessmentsWaiting} Online Assessment${assessmentsWaiting === 1 ? "" : "s"} waiting.`,
    });
  }

  // 3. Interviews earned that haven't happened yet — a simple nudge to prepare.
  if (overview.interviewOpportunitiesUpcoming > 0) {
    insights.push({
      id: "prepare-interviews",
      tone: "good",
      text: `Prepare for ${overview.interviewOpportunitiesUpcoming} upcoming interview${overview.interviewOpportunitiesUpcoming === 1 ? "" : "s"}.`,
    });
  }

  // 4. Very few applications carry a resume link — a data-quality nudge, not
  //    a verdict. Zero linked is Resume Performance's own empty state, so
  //    this only fires above zero to avoid saying the same thing twice.
  const linkedCount = applications.length - unlinkedApplicationCount;
  if (linkedCount > 0 && linkedCount <= LOW_RESUME_LINK_THRESHOLD) {
    insights.push({
      id: "low-resume-link",
      tone: "neutral",
      text: `Only ${linkedCount} application${linkedCount === 1 ? " is" : "s are"} linked to a resume.`,
    });
  }

  // 5. No offers yet — only meaningful once interviews have actually happened.
  if (overview.applicationsWithInterview > 0 && overview.offers === 0) {
    insights.push({ id: "no-offers", tone: "neutral", text: "No offers yet." });
  }

  return insights;
}

/** Fixed, generic deterministic guidance — never AI-generated — used only to fill remaining slots. */
const FILLER_FOCUS_AREAS: StuckInsight[] = [
  { id: "filler-tailor", tone: "neutral", text: "Keep tailoring resumes to each role." },
  { id: "filler-prep", tone: "neutral", text: "Continue interview preparation." },
  { id: "filler-followup", tone: "neutral", text: "Follow up after assessments." },
  {
    id: "filler-link",
    tone: "neutral",
    text: "Link resumes to applications for better analytics.",
  },
];

/**
 * Reads an already-computed Applications goal (see buildGoalProgress) and,
 * if it isn't met yet, turns it into a Focus Areas card. Read-only — never
 * touches how goals are calculated or persisted.
 */
export function computeGoalFocusArea(goals: GoalProgress[]): StuckInsight | null {
  const applicationsGoal = goals.find((g) => g.key === "applications");
  if (!applicationsGoal || applicationsGoal.current >= applicationsGoal.target) return null;
  return {
    id: "goal-reminder",
    tone: "good",
    text: `Continue applying — you're at ${applicationsGoal.current} of ${applicationsGoal.target} toward your goal.`,
  };
}

/** Merges rule-based insights with the (optional) goal reminder, then pads with fixed filler up to the cap. */
export function buildFocusAreas(
  insights: StuckInsight[],
  maxItems: number = MAX_FOCUS_AREAS,
): StuckInsight[] {
  if (insights.length >= maxItems) return insights.slice(0, maxItems);
  const presentIds = new Set(insights.map((i) => i.id));
  const filler = FILLER_FOCUS_AREAS.filter((f) => !presentIds.has(f.id));
  return [...insights, ...filler].slice(0, maxItems);
}

// ── Resume performance ───────────────────────────────────────────────────

export type ResumeApplication = { id: string; resume_id: string | null };
export type ResumeNameRow = { id: string; name: string };

export function computeResumePerformance(
  applications: ResumeApplication[],
  history: Map<string, Set<string>>,
  applicationsWithInterviewIds: Set<string>,
  resumes: ResumeNameRow[],
): { performance: ResumePerformance[]; unlinkedCount: number } {
  const resumeNameById = new Map(resumes.map((r) => [r.id, r.name]));
  const groups = new Map<string, { applications: number; interviews: number; offers: number }>();
  let unlinkedCount = 0;

  for (const app of applications) {
    if (!app.resume_id) {
      unlinkedCount++;
      continue;
    }
    const reached = history.get(app.id) ?? new Set<string>();
    const group = groups.get(app.resume_id) ?? { applications: 0, interviews: 0, offers: 0 };
    group.applications++;
    if (applicationsWithInterviewIds.has(app.id)) group.interviews++;
    if (reachedAny(reached, OFFER_PLUS)) group.offers++;
    groups.set(app.resume_id, group);
  }

  const performance: ResumePerformance[] = [...groups.entries()].map(([resumeId, group]) => {
    const isSignificant = group.applications >= RESUME_MIN_SAMPLE;
    return {
      resumeId,
      resumeName: resumeNameById.get(resumeId) ?? "Untitled resume",
      applications: group.applications,
      interviews: group.interviews,
      offers: group.offers,
      interviewRate: isSignificant ? group.interviews / group.applications : null,
      offerRate: isSignificant ? group.offers / group.applications : null,
      isSignificant,
    };
  });

  // Significant resumes first (trustworthy numbers lead), then by volume within each tier.
  performance.sort((a, b) => {
    if (a.isSignificant !== b.isSignificant) return a.isSignificant ? -1 : 1;
    return b.applications - a.applications;
  });

  return { performance, unlinkedCount };
}

// ── Empty state ───────────────────────────────────────────────────────────

export function emptyAnalyticsData(
  range: AnalyticsRangePreset,
  totalResumeCount: number,
): AnalyticsData {
  const overview: AnalyticsOverview = {
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
  return {
    range,
    overview,
    health: computeSearchHealth(overview),
    funnel: computeFunnel(overview),
    stuckInsights: [],
    resumePerformance: [],
    unlinkedApplicationCount: 0,
    totalResumeCount,
  };
}

// ── Goals ─────────────────────────────────────────────────────────────────

export type GoalTargets = Record<GoalKey, { target: number; isDefault: boolean }>;

const PROFILE_GOAL_COLUMN: Record<
  GoalKey,
  "goal_applications" | "goal_interviews" | "goal_offers"
> = {
  applications: "goal_applications",
  interviews: "goal_interviews",
  offers: "goal_offers",
};

/** Reads the 3 goal columns off the profile, falling back to the recommended default when null. */
export function resolveGoalTargets(profile: Profile | null): GoalTargets {
  const result = {} as GoalTargets;
  for (const key of GOAL_ORDER) {
    const stored = profile ? profile[PROFILE_GOAL_COLUMN[key]] : null;
    result[key] =
      stored != null
        ? { target: stored, isDefault: false }
        : { target: DEFAULT_GOALS[key], isDefault: true };
  }
  return result;
}

/** Merges the current-period counts with the resolved targets — pure client-side merge, no extra query. */
export function buildGoalProgress(
  overview: AnalyticsOverview,
  targets: GoalTargets,
): GoalProgress[] {
  const currentByKey: Record<GoalKey, number> = {
    applications: overview.applications,
    interviews: overview.applicationsWithInterview,
    offers: overview.offers,
  };
  return GOAL_ORDER.map((key) => {
    const { target, isDefault } = targets[key];
    const current = currentByKey[key];
    const pct = target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0;
    return { key, label: GOAL_LABELS[key], current, target, isDefault, pct };
  });
}

// ── Plain-English fractions ("What This Means") ──────────────────────────
// No percentages, no tone judgment (that's the Health card's job) — just
// the fact, stated in numbers a first-time visitor can read at a glance.

export function fractionSentence(count: number, total: number, suffix: string): string {
  return `${count} out of ${total} ${suffix}`;
}

// ── Formatting ────────────────────────────────────────────────────────────

export function formatPercent(rate: number | null): string {
  return rate == null ? "—" : `${Math.round(rate * 100)}%`;
}
