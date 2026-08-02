import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  Activity,
  AlertTriangle,
  Award,
  Briefcase,
  CalendarClock,
  ClipboardCheck,
  FileText,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import {
  DashCard,
  PageHeader,
  SectionTitle,
  StickyPageHeader,
  EmptyState,
} from "@/components/dashboard/primitives";
import { DashButton, DashButtonLink } from "@/components/dashboard/DashButton";
import { AIRecommendationsCard } from "@/components/dashboard/analytics/AIRecommendationsCard";
import { cn } from "@/lib/utils";
import { useAnalytics, useAnalyticsGoals, type GoalUpdates } from "@/features/analytics/hooks";
import {
  RANGE_PRESET_LABELS,
  RANGE_PRESET_OPTIONS,
  RESUME_MIN_SAMPLE,
} from "@/features/analytics/constants";
import { buildGoalProgress, formatPercent, type GoalTargets } from "@/features/analytics/utils";
import type {
  AnalyticsData,
  AnalyticsRangePreset,
  FunnelStage,
  FunnelStageKey,
  GoalKey,
  GoalProgress,
  ResumePerformance,
  SearchHealth,
  SearchHealthTone,
} from "@/features/analytics/types";

export const Route = createFileRoute("/dashboard/analytics")({
  head: () => ({
    meta: [{ title: "Analytics — NextOffer" }, { name: "robots", content: "noindex" }],
  }),
  component: AnalyticsPage,
});

function AnalyticsPage() {
  const [range, setRange] = useState<AnalyticsRangePreset>("last_30_days");
  const { data, isLoading, isError } = useAnalytics(range);
  const { targets, setGoals } = useAnalyticsGoals();

  return (
    <>
      <StickyPageHeader>
        <PageHeader
          eyebrow="Analytics"
          title="Signal, not vanity metrics."
          subtitle="See what's actually moving the needle — where you're getting traction and where things are stalling."
          actions={
            <div className="flex flex-wrap items-center gap-1 rounded-xl border border-black/5 bg-white p-0.5">
              {RANGE_PRESET_OPTIONS.map((r) => (
                <button
                  key={r}
                  onClick={() => setRange(r)}
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-xs transition-colors",
                    range === r
                      ? "bg-[oklch(0.95_0.02_265)] font-medium text-[#2563EB]"
                      : "text-[oklch(0.45_0.02_265)] hover:bg-black/[0.03]",
                  )}
                >
                  {RANGE_PRESET_LABELS[r]}
                </button>
              ))}
            </div>
          }
        />
      </StickyPageHeader>

      {isError ? (
        <DashCard>
          <p className="text-sm text-[oklch(0.45_0.02_265)]">
            Couldn't load your analytics right now. Try refreshing the page.
          </p>
        </DashCard>
      ) : isLoading || !data ? (
        <AnalyticsSkeleton />
      ) : data.overview.applications === 0 ? (
        <EmptyState
          icon={Briefcase}
          title={`No applications in ${RANGE_PRESET_LABELS[range].toLowerCase()}`}
          body="Log an application to start seeing your funnel, search health, and where things are getting stuck — or widen the time filter to see older activity."
          cta={<DashButtonLink to="/dashboard/applications">Go to Applications</DashButtonLink>}
        />
      ) : (
        <AnalyticsContent data={data} range={range} targets={targets} setGoals={setGoals} />
      )}
    </>
  );
}

function AnalyticsSkeleton() {
  return (
    <div className="grid gap-3 md:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <DashCard key={i} className="h-20 animate-pulse bg-black/[0.03]">
          <span className="sr-only">Loading analytics…</span>
        </DashCard>
      ))}
    </div>
  );
}

// ── Main content ──────────────────────────────────────────────────────────

