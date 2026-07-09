import {
  Sparkles,
  Bookmark,
  FileText,
  Gauge,
  Target,
  CalendarClock,
  Trophy,
  Activity,
  Briefcase,
  Search,
  Bell,
  Circle,
} from "lucide-react";
import type { ReactNode } from "react";
import { LogoMark } from "@/components/site/Logo";

export function HeroComposition() {
  return (
    <div className="relative mx-auto h-[560px] w-full max-w-6xl md:h-[640px]">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-1/2 top-1/2 h-[520px] w-[720px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[oklch(0.58_0.21_260)]/25 blur-[120px]" />
        <div className="absolute left-[20%] top-[60%] h-[280px] w-[380px] rounded-full bg-[oklch(0.55_0.24_295)]/25 blur-[100px]" />
      </div>

      <div className="absolute left-1/2 top-1/2 w-[92%] max-w-[900px] -translate-x-1/2 -translate-y-1/2">
        <DashboardMock />
      </div>

      <ExtensionPopup className="absolute left-0 top-8 hidden w-[260px] lg:block animate-float" />
      <ResumeMatchCard className="absolute -left-2 bottom-16 hidden w-[240px] md:block animate-float-slow" />
      <ATSScoreCard className="absolute right-0 top-4 hidden w-[220px] md:block animate-float" />
      <SkillGapCard className="absolute right-4 bottom-24 hidden w-[240px] lg:block animate-float-slow" />
      <InterviewCard className="absolute left-[45%] -top-4 hidden w-[260px] xl:block animate-float" />
      <OfferToast className="absolute right-[10%] bottom-6 hidden w-[260px] xl:block animate-float-slow" />
    </div>
  );
}

function DashboardMock() {
  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-[oklch(0.19_0.03_265)]/85 shadow-[0_40px_100px_-30px_rgba(0,0,0,0.7)] backdrop-blur-xl">
      <div className="flex items-center gap-2 border-b border-white/5 px-4 py-2.5">
        <div className="flex gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-[#EF4444]/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#F59E0B]/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#22C55E]/70" />
        </div>
        <div className="ml-3 flex flex-1 items-center gap-2 rounded-md bg-white/[0.03] px-2 py-1 text-[11px] text-muted-foreground">
          <Search className="h-3 w-3" />
          app.nextoffer.io / dashboard
        </div>
      </div>
      <div className="grid grid-cols-[180px_1fr]">
        <aside className="border-r border-white/5 p-3">
          <div className="mb-3 flex items-center gap-2 px-2 py-1">
            <LogoMark size={22} />
            <span className="text-[12px] font-semibold">NextOffer</span>
          </div>
          {[
            { icon: Activity, label: "Overview", active: true },
            { icon: Briefcase, label: "Jobs" },
            { icon: Bookmark, label: "Saved" },
            { icon: FileText, label: "Resumes" },
            { icon: Target, label: "Applications" },
            { icon: CalendarClock, label: "Interviews" },
          ].map((i) => (
            <div
              key={i.label}
              className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-[12px] ${
                i.active ? "bg-white/5 text-white" : "text-muted-foreground"
              }`}
            >
              <i.icon className="h-3.5 w-3.5" />
              {i.label}
            </div>
          ))}
        </aside>
        <div className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                Overview
              </p>
              <h3 className="mt-0.5 text-base font-semibold">Good afternoon, Ava</h3>
            </div>
            <div className="h-6 w-6 rounded-full bg-gradient-to-br from-[oklch(0.55_0.24_295)] to-[oklch(0.58_0.21_260)]" />
          </div>

          <div className="mt-4 grid grid-cols-3 gap-3">
            {[
              { label: "Active applications", value: "24", tone: "text-white" },
              { label: "Interviews this week", value: "5", tone: "text-[#22C55E]" },
              { label: "Match score avg.", value: "87%", tone: "text-[#A78BFA]" },
            ].map((s) => (
              <div
                key={s.label}
                className="rounded-lg border border-white/5 bg-white/[0.02] p-3"
              >
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  {s.label}
                </p>
                <p className={`mt-1 text-lg font-semibold ${s.tone}`}>{s.value}</p>
              </div>
            ))}
          </div>

          <div className="mt-3 grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-white/5 bg-white/[0.02] p-3">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-muted-foreground">Applications / week</span>
                <span className="text-[#22C55E]">+18%</span>
              </div>
              <svg viewBox="0 0 200 70" className="mt-2 h-16 w-full">
                <defs>
                  <linearGradient id="g1" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="#2563EB" stopOpacity="0.6" />
                    <stop offset="100%" stopColor="#2563EB" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <path
                  d="M0,50 L25,45 L50,48 L75,30 L100,34 L125,22 L150,26 L175,14 L200,18 L200,70 L0,70 Z"
                  fill="url(#g1)"
                />
                <path
                  d="M0,50 L25,45 L50,48 L75,30 L100,34 L125,22 L150,26 L175,14 L200,18"
                  stroke="#7C3AED"
                  strokeWidth="1.5"
                  fill="none"
                />
              </svg>
            </div>
            <div className="rounded-lg border border-white/5 bg-white/[0.02] p-3">
              <p className="text-[11px] text-muted-foreground">Pipeline</p>
              <div className="mt-2 grid grid-cols-3 gap-1.5">
                {[
                  { label: "Applied", n: 12, c: "bg-[#2563EB]/60" },
                  { label: "Interview", n: 5, c: "bg-[#7C3AED]/60" },
                  { label: "Offer", n: 2, c: "bg-[#22C55E]/60" },
                ].map((k) => (
                  <div key={k.label} className="rounded-md bg-white/[0.03] p-1.5">
                    <div className="flex items-center justify-between text-[9px] text-muted-foreground">
                      <span>{k.label}</span>
                      <span>{k.n}</span>
                    </div>
                    <div className="mt-1 space-y-1">
                      <div className={`h-1.5 w-full rounded-full ${k.c}`} />
                      <div className={`h-1.5 w-3/4 rounded-full ${k.c} opacity-70`} />
                      <div className={`h-1.5 w-2/3 rounded-full ${k.c} opacity-40`} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-3 rounded-lg border border-white/5 bg-white/[0.02]">
            <div className="flex items-center justify-between px-3 py-2 text-[11px] text-muted-foreground">
              <span>Recent applications</span>
              <span>Status</span>
            </div>
            <div className="divide-y divide-white/5">
              {[
                { c: "Linear", r: "Sr. Product Designer", s: "Interview", t: "text-[#A78BFA]" },
                { c: "Vercel", r: "Frontend Engineer", s: "Applied", t: "text-[#93C5FD]" },
                { c: "Stripe", r: "Design Engineer", s: "Offer", t: "text-[#22C55E]" },
              ].map((r) => (
                <div
                  key={r.c}
                  className="flex items-center justify-between px-3 py-2 text-[11px]"
                >
                  <div className="flex items-center gap-2">
                    <div className="grid h-5 w-5 place-items-center rounded bg-white/10 text-[9px]">
                      {r.c[0]}
                    </div>
                    <div>
                      <p className="text-[11px] text-white">{r.c}</p>
                      <p className="text-[10px] text-muted-foreground">{r.r}</p>
                    </div>
                  </div>
                  <span className={`text-[10px] ${r.t}`}>{r.s}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Chip({ className = "", children }: { className?: string; children: ReactNode }) {
  return (
    <div
      className={`rounded-xl border border-white/10 bg-[oklch(0.22_0.028_265)]/90 p-3 shadow-[0_20px_50px_-20px_rgba(0,0,0,0.7)] backdrop-blur-xl ${className}`}
    >
      {children}
    </div>
  );
}

function ExtensionPopup({ className }: { className?: string }) {
  return (
    <Chip className={className}>
      <div className="flex items-center gap-2 border-b border-white/5 pb-2">
        <div className="h-2 w-2 rounded-full bg-[#22C55E]" />
        <p className="text-[11px] text-muted-foreground">Chrome Extension</p>
      </div>
      <p className="mt-2 text-[12px] font-medium">Job saved from LinkedIn</p>
      <p className="text-[11px] text-muted-foreground">Sr. Product Designer · Linear</p>
      <div className="mt-2 flex items-center gap-1.5">
        <span className="rounded bg-[#2563EB]/20 px-1.5 py-0.5 text-[10px] text-[#93C5FD]">
          Remote
        </span>
        <span className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-muted-foreground">
          $180k+
        </span>
      </div>
    </Chip>
  );
}

function ResumeMatchCard({ className }: { className?: string }) {
  return (
    <Chip className={className}>
      <div className="flex items-center justify-between">
        <p className="text-[11px] text-muted-foreground">Resume match</p>
        <FileText className="h-3.5 w-3.5 text-muted-foreground" />
      </div>
      <div className="mt-2 flex items-end justify-between">
        <p className="font-display text-2xl font-semibold">92%</p>
        <span className="text-[10px] text-[#22C55E]">Strong fit</span>
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/5">
        <div className="h-full w-[92%] rounded-full bg-gradient-to-r from-[#2563EB] to-[#22C55E]" />
      </div>
    </Chip>
  );
}

function ATSScoreCard({ className }: { className?: string }) {
  return (
    <Chip className={className}>
      <div className="flex items-center gap-2">
        <Gauge className="h-3.5 w-3.5 text-[#A78BFA]" />
        <p className="text-[11px] text-muted-foreground">ATS score</p>
      </div>
      <div className="mt-2 flex items-center gap-3">
        <svg viewBox="0 0 40 40" className="h-12 w-12 -rotate-90">
          <circle cx="20" cy="20" r="16" stroke="oklch(1 0 0 / 0.08)" strokeWidth="4" fill="none" />
          <circle
            cx="20"
            cy="20"
            r="16"
            stroke="#7C3AED"
            strokeWidth="4"
            fill="none"
            strokeDasharray={`${(88 / 100) * 100.5} 100.5`}
            strokeLinecap="round"
          />
        </svg>
        <div>
          <p className="font-display text-xl font-semibold">88</p>
          <p className="text-[10px] text-muted-foreground">of 100</p>
        </div>
      </div>
    </Chip>
  );
}

function SkillGapCard({ className }: { className?: string }) {
  return (
    <Chip className={className}>
      <div className="flex items-center gap-2">
        <Target className="h-3.5 w-3.5 text-[#93C5FD]" />
        <p className="text-[11px] text-muted-foreground">Skill gap</p>
      </div>
      <div className="mt-2 space-y-1.5 text-[11px]">
        {[
          { l: "System design", v: 80, c: "bg-[#22C55E]" },
          { l: "GraphQL", v: 55, c: "bg-[#F59E0B]" },
          { l: "Rust", v: 25, c: "bg-[#EF4444]" },
        ].map((s) => (
          <div key={s.l}>
            <div className="flex justify-between">
              <span>{s.l}</span>
              <span className="text-muted-foreground">{s.v}%</span>
            </div>
            <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-white/5">
              <div className={`h-full ${s.c}`} style={{ width: `${s.v}%` }} />
            </div>
          </div>
        ))}
      </div>
    </Chip>
  );
}

function InterviewCard({ className }: { className?: string }) {
  return (
    <Chip className={className}>
      <div className="flex items-center gap-2">
        <Bell className="h-3.5 w-3.5 text-[#F59E0B]" />
        <p className="text-[11px] text-muted-foreground">Interview in 45 min</p>
      </div>
      <p className="mt-2 text-[12px] font-medium">Vercel — Frontend loop</p>
      <div className="mt-2 flex items-center justify-between text-[10px] text-muted-foreground">
        <span>Wed · 2:30 PM</span>
        <span className="flex items-center gap-1 text-[#22C55E]">
          <Circle className="h-1.5 w-1.5 fill-current" /> ready
        </span>
      </div>
    </Chip>
  );
}

function OfferToast({ className }: { className?: string }) {
  return (
    <Chip className={className}>
      <div className="flex items-center gap-2">
        <Trophy className="h-4 w-4 text-[#22C55E]" />
        <div>
          <p className="text-[12px] font-medium">Offer received</p>
          <p className="text-[11px] text-muted-foreground">Stripe · Design Engineer</p>
        </div>
      </div>
    </Chip>
  );
}