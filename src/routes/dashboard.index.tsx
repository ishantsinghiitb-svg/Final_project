import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowUpRight, Briefcase, CalendarClock, CircleCheck as CheckCircle2, Circle, FileText, Flame, Plus, Sparkles, Target, TrendingUp, Clock, Send, Wand as Wand2, CircleAlert as AlertCircle } from "lucide-react";
import { DashCard, PageHeader, SectionTitle, Chip, CompanyMark } from "@/components/dashboard/primitives";
import { DashButtonLink } from "@/components/dashboard/DashButton";
import {
  actionItems,
  interviews,
  jobs,
  stats,
  stageMeta,
  onboardingSteps,
  type ActionItem,
} from "@/lib/dashboard-data";

export const Route = createFileRoute("/dashboard/")({
  head: () => ({ meta: [{ title: "Overview — NextOffer" }, { name: "robots", content: "noindex" }] }),
  component: OverviewPage,
});

const actionIcon: Record<ActionItem["kind"], React.ComponentType<{ className?: string }>> = {
  interview: CalendarClock,
  followup: Send,
  resume: FileText,
  deadline: AlertCircle,
  match: Sparkles,
  apply: Briefcase,
};

const priorityTone: Record<ActionItem["priority"], string> = {
  high: "border-[#7C3AED]/20 bg-gradient-to-br from-[#7C3AED]/[0.06] to-[#2563EB]/[0.04]",
  medium: "border-black/5 bg-[oklch(0.98_0.005_265)]",
  low: "border-black/5 bg-white",
};