const KPI_TONE: Record<string, { icon: LucideIcon; iconBg: string; iconColor: string }> = {
  Applications: { icon: Briefcase, iconBg: "bg-[#2563EB]/10", iconColor: "text-[#2563EB]" },
  Assessments: { icon: ClipboardCheck, iconBg: "bg-[#7C3AED]/10", iconColor: "text-[#7C3AED]" },
  "Interview Sessions": {
    icon: CalendarClock,
    iconBg: "bg-[#F59E0B]/15",
    iconColor: "text-[#D97706]",
  },
  Offers: { icon: Award, iconBg: "bg-[#22C55E]/15", iconColor: "text-[#16A34A]" },
};

/**
 * The current-status pipeline counts, keyed for easy reuse — sourced
 * entirely from `funnel` (already current-status-only, see
 * features/analytics/utils.ts#computeFunnel), never recomputed. KPI tiles
 * and the Health card's metric chips both read from this SAME object, so
 * "Assessments" (or any stage) can never show a different number in two
 * places on this page — there is only one number per stage, period. An
 * application currently at Offer is counted in Offers only, never also in
 * Assessments or Interviews (see computeFunnel's own tests for the pure-
 * function guarantee this relies on).
 */
type PipelineCounts = Record<FunnelStageKey, number>;

function pipelineCountsFromFunnel(funnel: FunnelStage[]): PipelineCounts {
  const counts = { applications: 0, assessments: 0, interviews: 0, offers: 0 };
  for (const stage of funnel) counts[stage.key] = stage.count;
  return counts;
}

