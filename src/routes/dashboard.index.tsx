import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowUpRight,
  Briefcase,
  CalendarClock,
  CheckCircle2,
  FileText,
  Flame,
  Plus,
  Sparkles,
  Target,
  TrendingUp,
} from "lucide-react";
import { DashCard, PageHeader, SectionTitle, Chip, CompanyMark } from "@/components/dashboard/primitives";
import { activity, interviews, jobs, stats, stageMeta } from "@/lib/dashboard-data";

export const Route = createFileRoute("/dashboard/")({
  head: () => ({ meta: [{ title: "Overview — NextOffer" }, { name: "robots", content: "noindex" }] }),
  component: OverviewPage,
});

const kindDot: Record<string, string> = {
  interview: "bg-[#7C3AED]",
  match: "bg-[#2563EB]",
  offer: "bg-[#16A34A]",
  saved: "bg-black/20",
  resume: "bg-[#2563EB]",
  reject: "bg-black/20",
};

function OverviewPage() {
  const nextInterview = interviews[0];
  const suggested = jobs.filter((j) => !j.stage).slice(0, 3);

  return (
    <>
      <PageHeader
        eyebrow="Overview"
        title="Good afternoon, Ava."
        subtitle={`You have ${interviews.length} interviews this week and 2 follow-ups waiting. Let's get you closer to your next offer.`}
        actions={
          <>
            <Link
              to="/dashboard/interviews"
              className="hidden items-center gap-1.5 rounded-lg border border-black/5 bg-white px-3 py-2 text-sm font-medium hover:bg-black/[0.03] sm:inline-flex"
            >
              <CalendarClock className="h-4 w-4" /> This week
            </Link>
            <Link
              to="/dashboard/jobs"
              className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-br from-[#2563EB] to-[#7C3AED] px-3 py-2 text-sm font-medium text-white"
            >
              <Plus className="h-4 w-4" /> Add job
            </Link>
          </>
        }
      />

      <div className="grid gap-4 md:grid-cols-4">
        {[
          { l: "Active applications", v: stats.activeApps, d: "+3 this week", icon: Target, tone: "text-[#16A34A]" },
          { l: "Interviews", v: stats.interviews, d: "2 upcoming", icon: CalendarClock, tone: "text-[#7C3AED]" },
          { l: "Match avg.", v: stats.matchAvg + "%", d: "Across 12 roles", icon: Sparkles, tone: "text-[#2563EB]" },
          { l: "Offers", v: stats.offers, d: "$210k avg.", icon: TrendingUp, tone: "text-[#16A34A]" },
        ].map((s) => (
          <DashCard key={s.l}>
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-[oklch(0.5_0.02_265)]">{s.l}</p>
                <p className="mt-1 font-display text-2xl font-semibold">{s.v}</p>
              </div>
              <s.icon className={`h-4 w-4 ${s.tone}`} />
            </div>
            <p className={`mt-1 text-[11px] ${s.tone}`}>{s.d}</p>
          </DashCard>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
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
              <Link
                to="/dashboard/interviews"
                className="hidden items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-sm font-medium shadow-sm hover:shadow-md md:inline-flex"
              >
                Prep with AI <Sparkles className="h-3.5 w-3.5 text-[#7C3AED]" />
              </Link>
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

        <DashCard>
          <SectionTitle action={<span className="text-xs text-[oklch(0.5_0.02_265)]">Last 7 days</span>}>
            Recent activity
          </SectionTitle>
          <ul className="mt-3 space-y-3 text-sm">
            {activity.slice(0, 6).map((a) => (
              <li key={a.id} className="flex items-start gap-3">
                <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${kindDot[a.kind] ?? "bg-black/20"}`} />
                <span className="flex-1 leading-snug">{a.text}</span>
                <span className="whitespace-nowrap text-[11px] text-[oklch(0.55_0.02_265)]">{a.when}</span>
              </li>
            ))}
          </ul>
        </DashCard>
      </div>

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
          Based on your saved roles and resume — refreshed hourly.
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
            "You're doing great — your average match score jumped 6 points this week. Focus on Linear
            and Raycast next; both have interviews queued and your resumes are already 90%+ tuned."
          </p>
          <div className="mt-4">
            <Link
              to="/dashboard/analytics"
              className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-xs font-medium shadow-sm"
            >
              See analytics <ArrowUpRight className="h-3 w-3" />
            </Link>
          </div>
        </DashCard>
      </div>
    </>
  );
}