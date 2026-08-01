import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  Award,
  Briefcase,
  CalendarClock,
  ClipboardCheck,
  FileText,
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

const KPI_GRID_COLS: Record<number, string> = {
  3: "md:grid-cols-3",
  4: "md:grid-cols-4",
  5: "md:grid-cols-5",
};

const KPI_TONE: Record<string, { icon: LucideIcon; iconBg: string; iconColor: string }> = {
  Applications: { icon: Briefcase, iconBg: "bg-[#2563EB]/10", iconColor: "text-[#2563EB]" },
  Assessments: { icon: ClipboardCheck, iconBg: "bg-[#7C3AED]/10", iconColor: "text-[#7C3AED]" },
  Interviews: { icon: CalendarClock, iconBg: "bg-[#F59E0B]/15", iconColor: "text-[#D97706]" },
  Offers: { icon: Award, iconBg: "bg-[#22C55E]/15", iconColor: "text-[#16A34A]" },
};

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

  const kpiTiles: { label: string; value: number }[] = [
    { label: "Applications", value: overview.applications },
    ...(overview.hasAssessmentStage ? [{ label: "Assessments", value: overview.assessments }] : []),
    { label: "Interviews", value: overview.interviewOpportunities },
    { label: "Offers", value: overview.offers },
  ];

  return (
    <>
      <HealthCard health={health} />

      <div className={cn("grid gap-3", KPI_GRID_COLS[kpiTiles.length] ?? "md:grid-cols-4")}>
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
        <DashCard>
          <SectionTitle>Application funnel</SectionTitle>
          <div className="mt-4 space-y-3">
            {funnel.map((stage) => (
              <FunnelBar key={stage.key} stage={stage} />
            ))}
          </div>
        </DashCard>

        <AIRecommendationsCard />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ResumePerformanceCard
          performance={resumePerformance}
          unlinkedCount={unlinkedApplicationCount}
          totalResumeCount={totalResumeCount}
        />
        <GoalsCard goals={goals} onSave={setGoals} />
      </div>
    </>
  );
}

// ── Job Search Health ─────────────────────────────────────────────────────

const HEALTH_CARD_TONE: Record<SearchHealthTone, string> = {
  good: "border-[#22C55E]/20 bg-gradient-to-br from-[#22C55E]/[0.07] to-[#16A34A]/[0.02]",
  neutral: "border-black/5 bg-white",
  warning: "border-[#F59E0B]/25 bg-gradient-to-br from-[#F59E0B]/[0.08] to-[#F59E0B]/[0.02]",
};

const HEALTH_DOT_TONE: Record<SearchHealthTone, string> = {
  good: "bg-[#16A34A]",
  neutral: "bg-[#2563EB]",
  warning: "bg-[#F59E0B]",
};

const HEALTH_OPPORTUNITY_TONE: Record<SearchHealthTone, string> = {
  good: "border-[#16A34A]/15 bg-[#16A34A]/[0.06]",
  neutral: "border-[#2563EB]/15 bg-[#2563EB]/[0.05]",
  warning: "border-[#F59E0B]/20 bg-[#F59E0B]/[0.08]",
};

function HealthCard({ health }: { health: SearchHealth }) {
  return (
    <DashCard className={cn("p-4", HEALTH_CARD_TONE[health.tone])}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className={cn("h-2 w-2 shrink-0 rounded-full", HEALTH_DOT_TONE[health.tone])} />
            <p className="font-display text-lg font-bold tracking-tight">{health.label}</p>
          </div>
          <p className="mt-0.5 text-xs text-[oklch(0.45_0.02_265)]">{health.summary}</p>

          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
            {health.stats.map((s) => (
              <span key={s.label} className="text-xs">
                <span className="font-display text-sm font-bold text-[oklch(0.2_0.02_265)]">
                  {s.value}
                </span>{" "}
                <span className="text-[oklch(0.5_0.02_265)]">{s.label}</span>
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
      <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-black/5">
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

  const solo = performance.length === 1;

  return (
    <DashCard>
      <SectionTitle>Resume performance</SectionTitle>
      <div
        className={cn("mt-4 grid gap-3", solo ? "mx-auto max-w-sm grid-cols-1" : "sm:grid-cols-2")}
      >
        {performance.map((r) => (
          <ResumeRow key={r.resumeId} resume={r} solo={solo} />
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

function ResumeRow({ resume, solo }: { resume: ResumePerformance; solo: boolean }) {
  const remaining = RESUME_MIN_SAMPLE - resume.applications;

  return (
    <div
      className={cn(
        "rounded-xl border border-black/5 bg-[oklch(0.98_0.005_265)] p-3",
        solo && "p-4",
      )}
    >
      <p className={cn("truncate font-medium", solo ? "text-base" : "text-sm")}>
        {resume.resumeName}
      </p>

      {resume.isSignificant ? (
        <>
          <p className="mt-0.5 text-[11px] text-[oklch(0.55_0.02_265)]">
            {resume.applications} applications
          </p>
          <div className={cn("mt-2.5 grid grid-cols-2 gap-3", solo && "max-w-xs")}>
            <div>
              <p className="text-[11px] text-[oklch(0.5_0.02_265)]">Interview rate</p>
              <p className="mt-0.5 font-display text-base font-semibold">
                {formatPercent(resume.interviewRate)}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-[oklch(0.5_0.02_265)]">Offer rate</p>
              <p className="mt-0.5 font-display text-base font-semibold">
                {formatPercent(resume.offerRate)}
              </p>
            </div>
          </div>
        </>
      ) : (
        <p className="mt-1 text-[11px] text-[oklch(0.55_0.02_265)]">
          Used in {resume.applications} application{resume.applications === 1 ? "" : "s"}
          <br />
          Need {remaining} more application{remaining === 1 ? "" : "s"} before comparison.
        </p>
      )}
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