function OverviewPage() {
  const [onboardingDone, setOnboardingDone] = useState<Set<string>>(new Set(["ob1"]));
  const nextInterview = interviews[0];
  const suggested = jobs.filter((j) => !j.stage).slice(0, 3);
  const onboardingComplete = onboardingDone.size === onboardingSteps.length;

  return (
    <>
      <PageHeader
        eyebrow="Overview"
        title="Good afternoon, Ava."
        subtitle={onboardingComplete ? "You're all set up. Here's what needs your attention today." : "A few setup steps left, then your workspace is fully tuned. Here's what to do next."}
        actions={
          <>
            <DashButtonLink to="/dashboard/interviews" variant="outline" className="hidden sm:inline-flex">
              <CalendarClock className="h-4 w-4" /> This week
            </DashButtonLink>
            <DashButtonLink to="/dashboard/jobs">
              <Plus className="h-4 w-4" /> Add job
            </DashButtonLink>
          </>
        }
      />

      {/* Onboarding checklist — only while incomplete */}
      {!onboardingComplete && (
        <DashCard className="border-[#2563EB]/15 bg-gradient-to-br from-[#2563EB]/[0.04] to-[#7C3AED]/[0.06]">
          <div className="flex items-center justify-between">
            <SectionTitle>Set up your workspace</SectionTitle>
            <span className="text-xs text-[oklch(0.5_0.02_265)]">
              {onboardingDone.size} of {onboardingSteps.length} done
            </span>
          </div>
          <p className="mt-1 text-xs text-[oklch(0.5_0.02_265)]">
            A few steps to get your search moving. Each one takes under a minute.
          </p>
          <div className="mt-4 grid gap-2 md:grid-cols-2">
            {onboardingSteps.map((step) => {
              const done = onboardingDone.has(step.id);
              return (
                <button
                  key={step.id}
                  onClick={() =>
                    setOnboardingDone((prev) => {
                      const next = new Set(prev);
                      if (done) next.delete(step.id);
                      else next.add(step.id);
                      return next;
                    })
                  }
                  className={`flex items-start gap-3 rounded-xl border p-3 text-left transition-colors ${
                    done ? "border-[#22C55E]/20 bg-[#22C55E]/[0.04]" : "border-black/5 bg-white hover:bg-black/[0.02]"
                  }`}
                >
                  {done ? (
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[#22C55E]" />
                  ) : (
                    <Circle className="mt-0.5 h-5 w-5 shrink-0 text-[oklch(0.7_0.02_265)]" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm font-medium ${done ? "text-[oklch(0.5_0.02_265)] line-through" : ""}`}>
                      {step.label}
                    </p>
                    <p className="text-xs text-[oklch(0.5_0.02_265)]">{step.detail}</p>
                  </div>
                  {!done && (
                    <Link
                      to={step.to}
                      onClick={(e) => e.stopPropagation()}
                      className="shrink-0 text-xs font-medium text-[#2563EB] hover:underline"
                    >
                      Go →
                    </Link>
                  )}
                </button>
              );
            })}
          </div>
        </DashCard>
      )}

      {/* Stats — each answers one question */}
      <div className="grid gap-4 md:grid-cols-4">
        {[
          { l: "Active applications", v: stats.activeApps, q: "How many am I waiting on?", icon: Target, tone: "text-[#2563EB]" },
          { l: "Interviews this week", v: stats.interviews, q: "What's coming up?", icon: CalendarClock, tone: "text-[#7C3AED]" },
          { l: "Avg. match score", v: stats.matchAvg + "%", q: "Am I aiming at the right roles?", icon: Sparkles, tone: "text-[#2563EB]" },
          { l: "Offers", v: stats.offers, q: "How close am I to landing?", icon: TrendingUp, tone: "text-[#16A34A]" },
        ].map((s) => (
          <DashCard key={s.l}>
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-[oklch(0.5_0.02_265)]">{s.l}</p>
                <p className="mt-1 font-display text-2xl font-semibold">{s.v}</p>
              </div>
              <s.icon className={`h-4 w-4 ${s.tone}`} />
            </div>
            <p className="mt-1.5 text-[11px] text-[oklch(0.55_0.02_265)]">{s.q}</p>
          </DashCard>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        {/* Up next */}
        <DashCard>
          <SectionTitle
            action={
              <Link to="/dashboard/interviews" className="text-xs font-medium text-[#2563EB] hover:underline">
                See all →
              </Link>
            }
          >
            Up next
          </SectionTitle>
          {nextInterview && (
            <div className="mt-4 flex items-center gap-4 rounded-xl border border-[#7C3AED]/15 bg-gradient-to-br from-[#7C3AED]/[0.06] to-[#2563EB]/[0.04] p-4">
              <CompanyMark company={nextInterview.company} tone="from-[#7C3AED] to-[#2563EB]" size={44} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="font-display font-semibold">{nextInterview.company}</p>
                  <Chip tone="purple">{nextInterview.type}</Chip>
                </div>
                <p className="text-sm text-[oklch(0.45_0.02_265)]">{nextInterview.role}</p>
                <p className="mt-1 text-xs text-[oklch(0.5_0.02_265)]">
                  {nextInterview.when} · {nextInterview.time} · with {nextInterview.interviewer}
                </p>
              </div>
              <DashButtonLink to="/dashboard/interviews" variant="outline" className="hidden md:inline-flex">
                Prep with AI <Sparkles className="h-3.5 w-3.5 text-[#7C3AED]" />
              </DashButtonLink>
            </div>
          )}

          <div className="mt-5">
            <SectionTitle>Weekly focus</SectionTitle>
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              {[
                { icon: CheckCircle2, label: "Apply to 8 roles", done: `${stats.weeklyDone}/${stats.weeklyGoal}`, pct: (stats.weeklyDone / stats.weeklyGoal) * 100 },
                { icon: Flame, label: "Follow up on stale apps", done: "2 waiting", pct: 40 },
                { icon: Sparkles, label: "Tailor 3 resumes", done: "2/3", pct: 66 },
              ].map((g) => (
                <div key={g.label} className="rounded-xl border border-black/5 bg-[oklch(0.98_0.005_265)] p-3">
                  <div className="flex items-center gap-2 text-sm">
                    <g.icon className="h-4 w-4 text-[#2563EB]" />
                    <span className="font-medium">{g.label}</span>
                  </div>
                  <p className="mt-2 text-xs text-[oklch(0.5_0.02_265)]">{g.done}</p>
                  <div className="mt-2 h-1.5 rounded-full bg-black/5">
                    <div className="h-full rounded-full bg-gradient-to-r from-[#2563EB] to-[#7C3AED]" style={{ width: `${g.pct}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </DashCard>

        {/* Action Center — replaces Recent Activity */}
        <DashCard>
          <SectionTitle action={<span className="text-xs text-[oklch(0.5_0.02_265)]">{actionItems.length} tasks</span>}>
            What to do next
          </SectionTitle>
          <p className="mt-1 text-xs text-[oklch(0.5_0.02_265)]">
            Actionable steps, ranked by priority.
          </p>
          <ul className="mt-4 space-y-2.5">
            {actionItems.map((a) => {
              const Icon = actionIcon[a.kind];
              return (
                <li key={a.id} className={`rounded-xl border p-3 ${priorityTone[a.priority]}`}>
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-white text-[#2563EB] shadow-sm">
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium leading-snug">{a.title}</p>
                      <p className="mt-0.5 text-xs text-[oklch(0.5_0.02_265)]">{a.detail}</p>
                      <Link
                        to={a.to}
                        className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-[#2563EB] hover:underline"
                      >
                        {a.cta} <ArrowUpRight className="h-3 w-3" />
                      </Link>
                    </div>
                    {a.priority === "high" && (
                      <span className="shrink-0 rounded-full bg-[#7C3AED]/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-[#7C3AED]">
                        Now
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </DashCard>
      </div>

      {/* Pipeline at a glance */}
      <DashCard>
        <SectionTitle
          action={
            <Link to="/dashboard/applications" className="text-xs font-medium text-[#2563EB] hover:underline">
              Open pipeline →
            </Link>
          }
        >
          Pipeline at a glance
        </SectionTitle>
        <div className="mt-4 grid gap-3 md:grid-cols-4">
          {(["interested", "applied", "interview", "offer"] as const).map((stage) => {
            const list = jobs.filter((j) => j.stage === stage).slice(0, 2);
            const meta = stageMeta[stage];
            return (
              <div key={stage} className="rounded-xl border border-black/5 bg-[oklch(0.98_0.005_265)] p-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="inline-flex items-center gap-1.5 font-semibold">
                    <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
                    {meta.label}
                  </span>
                  <span className="text-[oklch(0.55_0.02_265)]">
                    {jobs.filter((j) => j.stage === stage).length}
                  </span>
                </div>
                <div className="mt-2 space-y-2">
                  {list.map((it) => (
                    <div key={it.id} className="rounded-lg border border-black/5 bg-white p-2.5">
                      <div className="flex items-center gap-2">
                        <CompanyMark company={it.company} tone={it.logoTone} size={22} />
                        <p className="truncate text-xs font-semibold">{it.company}</p>
                      </div>
                      <p className="mt-1 truncate text-[11px] text-[oklch(0.5_0.02_265)]">{it.role}</p>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </DashCard>

      {/* Suggested jobs */}
      <DashCard>
        <SectionTitle
          action={
            <Link to="/dashboard/jobs" className="text-xs font-medium text-[#2563EB] hover:underline">
              Browse jobs →
            </Link>
          }
        >
          Suggested for you
        </SectionTitle>
        <p className="mt-1 text-xs text-[oklch(0.5_0.02_265)]">
          Based on your saved roles and resume.
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {suggested.map((j) => (
            <div key={j.id} className="group rounded-xl border border-black/5 bg-white p-4 transition-shadow hover:shadow-md">
              <div className="flex items-start justify-between">
                <CompanyMark company={j.company} tone={j.logoTone} size={36} />
                <Chip tone={j.match >= 88 ? "green" : "blue"}>{j.match}% match</Chip>
              </div>
              <p className="mt-3 font-display font-semibold">{j.role}</p>
              <p className="text-xs text-[oklch(0.5_0.02_265)]">
                {j.company} · {j.location}
              </p>
              <div className="mt-3 flex items-center justify-between text-xs">
                <span className="text-[oklch(0.5_0.02_265)]">{j.salary}</span>
                <Link to="/dashboard/jobs" className="inline-flex items-center gap-1 font-medium text-[#2563EB]">
                  Save <ArrowUpRight className="h-3 w-3" />
                </Link>
              </div>
            </div>
          ))}
        </div>
      </DashCard>

      {/* AI coach + quick actions */}
      <div className="grid gap-4 md:grid-cols-2">
        <DashCard>
          <SectionTitle>Quick actions</SectionTitle>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {[
              { l: "Tailor a resume", i: Sparkles, to: "/dashboard/resumes" as const },
              { l: "Generate cover letter", i: FileText, to: "/dashboard/resumes" as const },
              { l: "Prep for interview", i: CalendarClock, to: "/dashboard/interviews" as const },
              { l: "Add a job", i: Briefcase, to: "/dashboard/jobs" as const },
            ].map((q) => (
              <Link
                key={q.l}
                to={q.to}
                className="flex items-center gap-2 rounded-xl border border-black/5 bg-[oklch(0.98_0.005_265)] px-3 py-2.5 text-sm hover:bg-black/[0.03]"
              >
                <q.i className="h-4 w-4 text-[#2563EB]" />
                {q.l}
              </Link>
            ))}
          </div>
        </DashCard>
        <DashCard className="bg-gradient-to-br from-[#2563EB]/[0.06] to-[#7C3AED]/[0.08]">
          <SectionTitle>Your AI coach says</SectionTitle>
          <p className="mt-3 text-sm leading-relaxed">
            Your average match score is holding at 87%. Two applications have gone
            quiet for over a week — a short follow-up usually gets them moving
            again. Linear's interview is today; you're ready.
          </p>
          <div className="mt-4">
            <DashButtonLink to="/dashboard/analytics" variant="outline" size="sm">
              See analytics <ArrowUpRight className="h-3 w-3" />
            </DashButtonLink>
          </div>
        </DashCard>
      </div>
    </>
  );
}
