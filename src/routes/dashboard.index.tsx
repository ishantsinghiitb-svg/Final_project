import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import {
  ArrowUpRight,
  BellRing,
  Bookmark,
  CalendarClock,
  CalendarSearch,
  CircleCheck as CheckCircle2,
  Circle,
  FileText,
  Inbox,
  Sparkles,
  Target,
  TrendingUp,
} from "lucide-react";
import { format, isSameDay, isTomorrow, parseISO } from "date-fns";
import {
  DashCard,
  PageHeader,
  SectionTitle,
  Chip,
  CompanyMark,
  StickyPageHeader,
} from "@/components/dashboard/primitives";
import { DashButtonLink } from "@/components/dashboard/DashButton";
import { useAuth } from "@/context/AuthContext";
import { useProfile } from "@/context/ProfileContext";
import { useAllInterviews } from "@/features/interviews/hooks";
import { usePendingCalendarSuggestions } from "@/features/gmail/hooks";
import { useNextUpcomingReminder } from "@/features/applications/hooks/reminders";
import { useAllApplications } from "@/features/applications/hooks";
import { useResumes } from "@/features/resumes/hooks";
import { useSidebarCounts } from "@/features/jobs/hooks";
import { useAnalytics } from "@/features/analytics/hooks";
import { roundTone } from "@/features/interviews/constants";
import { logoToneForCompany } from "@/features/jobs/utils";
import { STATUS_META, KANBAN_COLUMNS } from "@/features/applications/constants";

export const Route = createFileRoute("/dashboard/")({
  head: () => ({
    meta: [{ title: "Overview — OfferLyst" }, { name: "robots", content: "noindex" }],
  }),
  component: OverviewPage,
});

// ── Overview (rebuilt on real data) ──────────────────────────────────────────
//
// This page used to render `stats`, `jobs` and `onboardingSteps` from
// `src/lib/dashboard-data.ts`, a fixture module: the KPI row always read 24
// applications / 5 interviews / 87% match / 2 offers, the pipeline showed
// Linear/Vercel/Stripe, and the "AI coach" paragraph was a hardcoded sentence
// about an interview the user did not have. The onboarding checklist was worse
// than static — it was local `useState` seeded with step 1 already ticked, so
// it never reflected what the user had actually done and reset on reload.
//
// Everything below now comes from the same queries the rest of the dashboard
// uses, so a change made anywhere else shows up here after the usual
// invalidation. No value on this page is hardcoded.