function AnalyticsContent({
  data,
  range,
  targets,
  setGoals,
}: {
  data: AnalyticsData;
  range: AnalyticsRangePreset;
  targets: GoalTargets;
  setGoals: (updates: GoalUpdates) => Promise<{ error: string | null }>;
}) {
  const {
    overview,
    health,
    funnel,
    resumePerformance,
    unlinkedApplicationCount,
    totalResumeCount,
  } = data;
  const goals = buildGoalProgress(overview, targets);
  const pipeline = pipelineCountsFromFunnel(funnel);

  // "Interview Sessions" is deliberately NOT pipeline.interviews — it's the
  // real Interviews module (Module 7A's `interviews` table, every round
  // counted), a genuinely different metric from "applications currently at
  // the Interview stage." Labeled differently on purpose (not just
  // "Interviews," which the Current Pipeline card and Health chips already
  // use for the pipeline-stage count) so two different numbers never sit
  // under the exact same word anywhere on this page.
  const kpiTiles: { label: string; value: number }[] = [
    { label: "Applications", value: pipeline.applications },
    { label: "Assessments", value: pipeline.assessments },
    { label: "Interview Sessions", value: overview.interviewOpportunities },
    { label: "Offers", value: pipeline.offers },
  ];

  return (
    <>
      <HealthCard health={health} pipeline={pipeline} />

      <div className="grid gap-3 md:grid-cols-4">
        {kpiTiles.map((s) => {
          const tone = KPI_TONE[s.label];
          const Icon = tone.icon;
          return (
            <DashCard key={s.label} className="p-4">
              <div className="flex items-center gap-2">
                <span
                  className={cn("grid h-7 w-7 shrink-0 place-items-center rounded-lg", tone.iconBg)}
                >
                  <Icon className={cn("h-3.5 w-3.5", tone.iconColor)} />
                </span>
                <span className="text-xs font-medium text-[oklch(0.5_0.02_265)]">{s.label}</span>
              </div>
              <p className="mt-2 font-display text-3xl font-bold tracking-tight text-[oklch(0.15_0.02_265)]">
                {s.value}
              </p>
            </DashCard>
          );
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-4">
          <DashCard className="p-4">
            <SectionTitle>Current Pipeline</SectionTitle>
            <div className="mt-3 space-y-2.5">
              {funnel.map((stage) => (
                <FunnelBar key={stage.key} stage={stage} />
              ))}
            </div>
          </DashCard>

          <GoalsCard goals={goals} onSave={setGoals} />
        </div>

        <AIRecommendationsCard className="h-full" />
      </div>

      <ResumePerformanceCard
        performance={resumePerformance}
        unlinkedCount={unlinkedApplicationCount}
        totalResumeCount={totalResumeCount}
      />
    </>
  );
}

// ── Job Search Health ─────────────────────────────────────────────────────
// Status is the primary element (a large color-coded tone badge + icon for
// 2-3s recognition), Applications/Interviews/Offers run inline beneath the
// summary as bold, icon-led numbers (not a boxed metric grid — that reads as
// its own dashboard-within-a-dashboard and pushed the card too tall), and
// "Your biggest opportunity" sits on the right to keep the card's height
// minimal. Scoring/tone logic (computeSearchHealth) is untouched — only what
// is displayed changed. The 3 inline numbers still come from `pipeline`
// (current-status, same as the KPI tiles/Current Pipeline), not the older
// ever-reached `health.stats` — that's what keeps this card from ever
// disagreeing with the Kanban.

const HEALTH_CARD_TONE: Record<SearchHealthTone, string> = {
  good: "border-[#22C55E]/20 bg-gradient-to-br from-[#22C55E]/[0.07] to-[#16A34A]/[0.02]",
  neutral: "border-black/5 bg-white",
  warning: "border-[#F59E0B]/25 bg-gradient-to-br from-[#F59E0B]/[0.08] to-[#F59E0B]/[0.02]",
};

const HEALTH_BADGE_TONE: Record<SearchHealthTone, { bg: string; text: string; icon: LucideIcon }> =
  {
    good: { bg: "bg-[#16A34A]/15", text: "text-[#16A34A]", icon: TrendingUp },
    neutral: { bg: "bg-[#2563EB]/12", text: "text-[#2563EB]", icon: Activity },
    warning: { bg: "bg-[#F59E0B]/15", text: "text-[#B45309]", icon: AlertTriangle },
  };

const HEALTH_OPPORTUNITY_TONE: Record<SearchHealthTone, string> = {
  good: "border-[#16A34A]/15 bg-[#16A34A]/[0.06]",
  neutral: "border-[#2563EB]/15 bg-[#2563EB]/[0.05]",
  warning: "border-[#F59E0B]/20 bg-[#F59E0B]/[0.08]",
};

const HEALTH_INLINE_STATS: {
  key: "applications" | "interviews" | "offers";
  label: string;
  icon: LucideIcon;
  color: string;
}[] = [
  { key: "applications", label: "Applications", icon: Briefcase, color: "text-[#2563EB]" },
  { key: "interviews", label: "Interviews", icon: CalendarClock, color: "text-[#D97706]" },
  { key: "offers", label: "Offers", icon: Award, color: "text-[#16A34A]" },
];

function HealthCard({ health, pipeline }: { health: SearchHealth; pipeline: PipelineCounts }) {
  const badge = HEALTH_BADGE_TONE[health.tone];
  const BadgeIcon = badge.icon;

  return (
    <DashCard className={cn("p-4", HEALTH_CARD_TONE[health.tone])}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-xl", badge.bg)}>
              <BadgeIcon className={cn("h-4.5 w-4.5", badge.text)} />
            </span>
            <div className="min-w-0">
              <p className="font-display text-lg font-bold tracking-tight">{health.label}</p>
              <p className="text-xs text-[oklch(0.45_0.02_265)]">{health.summary}</p>
            </div>
          </div>

          <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5">
            {HEALTH_INLINE_STATS.map((s) => (
              <span key={s.key} className="inline-flex items-center gap-1.5">
                <s.icon className={cn("h-3.5 w-3.5", s.color)} />
                <span className="font-display text-sm font-bold text-[oklch(0.15_0.02_265)]">
                  {pipeline[s.key]}
                </span>
                <span className="text-xs text-[oklch(0.5_0.02_265)]">{s.label}</span>
              </span>
            ))}
          </div>
        </div>

        <div
          className={cn(
            "shrink-0 rounded-xl border px-3.5 py-2.5 sm:max-w-70",
            HEALTH_OPPORTUNITY_TONE[health.tone],
          )}
        >
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[oklch(0.5_0.02_265)]">
            Your biggest opportunity
          </p>
          <p className="mt-0.5 text-sm font-medium text-[oklch(0.25_0.02_265)]">
            {health.opportunity}
          </p>
        </div>
      </div>
    </DashCard>
  );
}

// ── Funnel ────────────────────────────────────────────────────────────────

const FUNNEL_TONE: Record<FunnelStageKey, string> = {
  applications: "from-[#93C5FD] to-[#60A5FA]",
  assessments: "from-[#C4B5FD] to-[#A78BFA]",
  interviews: "from-[#FCD34D] to-[#F59E0B]",
  offers: "from-[#86EFAC] to-[#22C55E]",
};

function FunnelBar({ stage }: { stage: FunnelStage }) {
  return (
    <div>
      <div className="flex items-baseline justify-between text-xs">
        <span className="text-[oklch(0.4_0.02_265)]">{stage.label}</span>
        <span className="font-medium">
          {stage.count}
          {stage.pctOfPrevious !== null && (
            <span className="ml-1.5 font-normal text-[oklch(0.55_0.02_265)]">
              ({stage.pctOfPrevious}%)
            </span>
          )}
        </span>
      </div>
      <div className="mt-1 h-3.5 overflow-hidden rounded-full bg-black/5">
        <div
          className={cn("h-full rounded-full bg-gradient-to-r", FUNNEL_TONE[stage.key])}
          style={{ width: `${stage.pctOfFirst}%` }}
        />
      </div>
    </div>
  );
}

// ── Resume performance ───────────────────────────────────────────────────
// AI Recommendations (see components/dashboard/analytics/AIRecommendationsCard)
// is now the one place telling the user what to do next — Focus Areas was
// removed so there's a single source of truth, not two overlapping ones.

function ResumePerformanceCard({
  performance,
  unlinkedCount,
  totalResumeCount,
}: {
  performance: ResumePerformance[];
  unlinkedCount: number;
  totalResumeCount: number;
}) {
  if (totalResumeCount === 0) {
    return (
      <DashCard>
        <SectionTitle>Resume performance</SectionTitle>
        <EmptyState
          icon={FileText}
          title="No resume uploaded"
          body="Upload your resume to unlock analytics on how it's performing across applications."
          cta={
            <DashButtonLink to="/dashboard/resumes" size="sm">
              Upload resume
            </DashButtonLink>
          }
        />
      </DashCard>
    );
  }

  if (performance.length === 0) {
    return (
      <DashCard>
        <SectionTitle>Resume performance</SectionTitle>
        <EmptyState
          icon={FileText}
          title="No applications linked to a resume yet"
          body={`You have ${totalResumeCount} resume${totalResumeCount === 1 ? "" : "s"} saved — attach one to an application to start tracking its performance.`}
          cta={
            <DashButtonLink to="/dashboard/applications" size="sm">
              Go to Applications
            </DashButtonLink>
          }
        />
      </DashCard>
    );
  }

  return (
    <DashCard>
      <SectionTitle>Resume performance</SectionTitle>
      <div className="mt-2 divide-y divide-black/5">
        {performance.map((r) => (
          <ResumeRow key={r.resumeId} resume={r} />
        ))}
      </div>
      {unlinkedCount > 0 && (
        <p className="mt-3 text-[11px] text-[oklch(0.55_0.02_265)]">
          {unlinkedCount} application{unlinkedCount === 1 ? "" : "s"} in this range aren't linked to
          a resume.
        </p>
      )}
    </DashCard>
  );
}

/**
 * One horizontal row per resume — built for scanning several resumes at
 * once, not for a single resume's own detail. Usage/interviews/offers are
 * real counts, always meaningful regardless of sample size. Comparison-
 * readiness (the rate percentages, which need volume to mean anything) is
 * secondary: a rate caption once there's enough data, or a short
 * "N more needed" note when there isn't — never the row's main focus, and
 * never a progress bar.
 */
function ResumeRow({ resume }: { resume: ResumePerformance }) {
  const remaining = RESUME_MIN_SAMPLE - resume.applications;

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 py-3 first:pt-0 last:pb-0">
      <div className="min-w-40 flex-1">
        <p className="truncate text-sm font-medium">{resume.resumeName}</p>
        {resume.isSignificant ? (
          <p className="mt-0.5 text-[11px] text-[oklch(0.55_0.02_265)]">
            Interview rate {formatPercent(resume.interviewRate)} · Offer rate{" "}
            {formatPercent(resume.offerRate)}
          </p>
        ) : (
          <p className="mt-0.5 text-[11px] text-[oklch(0.6_0.02_265)]">
            {remaining} more application{remaining === 1 ? "" : "s"} for rate comparison
          </p>
        )}
      </div>

      <div className="flex items-center gap-6 sm:gap-9">
        <ResumeStat label="Applications" value={resume.applications} />
        <ResumeStat label="Interviews" value={resume.interviews} />
        <ResumeStat label="Offers" value={resume.offers} />
      </div>
    </div>
  );
}

function ResumeStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-16 text-center">
      <p className="font-display text-base font-semibold text-[oklch(0.15_0.02_265)]">{value}</p>
      <p className="text-[10px] text-[oklch(0.5_0.02_265)]">{label}</p>
    </div>
  );
}

