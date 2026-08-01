import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  Award,
  Briefcase,
  CalendarClock,
  CheckCircle2,
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
import { cn } from "@/lib/utils";
import { useAnalytics, useAnalyticsGoals, type GoalUpdates } from "@/features/analytics/hooks";
import {
  RANGE_PRESET_LABELS,
  RANGE_PRESET_OPTIONS,
  RESUME_MIN_SAMPLE,
} from "@/features/analytics/constants";
import {
  buildFocusAreas,
  buildGoalProgress,
  computeGoalFocusArea,
  formatPercent,
  fractionSentence,
  type GoalTargets,
} from "@/features/analytics/utils";
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
  StuckInsightTone,
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
    stuckInsights,
    resumePerformance,
    unlinkedApplicationCount,
    totalResumeCount,
  } = data;
  const goals = buildGoalProgress(overview, targets);
  const goalInsight = computeGoalFocusArea(goals);
  const focusAreas = buildFocusAreas(goalInsight ? [...stuckInsights, goalInsight] : stuckInsights);

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

      <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
        <DashCard>
          <SectionTitle>Application funnel</SectionTitle>
          <div className="mt-4 space-y-3">
            {funnel.map((stage) => (
              <FunnelBar key={stage.key} stage={stage} />
            ))}
          </div>
        </DashCard>

        <FocusAreasCard items={focusAreas} />
      </div>

      <ResumePerformanceCard
        performance={resumePerformance}
        unlinkedCount={unlinkedApplicationCount}
        totalResumeCount={totalResumeCount}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <GoalsCard goals={goals} onSave={setGoals} />
        <ActionSummaryCard overview={overview} />
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
    <DashCard className={HEALTH_CARD_TONE[health.tone]}>
      <div className="flex items-center gap-2.5">
        <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", HEALTH_DOT_TONE[health.tone])} />
        <p className="font-display text-xl font-bold tracking-tight">{health.label}</p>
      </div>
      <p className="mt-1 text-sm text-[oklch(0.45_0.02_265)]">{health.summary}</p>

      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1">
        {health.stats.map((s) => (
          <span key={s.label} className="text-sm">
            <span className="font-display text-base font-bold text-[oklch(0.2_0.02_265)]">
              {s.value}
            </span>{" "}
            <span className="text-[oklch(0.5_0.02_265)]">{s.label}</span>
          </span>
        ))}
      </div>

      <div
        className={cn("mt-3 rounded-xl border px-3.5 py-2.5", HEALTH_OPPORTUNITY_TONE[health.tone])}
      >
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[oklch(0.5_0.02_265)]">
          Your biggest opportunity
        </p>
        <p className="mt-0.5 text-sm font-medium text-[oklch(0.25_0.02_265)]">
          {health.opportunity}
        </p>
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

// ── Focus areas ───────────────────────────────────────────────────────────
// Deterministic action cards answering "what should I do next?" — every rule
// is a plain fact from real application/interview/goal data (see
// computeStuckInsights/computeGoalFocusArea/buildFocusAreas). Never fewer
// than a handful of cards: fixed, generic guidance fills any remaining slots
// so the panel never looks sparse.

const FOCUS_TONE: Record<StuckInsightTone, { bg: string; text: string }> = {
  warning: { bg: "bg-[#F59E0B]/15", text: "text-[#D97706]" },
  neutral: { bg: "bg-[#2563EB]/10", text: "text-[#2563EB]" },
  good: { bg: "bg-[#16A34A]/15", text: "text-[#16A34A]" },
};

function FocusAreasCard({ items }: { items: StuckInsight[] }) {
  return (
    <DashCard>
      <SectionTitle>Focus Areas</SectionTitle>
      <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
        {items.map((item) => (
          <div
            key={item.id}
            className="flex items-start gap-2.5 rounded-xl border border-black/5 bg-[oklch(0.98_0.005_265)] p-3"
          >
            <span
              className={cn(
                "mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full",
                FOCUS_TONE[item.tone].bg,
              )}
            >
              <CheckCircle2 className={cn("h-3 w-3", FOCUS_TONE[item.tone].text)} />
            </span>
            <p className="text-sm text-[oklch(0.3_0.02_265)]">{item.text}</p>
          </div>
        ))}
      </div>
    </DashCard>
  );
}