function formatInterviewWhen(iso: string): string {
  const date = parseISO(iso);
  if (isSameDay(date, new Date())) return "Today";
  if (isTomorrow(date)) return "Tomorrow";
  return format(date, "EEE, MMM d");
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function OverviewPage() {
  const { user } = useAuth();
  const { profile } = useProfile();
  const firstName = (profile?.full_name || user?.email?.split("@")[0] || "there").split(" ")[0];

  const { data: interviews = [] } = useAllInterviews();
  // Same query the Interviews page's pending panel and the notification
  // bell read — one cache entry, three consumers.
  const { data: pendingCalendarSuggestions = [] } = usePendingCalendarSuggestions();
  const pendingCalendarCount = pendingCalendarSuggestions.length;
  const { data: nextReminder } = useNextUpcomingReminder();
  const { data: applications = [] } = useAllApplications();
  const { data: resumes = [] } = useResumes();
  const counts = useSidebarCounts();
  // "all_time" so the Overview headline numbers are the user's whole search,
  // not a windowed slice — the Analytics page is where ranges belong.
  const { data: analytics } = useAnalytics("all_time");

  const nextInterview = useMemo(() => {
    const now = new Date();
    return interviews
      .filter((i) => i.status === "scheduled" && new Date(i.scheduled_at) >= now)
      .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())[0];
  }, [interviews]);

  /**
   * Derived from what the user has actually done, never from local state, so a
   * completed step cannot show as outstanding and a reload cannot undo it.
   */
  const setupSteps = useMemo(
    () => [
      {
        id: "resume",
        label: "Upload your resume",
        detail: "Needed before anything can be scored against a job.",
        to: "/dashboard/resumes" as const,
        done: resumes.length > 0,
      },
      {
        id: "save",
        label: "Save your first job",
        detail: "Use the Chrome extension, or add one from Jobs.",
        to: "/dashboard/jobs" as const,
        done: counts.saved > 0,
      },
      {
        id: "track",
        label: "Track your first application",
        detail: "Move a saved job into your pipeline once you apply.",
        to: "/dashboard/applications" as const,
        done: applications.length > 0,
      },
      {
        id: "interview",
        label: "Add an interview",
        detail: "Prep and mock interviews build on a scheduled round.",
        to: "/dashboard/interviews" as const,
        done: interviews.length > 0,
      },
    ],
    [resumes.length, counts.saved, applications.length, interviews.length],
  );

  const stepsDone = setupSteps.filter((s) => s.done).length;
  const setupComplete = stepsDone === setupSteps.length;

  const upcomingInterviewCount = useMemo(() => {
    const now = new Date();
    return interviews.filter((i) => i.status === "scheduled" && new Date(i.scheduled_at) >= now)
      .length;
  }, [interviews]);

  const openApplications = useMemo(
    () =>
      applications.filter(
        (a) => a.status !== "rejected" && a.status !== "withdrawn" && a.status !== "accepted",
      ).length,
    [applications],
  );

  const pipeline = useMemo(() => {
    const byStatus = new Map<string, typeof applications>();
    for (const app of applications) {
      const list = byStatus.get(app.status) ?? [];
      list.push(app);
      byStatus.set(app.status, list);
    }
    // KANBAN_COLUMNS is the board's own stage order (applied → offer);
    // reusing it keeps this card in step with the pipeline page.
    return KANBAN_COLUMNS.map((status) => ({
      status,
      meta: STATUS_META[status],
      items: byStatus.get(status) ?? [],
    }));
  }, [applications]);

  const kpis = [
    {
      l: "Open applications",
      v: openApplications,
      q: "How many am I waiting on?",
      icon: Target,
      tone: "text-[#2563EB]",
      to: "/dashboard/applications" as const,
    },
    {
      l: "Upcoming interviews",
      v: upcomingInterviewCount,
      q: "What's coming up?",
      icon: CalendarClock,
      tone: "text-[#7C3AED]",
      to: "/dashboard/interviews" as const,
    },
    {
      l: "Saved jobs",
      v: counts.saved,
      q: "What have I still to act on?",
      icon: Bookmark,
      tone: "text-[#2563EB]",
      to: "/dashboard/saved" as const,
    },
    {
      l: "Offers",
      v: analytics?.overview.offers ?? 0,
      q: "How close am I to landing?",
      icon: TrendingUp,
      tone: "text-[#16A34A]",
      to: "/dashboard/analytics" as const,
    },
  ];

  return (
    <>
      <StickyPageHeader>
        <PageHeader
          eyebrow="Overview"
          title={`${greeting()}, ${firstName}.`}
          subtitle={
            setupComplete
              ? "You're all set up. Here's what needs your attention today."
              : `${stepsDone} of ${setupSteps.length} setup steps done. Here's what to do next.`
          }
          actions={
            <DashButtonLink to="/dashboard/jobs" variant="outline">
              Browse jobs
            </DashButtonLink>
          }
        />

        {pendingCalendarCount > 0 && (
          <Link to="/dashboard/inbox" className="block">
            <DashCard className="!p-3 border-[#2563EB]/15 bg-[#2563EB]/[0.03] transition-colors hover:bg-[#2563EB]/[0.06]">
              <p className="flex items-center gap-2 text-sm">
                <CalendarSearch className="h-4 w-4 shrink-0 text-[#2563EB]" />
                <span className="font-medium text-[oklch(0.2_0.02_265)]">
                  {pendingCalendarCount} interview action{pendingCalendarCount === 1 ? "" : "s"}{" "}
                  need your review
                </span>
                <ArrowUpRight className="ml-auto h-3.5 w-3.5 shrink-0 text-[#2563EB]" />
              </p>
            </DashCard>
          </Link>
        )}
      </StickyPageHeader>

      {!setupComplete && (
        <DashCard className="border-[#2563EB]/15 bg-gradient-to-br from-[#2563EB]/[0.04] to-[#7C3AED]/[0.06]">
          <div className="flex items-center justify-between">
            <SectionTitle>Set up your workspace</SectionTitle>
            <span className="text-xs text-[oklch(0.5_0.02_265)] tabular-nums">
              {stepsDone} of {setupSteps.length} done
            </span>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {setupSteps.map((step) => (
              <div
                key={step.id}
                className={`flex items-start gap-3 rounded-xl border p-3 ${
                  step.done ? "border-[#22C55E]/20 bg-[#22C55E]/[0.04]" : "border-black/5 bg-white"
                }`}
              >
                {step.done ? (
                  <CheckCircle2 className="mt-0.5 h-4.5 w-4.5 shrink-0 text-[#22C55E]" />
                ) : (
                  <Circle className="mt-0.5 h-4.5 w-4.5 shrink-0 text-[oklch(0.72_0.02_265)]" />
                )}
                <div className="min-w-0 flex-1">
                  <p
                    className={`text-[13px] font-medium ${
                      step.done ? "text-[oklch(0.5_0.02_265)]" : ""
                    }`}
                  >
                    {step.label}
                  </p>
                  {!step.done && (
                    <p className="mt-0.5 text-xs leading-snug text-[oklch(0.5_0.02_265)]">
                      {step.detail}
                    </p>
                  )}
                </div>
                {!step.done && (
                  <Link
                    to={step.to}
                    aria-label={`${step.label}: go`}
                    className="inline-flex min-h-[32px] shrink-0 items-center rounded px-2 text-xs font-medium text-[#2563EB] hover:bg-[#2563EB]/[0.06] hover:underline"
                  >
                    Go →
                  </Link>
                )}
              </div>
            ))}
          </div>
        </DashCard>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((s) => (
          <Link key={s.l} to={s.to} className="block">
            <DashCard className="h-full transition-shadow hover:shadow-md">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-[oklch(0.5_0.02_265)]">{s.l}</p>
                  <p className="mt-1 font-display text-2xl font-semibold tabular-nums">{s.v}</p>
                </div>
                <s.icon className={`h-4 w-4 shrink-0 ${s.tone}`} />
              </div>
              <p className="mt-1.5 text-[11px] text-[oklch(0.55_0.02_265)]">{s.q}</p>
            </DashCard>
          </Link>
        ))}
      </div>

      <DashCard>
        <SectionTitle
          action={
            <Link
              to="/dashboard/interviews"
              className="text-xs font-medium text-[#2563EB] hover:underline"
            >
              See all →
            </Link>
          }
        >
          Up next
        </SectionTitle>

        {nextInterview ? (
          <Link
            to="/dashboard/interviews/$interviewId"
            params={{ interviewId: nextInterview.id }}
            className="mt-3 flex items-center gap-4 rounded-xl border border-[#7C3AED]/15 bg-gradient-to-br from-[#7C3AED]/[0.06] to-[#2563EB]/[0.04] p-4 transition-colors hover:border-[#7C3AED]/30"
          >
            <CompanyMark
              company={nextInterview.company_name}
              tone={logoToneForCompany(nextInterview.company_name)}
              size={40}
              logoUrl={nextInterview.company_logo_url}
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-display font-semibold">{nextInterview.company_name}</p>
                <Chip tone={roundTone(nextInterview.type)}>{nextInterview.type}</Chip>
              </div>
              <p className="truncate text-sm text-[oklch(0.45_0.02_265)]">{nextInterview.role}</p>
              <p className="mt-1 text-xs text-[oklch(0.5_0.02_265)]">
                {formatInterviewWhen(nextInterview.scheduled_at)} ·{" "}
                {format(parseISO(nextInterview.scheduled_at), "h:mm a")}
                {nextInterview.interviewer ? ` · with ${nextInterview.interviewer}` : ""}
              </p>
            </div>
            <ArrowUpRight className="hidden h-4 w-4 shrink-0 text-[#7C3AED] md:block" />
          </Link>
        ) : (
          <p className="mt-3 rounded-xl border border-black/5 bg-[oklch(0.98_0.005_265)] p-4 text-sm text-[oklch(0.5_0.02_265)]">
            No interviews scheduled. They appear here once you add one, or accept a suggestion from
            your inbox.
          </p>
        )}

        {nextReminder && (
          <div className="mt-3 flex items-center gap-3 rounded-xl border border-black/5 bg-[oklch(0.98_0.005_265)] p-3">
            <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#0891B2]/10 text-[#0891B2]">
              <BellRing className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-[oklch(0.2_0.02_265)]">
                {nextReminder.title}
              </p>
              <p className="text-xs text-[oklch(0.5_0.02_265)]">
                {formatInterviewWhen(nextReminder.remind_at)} ·{" "}
                {format(parseISO(nextReminder.remind_at), "h:mm a")}
              </p>
            </div>
          </div>
        )}
      </DashCard>

      <DashCard>
        <SectionTitle
          action={
            <Link
              to="/dashboard/applications"
              className="text-xs font-medium text-[#2563EB] hover:underline"
            >
              Open pipeline →
            </Link>
          }
        >
          Pipeline at a glance
        </SectionTitle>
        {applications.length === 0 ? (
          <p className="mt-3 rounded-xl border border-black/5 bg-[oklch(0.98_0.005_265)] p-4 text-sm text-[oklch(0.5_0.02_265)]">
            Nothing tracked yet. Applications you start appear here by stage.
          </p>
        ) : (
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {pipeline.map((col) => (
              <div
                key={col.status}
                className="rounded-xl border border-black/5 bg-[oklch(0.98_0.005_265)] p-3"
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="inline-flex items-center gap-1.5 font-semibold">
                    <span className={`h-1.5 w-1.5 rounded-full ${col.meta.dot}`} />
                    {col.meta.label}
                  </span>
                  <span className="text-[oklch(0.55_0.02_265)] tabular-nums">
                    {col.items.length}
                  </span>
                </div>
                <div className="mt-2 space-y-2">
                  {col.items.slice(0, 2).map((it) => (
                    <Link
                      key={it.id}
                      to="/dashboard/applications/$applicationId"
                      params={{ applicationId: it.id }}
                      className="block rounded-lg border border-black/5 bg-white p-2.5 transition-shadow hover:shadow-sm"
                    >
                      <div className="flex items-center gap-2">
                        <CompanyMark
                          company={it.company_name}
                          tone={logoToneForCompany(it.company_name)}
                          size={20}
                          logoUrl={it.company_logo_url}
                        />
                        <p className="truncate text-xs font-semibold">{it.company_name}</p>
                      </div>
                      <p className="mt-1 truncate text-[11px] text-[oklch(0.5_0.02_265)]">
                        {it.role}
                      </p>
                    </Link>
                  ))}
                  {col.items.length > 2 && (
                    <p className="px-1 text-[11px] text-[oklch(0.55_0.02_265)]">
                      +{col.items.length - 2} more
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </DashCard>

      <DashCard>
        <SectionTitle>Quick actions</SectionTitle>
        <div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
          {[
            { l: "Resumes", i: FileText, to: "/dashboard/resumes" as const },
            { l: "Cover letters", i: Sparkles, to: "/dashboard/cover-letters" as const },
            { l: "Interviews", i: CalendarClock, to: "/dashboard/interviews" as const },
            { l: "Inbox", i: Inbox, to: "/dashboard/inbox" as const },
          ].map((q) => (
            <Link
              key={q.l}
              to={q.to}
              className="flex items-center gap-2 rounded-xl border border-black/5 bg-[oklch(0.98_0.005_265)] px-3 py-2.5 text-[13px] transition-colors hover:bg-black/[0.03]"
            >
              <q.i className="h-4 w-4 shrink-0 text-[#2563EB]" />
              {q.l}
            </Link>
          ))}
        </div>
      </DashCard>
    </>
  );
}