// ── Goals ─────────────────────────────────────────────────────────────────

function GoalsCard({
  goals,
  onSave,
}: {
  goals: GoalProgress[];
  onSave: (updates: GoalUpdates) => Promise<{ error: string | null }>;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<Record<GoalKey, number>>(
    () => Object.fromEntries(goals.map((g) => [g.key, g.target])) as Record<GoalKey, number>,
  );

  const startEditing = () => {
    setDraft(Object.fromEntries(goals.map((g) => [g.key, g.target])) as Record<GoalKey, number>);
    setEditing(true);
  };

  const handleSave = async () => {
    setSaving(true);
    const { error } = await onSave({
      goal_applications: draft.applications,
      goal_interviews: draft.interviews,
      goal_offers: draft.offers,
    });
    setSaving(false);
    if (error) {
      toast.error(error);
    } else {
      toast.success("Goals updated");
      setEditing(false);
    }
  };

  return (
    <DashCard>
      <SectionTitle
        action={
          <button
            onClick={editing ? () => setEditing(false) : startEditing}
            className="text-xs font-medium text-[#2563EB] hover:underline"
          >
            {editing ? "Cancel" : "Edit goals"}
          </button>
        }
      >
        Goals
      </SectionTitle>

      {editing ? (
        <div className="mt-4 space-y-3">
          {goals.map((g) => (
            <label key={g.key} className="block text-xs">
              <span className="text-[oklch(0.45_0.02_265)]">{g.label}</span>
              <input
                type="number"
                min={0}
                value={draft[g.key]}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, [g.key]: Math.max(0, Number(e.target.value) || 0) }))
                }
                className="mt-1 w-full rounded-lg border border-black/5 bg-white px-3 py-2 text-sm outline-none focus:border-[#2563EB]/30 focus:ring-2 focus:ring-[#2563EB]/10"
              />
            </label>
          ))}
          <DashButton size="sm" onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save goals"}
          </DashButton>
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {goals.map((g) => (
            <div key={g.key}>
              <div className="flex items-baseline justify-between text-xs">
                <span className="text-[oklch(0.4_0.02_265)]">
                  {g.label}
                  {g.isDefault && (
                    <span className="ml-1.5 text-[oklch(0.6_0.02_265)]">(recommended)</span>
                  )}
                </span>
                <span className="font-medium">
                  {g.current} of {g.target}
                </span>
              </div>
              <div className="mt-1 h-2 rounded-full bg-black/5">
                <div
                  className={cn(
                    "h-full rounded-full bg-gradient-to-r",
                    g.current >= g.target
                      ? "from-[#22C55E] to-[#16A34A]"
                      : "from-[#2563EB] to-[#7C3AED]",
                  )}
                  style={{ width: `${g.pct}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </DashCard>
  );
}