// ── Resume performance ───────────────────────────────────────────────────

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
        className={cn(
          "mt-4 grid gap-3",
          solo ? "mx-auto max-w-sm grid-cols-1" : "sm:grid-cols-2 xl:grid-cols-3",
        )}
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
        "rounded-xl border border-black/5 bg-[oklch(0.98_0.005_265)]",
        solo ? "p-5" : "p-3",
      )}
    >
      <p className={cn("truncate font-medium", solo ? "text-base" : "text-sm")}>
        {resume.resumeName}
      </p>
      <p className="mt-0.5 text-[11px] text-[oklch(0.55_0.02_265)]">
        Used in {resume.applications} application{resume.applications === 1 ? "" : "s"}
      </p>

      {resume.isSignificant ? (
        <>
          <div className={cn("mt-3 grid grid-cols-2 gap-3", solo && "max-w-xs")}>
            <div>
              <p className="text-xs text-[oklch(0.5_0.02_265)]">Interview rate</p>
              <p className="mt-0.5 font-display text-lg font-semibold">
                {formatPercent(resume.interviewRate)}
              </p>
            </div>
            <div>
              <p className="text-xs text-[oklch(0.5_0.02_265)]">Offer rate</p>
              <p className="mt-0.5 font-display text-lg font-semibold">
                {formatPercent(resume.offerRate)}
              </p>
            </div>
          </div>
          <p className="mt-2.5 text-[11px] text-[oklch(0.55_0.02_265)]">
            Based on {resume.applications} applications — enough data to trust these rates.
          </p>
        </>
      ) : (
        <div className="mt-3">
          <div className="flex items-baseline justify-between text-[11px]">
            <span className="text-[oklch(0.5_0.02_265)]">Progress to compare performance</span>
            <span className="text-[oklch(0.5_0.02_265)]">
              {resume.applications} of {RESUME_MIN_SAMPLE}
            </span>
          </div>
          <div className="mt-1 h-1.5 rounded-full bg-black/5">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#2563EB] to-[#7C3AED]"
              style={{
                width: `${Math.min(100, (resume.applications / RESUME_MIN_SAMPLE) * 100)}%`,
              }}
            />
          </div>
          <p className="mt-1.5 text-[11px] text-[oklch(0.55_0.02_265)]">
            {remaining} more application{remaining === 1 ? "" : "s"} needed to unlock comparison.
          </p>
        </div>
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

// ── What this means ───────────────────────────────────────────────────────
// Plain-English fractions, no percentages, no tone judgment (that's the
// Health card's one job) — just the fact, stated in numbers a first-time
// visitor can read at a glance.

function ActionSummaryCard({ overview }: { overview: AnalyticsOverview }) {
  const rows: string[] = [];
  if (overview.hasAssessmentStage) {
    rows.push(
      fractionSentence(
        overview.assessments,
        overview.applications,
        "applications reached an assessment.",
      ),
    );
  }
  rows.push(
    fractionSentence(
      overview.applicationsWithInterview,
      overview.applications,
      "applications resulted in an interview opportunity.",
    ),
  );
  rows.push(
    fractionSentence(overview.offers, overview.applications, "applications resulted in an offer."),
  );

  return (
    <DashCard>
      <SectionTitle>What this means</SectionTitle>
      <ul className="mt-3 space-y-2.5 text-sm">
        {rows.map((text) => (
          <li key={text} className="flex items-start gap-2">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[oklch(0.6_0.02_265)]" />
            <span>{text}</span>
          </li>
        ))}
      </ul>
    </DashCard>
  );
}
