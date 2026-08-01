// ── Time range ────────────────────────────────────────────────────────────

export type AnalyticsRangePreset = "last_7_days" | "last_30_days" | "last_90_days" | "all_time";

// ── Overview / KPIs ──────────────────────────────────────────────────────
//
// One clear source of truth per metric:
//   - applications        — total tracked applications in range
//   - assessments         — applications that ever reached "online_assessment"
//                            (from application_activity history — a later
//                            rejection never erases that it happened)
//   - applicationsWithInterview / interviewOpportunities — see below
//   - offers / accepted   — applications that ever reached "offer"/"accepted"

export type AnalyticsOverview = {
  applications: number;

  /** Whether to show the Assessments stage at all — hidden, not zero-forced, when this user's pipeline never uses it. */
  hasAssessmentStage: boolean;
  assessments: number;
  assessmentRate: number;

  /** Applications with >= 1 linked interview — used for the funnel and "X out of Y applications" language, so it never exceeds `applications`. */
  applicationsWithInterview: number;
  interviewRate: number;
  /** Total interview opportunities (each round counts) — the KPI headline number, e.g. "3 interviews". */
  interviewOpportunities: number;
  interviewOpportunitiesUpcoming: number;
  interviewOpportunitiesCompleted: number;

  offers: number;
  offerRate: number;
  accepted: number;

  /** "Progressed beyond Applied" — internal input to the Health card's narrative, not shown as its own KPI/funnel stage. */
  progressed: number;
  progressedRate: number;
};

// ── Job Search Health (deterministic, rule-based — no AI) ───────────────

export type SearchHealthTone = "neutral" | "good" | "warning";

export type SearchHealth = {
  tone: SearchHealthTone;
  label: string;
  /** Short caption under the label, e.g. "Applications progressing well". */
  summary: string;
  /** The real counts behind the verdict — rendered ahead of the narrative, numbers first. */
  stats: { label: string; value: number }[];
  /** The specific weakest stage, named as an action — never a bare percentage. */
  opportunity: string;
};

// ── Application funnel ───────────────────────────────────────────────────
// Stops at Offers — "Accepted" isn't useful for this dashboard's funnel view.

export type FunnelStageKey = "applications" | "assessments" | "interviews" | "offers";

export type FunnelStage = {
  key: FunnelStageKey;
  label: string;
  count: number;
  /** Bar width relative to the Applications stage, 0..100. */
  pctOfFirst: number;
  /** Stage-to-stage conversion — null when the previous stage's count is 0. */
  pctOfPrevious: number | null;
};

// ── Where you're stuck ───────────────────────────────────────────────────
// Deterministic, rule-based bullets answering "where should I focus next?"
// — every rule is a plain fact derived from real application/interview
// data, never a guess. Empty array renders as "Everything is progressing
// normally."

export type StuckInsightTone = "warning" | "neutral" | "good";

export type StuckInsight = {
  id: string;
  tone: StuckInsightTone;
  text: string;
};

// ── Resume performance ───────────────────────────────────────────────────

export type ResumePerformance = {
  resumeId: string;
  resumeName: string;
  applications: number;
  interviews: number;
  offers: number;
  /** null while the resume is below the significance floor — never render a rate for these. */
  interviewRate: number | null;
  offerRate: number | null;
  isSignificant: boolean;
};

// ── Goals ─────────────────────────────────────────────────────────────────

export type GoalKey = "applications" | "interviews" | "offers";

export type GoalProgress = {
  key: GoalKey;
  label: string;
  current: number;
  target: number;
  /** true when the profile column was null — target is the recommended default, not user-set. */
  isDefault: boolean;
  /** clamp(current/target*100, 0, 100) — sizes the bar only; the headline is always "current of target". */
  pct: number;
};

// ── Aggregate response ───────────────────────────────────────────────────

export type AnalyticsData = {
  range: AnalyticsRangePreset;
  overview: AnalyticsOverview;
  health: SearchHealth;
  funnel: FunnelStage[];
  stuckInsights: StuckInsight[];
  resumePerformance: ResumePerformance[];
  /** In-range applications with no resume_id — distinguishes "not linked yet" from "no resume uploaded". */
  unlinkedApplicationCount: number;
  /** Total resumes the user owns, regardless of the selected range. */
  totalResumeCount: number;
};
