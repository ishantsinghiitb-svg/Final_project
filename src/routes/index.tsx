import { createFileRoute } from "@tanstack/react-router";
import { ArrowRight, PlayCircle, Chrome, Sparkles, FileText, Kanban, LineChart, BrainCircuit, Bookmark, Bot, CalendarClock, StickyNote, MousePointerClick } from "lucide-react";
import { HeroComposition } from "@/components/site/HeroComposition";
import { LogoRow } from "@/components/site/LogoRow";
import { Section } from "@/components/site/Section";
import { ButtonLink } from "@/components/site/PrimaryButton";
import { Link } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  return (
    <>
      <Hero />
      <FeatureGrid />
      <ExtensionSection />
      <ResumeAISection />
      <PipelineSection />
      <AnalyticsSection />
      <TestimonialSection />
      <CTASection />
    </>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden pt-32 pb-8">
      <div className="absolute inset-0 grid-bg -z-10" />
      <div className="mx-auto max-w-4xl px-6 text-center">
        <Link
          to="/features"
          className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-white/20 hover:text-foreground"
        >
          <span className="rounded-full bg-gradient-to-r from-[#2563EB] to-[#7C3AED] px-1.5 py-0.5 text-[10px] font-semibold text-white">
            NEW
          </span>
          AI Cover Letter Generator is live
          <ArrowRight className="h-3 w-3" />
        </Link>
        <h1 className="mt-6 font-display text-5xl font-semibold tracking-tight md:text-6xl lg:text-7xl">
          Your AI copilot for the{" "}
          <span className="text-gradient">next offer</span>.
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-base text-muted-foreground md:text-lg">
          Save jobs from LinkedIn, Wellfound, Greenhouse and beyond. Tailor
          resumes with AI, track every application, and land offers faster —
          without spreadsheets, tabs, or guesswork.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <ButtonLink to="/signup" size="lg">
            Get Started Free
            <ArrowRight className="h-4 w-4" />
          </ButtonLink>
          <ButtonLink to="/dashboard" size="lg" variant="outline">
            <PlayCircle className="h-4 w-4" />
            Watch Demo
          </ButtonLink>
        </div>
        <p className="mt-4 text-xs text-muted-foreground">
          No credit card. Chrome extension included.
        </p>
      </div>
      <div className="mt-14">
        <HeroComposition />
      </div>
      <LogoRow />
    </section>
  );
}

const features = [
  { icon: Chrome, title: "Chrome Extension", desc: "One-click save from LinkedIn, Wellfound, Greenhouse, Lever, Naukri and any career page.", to: "/features" },
  { icon: Bookmark, title: "Job Library", desc: "A calm home for every role you're considering — auto-enriched with company data.", to: "/features" },
  { icon: FileText, title: "Resume Management", desc: "Store multiple resumes, version them, and reuse them across roles.", to: "/features" },
  { icon: BrainCircuit, title: "AI Resume Match", desc: "See how well your resume matches a role — and exactly what to change.", to: "/features" },
  { icon: Sparkles, title: "ATS Score", desc: "Beat automated screeners with a real-time score and actionable fixes.", to: "/features" },
  { icon: Bot, title: "AI Cover Letters", desc: "Personalized, human-sounding cover letters generated in seconds.", to: "/features" },
  { icon: Kanban, title: "Kanban Tracker", desc: "Every application, from applied to offer, on one focused board.", to: "/features" },
  { icon: CalendarClock, title: "Interview Tracker", desc: "Prep notes, timing, and follow-ups — all in one place.", to: "/features" },
  { icon: StickyNote, title: "Personal Notes", desc: "Capture recruiter chats, salary bands, and gut feelings per role.", to: "/features" },
  { icon: LineChart, title: "Analytics Dashboard", desc: "Understand what's working — response rate, time-to-offer, and more.", to: "/features" },
];

function FeatureGrid() {
  return (
    <Section
      eyebrow="Everything you need"
      title={<>A complete job search, in one calm workspace.</>}
      description="NextOffer sits alongside the platforms you already use, so nothing about your workflow has to change — except the results."
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {features.map((f) => (
          <Link
            key={f.title}
            to={f.to}
            className="group relative overflow-hidden rounded-2xl border border-white/8 bg-white/[0.02] p-5 transition-all duration-300 hover:-translate-y-0.5 hover:border-white/15 hover:bg-white/[0.04]"
          >
            <div className="mb-4 grid h-9 w-9 place-items-center rounded-lg border border-white/10 bg-gradient-to-br from-white/5 to-transparent text-[#93C5FD]">
              <f.icon className="h-4 w-4" />
            </div>
            <p className="font-display text-[15px] font-semibold">{f.title}</p>
            <p className="mt-1.5 text-sm text-muted-foreground">{f.desc}</p>
            <span className="mt-4 inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors group-hover:text-foreground">
              Learn more <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
            </span>
          </Link>
        ))}
      </div>
    </Section>
  );
}

function ExtensionSection() {
  return (
    <Section>
      <div className="grid items-center gap-12 md:grid-cols-2">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs font-medium text-muted-foreground">
            <Chrome className="h-3 w-3" /> Chrome Extension
          </span>
          <h3 className="mt-4 font-display text-3xl font-semibold tracking-tight md:text-4xl">
            Save any job. From anywhere. In one click.
          </h3>
          <p className="mt-4 text-muted-foreground">
            The NextOffer extension detects the role, company, salary, location
            and requirements automatically — so you never copy-paste a job into
            a spreadsheet again.
          </p>
          <ul className="mt-6 space-y-3 text-sm">
            {[
              "Auto-extracts job data from LinkedIn, Wellfound, Greenhouse, Lever, Naukri",
              "Instant match score against your primary resume",
              "Adds the role to your pipeline in your chosen column",
            ].map((t) => (
              <li key={t} className="flex items-start gap-2">
                <span className="mt-0.5 grid h-4 w-4 place-items-center rounded-full bg-[#22C55E]/20 text-[#22C55E]">✓</span>
                <span className="text-muted-foreground">{t}</span>
              </li>
            ))}
          </ul>
          <div className="mt-6 flex gap-3">
            <ButtonLink to="/signup">Install extension</ButtonLink>
            <ButtonLink to="/features" variant="outline">See how it works</ButtonLink>
          </div>
        </div>
        <div className="relative">
          <div className="absolute -inset-8 -z-10 rounded-3xl bg-gradient-to-br from-[#2563EB]/20 to-[#7C3AED]/10 blur-3xl" />
          <div className="rounded-2xl border border-white/10 bg-[oklch(0.19_0.03_265)]/80 p-4 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.7)] backdrop-blur">
            <div className="flex items-center gap-2 border-b border-white/5 pb-3">
              <MousePointerClick className="h-4 w-4 text-[#93C5FD]" />
              <p className="text-xs text-muted-foreground">linkedin.com/jobs/view/…</p>
            </div>
            <div className="mt-4 flex items-start gap-3">
              <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-white/20 to-white/5" />
              <div className="flex-1">
                <p className="text-sm font-semibold">Senior Frontend Engineer</p>
                <p className="text-xs text-muted-foreground">Linear · Remote · $180k – $230k</p>
              </div>
              <button className="rounded-lg bg-gradient-to-br from-[#2563EB] to-[#7C3AED] px-3 py-1.5 text-xs font-medium text-white">
                Save
              </button>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2 text-[11px]">
              {[
                { l: "Match", v: "92%", c: "text-[#22C55E]" },
                { l: "ATS", v: "88", c: "text-[#A78BFA]" },
                { l: "Fit", v: "Strong", c: "text-[#93C5FD]" },
              ].map((s) => (
                <div key={s.l} className="rounded-md border border-white/5 bg-white/[0.02] p-2">
                  <p className="text-[10px] uppercase text-muted-foreground">{s.l}</p>
                  <p className={`mt-0.5 font-semibold ${s.c}`}>{s.v}</p>
                </div>
              ))}
            </div>
            <div className="mt-4 rounded-lg border border-dashed border-white/10 p-3 text-[11px] text-muted-foreground">
              Added to <span className="text-white">Interested</span> · Auto-tagged
              <span className="text-[#93C5FD]"> Remote</span>,
              <span className="text-[#A78BFA]"> Senior</span>
            </div>
          </div>
        </div>
      </div>
    </Section>
  );
}

function ResumeAISection() {
  return (
    <Section>
      <div className="grid items-center gap-12 md:grid-cols-2">
        <div className="order-2 md:order-1">
          <div className="relative">
            <div className="absolute -inset-8 -z-10 rounded-3xl bg-gradient-to-tr from-[#7C3AED]/20 to-[#2563EB]/10 blur-3xl" />
            <div className="rounded-2xl border border-white/10 bg-[oklch(0.19_0.03_265)]/80 p-4 backdrop-blur">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Match Analysis</span>
                <span className="rounded-full bg-[#22C55E]/15 px-2 py-0.5 text-[#22C55E]">Strong fit</span>
              </div>
              <div className="mt-4 flex items-end gap-2">
                <p className="font-display text-5xl font-semibold">92<span className="text-2xl text-muted-foreground">%</span></p>
                <p className="pb-2 text-xs text-muted-foreground">resume ↔ job description</p>
              </div>
              <div className="mt-5 space-y-3 text-xs">
                {[
                  { l: "Skills coverage", v: 94 },
                  { l: "Experience level", v: 88 },
                  { l: "Keywords", v: 76 },
                  { l: "Tone & clarity", v: 90 },
                ].map((r) => (
                  <div key={r.l}>
                    <div className="flex justify-between text-muted-foreground">
                      <span>{r.l}</span>
                      <span>{r.v}%</span>
                    </div>
                    <div className="mt-1 h-1.5 rounded-full bg-white/5">
                      <div className="h-full rounded-full bg-gradient-to-r from-[#2563EB] to-[#7C3AED]" style={{ width: `${r.v}%` }} />
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-5 rounded-lg border border-white/10 bg-white/[0.02] p-3 text-xs">
                <p className="text-muted-foreground">Suggested improvements</p>
                <p className="mt-1">Add measurable impact to your Vercel role — the JD emphasizes performance metrics.</p>
              </div>
            </div>
          </div>
        </div>
        <div className="order-1 md:order-2">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs font-medium text-muted-foreground">
            <BrainCircuit className="h-3 w-3" /> AI Resume Match
          </span>
          <h3 className="mt-4 font-display text-3xl font-semibold tracking-tight md:text-4xl">
            Tailor your resume like a recruiter does.
          </h3>
          <p className="mt-4 text-muted-foreground">
            Get a per-role match score, ATS insights, and precise suggestions —
            grounded in the actual job description. No more guessing which
            resume to send.
          </p>
          <div className="mt-6 grid grid-cols-2 gap-3 text-sm">
            {[
              { t: "ATS Score", d: "Real-time compatibility check with modern applicant tracking systems." },
              { t: "Skill Gap", d: "Understand exactly what's missing, and how to close it." },
              { t: "AI Rewrites", d: "One-click bullet rewrites, tuned for impact." },
              { t: "Cover Letters", d: "Personalized, in your voice — never generic." },
            ].map((x) => (
              <div key={x.t} className="rounded-xl border border-white/8 bg-white/[0.02] p-4">
                <p className="font-semibold">{x.t}</p>
                <p className="mt-1 text-xs text-muted-foreground">{x.d}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Section>
  );
}

function PipelineSection() {
  const cols = [
    { title: "Interested", tone: "text-muted-foreground", items: [{ c: "Linear", r: "Sr. Product Designer" }, { c: "Notion", r: "Design Engineer" }] },
    { title: "Applied", tone: "text-[#93C5FD]", items: [{ c: "Vercel", r: "Frontend Engineer" }, { c: "Raycast", r: "Design Engineer" }, { c: "Arc", r: "iOS Engineer" }] },
    { title: "Interview", tone: "text-[#A78BFA]", items: [{ c: "Stripe", r: "Design Systems" }, { c: "Anthropic", r: "Product Designer" }] },
    { title: "Offer", tone: "text-[#22C55E]", items: [{ c: "Figma", r: "Sr. Frontend" }] },
  ];
  return (
    <Section
      eyebrow="Application Tracker"
      title="Your pipeline, made calm."
      description="A dedicated kanban for job search — with reminders, notes, and interview prep built in."
    >
      <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 backdrop-blur">
        <div className="grid gap-3 md:grid-cols-4">
          {cols.map((col) => (
            <div key={col.title} className="rounded-xl border border-white/5 bg-[oklch(0.19_0.03_265)]/50 p-3">
              <div className="flex items-center justify-between px-1 pb-2 text-xs">
                <span className={`font-semibold ${col.tone}`}>{col.title}</span>
                <span className="text-muted-foreground">{col.items.length}</span>
              </div>
              <div className="space-y-2">
                {col.items.map((it) => (
                  <div key={it.c + it.r} className="rounded-lg border border-white/5 bg-white/[0.02] p-3 transition-transform hover:-translate-y-0.5">
                    <div className="flex items-center gap-2">
                      <div className="grid h-6 w-6 place-items-center rounded bg-white/10 text-[10px] font-semibold">
                        {it.c[0]}
                      </div>
                      <p className="text-xs font-semibold">{it.c}</p>
                    </div>
                    <p className="mt-2 text-[11px] text-muted-foreground">{it.r}</p>
                    <div className="mt-2 flex gap-1">
                      <span className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-muted-foreground">Remote</span>
                      <span className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-muted-foreground">Senior</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </Section>
  );
}

function AnalyticsSection() {
  return (
    <Section>
      <div className="grid items-center gap-12 md:grid-cols-2">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs font-medium text-muted-foreground">
            <LineChart className="h-3 w-3" /> Analytics
          </span>
          <h3 className="mt-4 font-display text-3xl font-semibold tracking-tight md:text-4xl">
            Know what's actually working.
          </h3>
          <p className="mt-4 text-muted-foreground">
            Response rate by resume, average time-to-interview, offer velocity,
            and where you drop off in the funnel. Data as a co-pilot, not a chore.
          </p>
          <div className="mt-6 grid grid-cols-3 gap-3">
            {[
              { v: "34%", l: "Response rate" },
              { v: "12d", l: "Avg. time-to-interview" },
              { v: "3.2x", l: "Vs. spreadsheet users" },
            ].map((s) => (
              <div key={s.l} className="rounded-xl border border-white/8 bg-white/[0.02] p-4">
                <p className="font-display text-2xl font-semibold">{s.v}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">{s.l}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-[oklch(0.19_0.03_265)]/70 p-5 backdrop-blur">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground">Weekly activity</p>
              <p className="mt-1 font-display text-2xl font-semibold">142 <span className="text-sm text-muted-foreground">applications</span></p>
            </div>
            <span className="rounded-full bg-[#22C55E]/15 px-2 py-0.5 text-[11px] text-[#22C55E]">+22%</span>
          </div>
          <svg viewBox="0 0 320 140" className="mt-4 h-40 w-full">
            <defs>
              <linearGradient id="area" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#7C3AED" stopOpacity="0.5" />
                <stop offset="100%" stopColor="#7C3AED" stopOpacity="0" />
              </linearGradient>
            </defs>
            {[20, 50, 80, 110].map((y) => (
              <line key={y} x1="0" x2="320" y1={y} y2={y} stroke="oklch(1 0 0 / 0.05)" />
            ))}
            <path d="M0,100 C40,90 60,60 100,70 C140,80 160,30 200,40 C240,50 260,20 320,30 L320,140 L0,140 Z" fill="url(#area)" />
            <path d="M0,100 C40,90 60,60 100,70 C140,80 160,30 200,40 C240,50 260,20 320,30" stroke="#2563EB" strokeWidth="2" fill="none" />
          </svg>
          <div className="mt-4 grid grid-cols-3 gap-2 text-[11px]">
            {[
              { l: "Applied", v: 88, c: "bg-[#2563EB]" },
              { l: "Interview", v: 34, c: "bg-[#7C3AED]" },
              { l: "Offer", v: 5, c: "bg-[#22C55E]" },
            ].map((r) => (
              <div key={r.l} className="rounded-lg border border-white/5 bg-white/[0.02] p-2">
                <div className="flex items-center gap-1.5">
                  <span className={`h-2 w-2 rounded-full ${r.c}`} />
                  <span className="text-muted-foreground">{r.l}</span>
                </div>
                <p className="mt-1 font-semibold">{r.v}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Section>
  );
}

function TestimonialSection() {
  const quotes = [
    { q: "I stopped spreadsheet-hunting. NextOffer runs my search now.", n: "Priya S.", r: "Product Designer" },
    { q: "The match score alone paid for the year in one interview.", n: "Marcus L.", r: "Frontend Engineer" },
    { q: "It feels like Linear, but for the worst part of career growth.", n: "Ada N.", r: "Engineering Manager" },
  ];
  return (
    <Section
      eyebrow="Trusted by careful job hunters"
      title="A calmer way to look for your next thing."
    >
      <div className="grid gap-4 md:grid-cols-3">
        {quotes.map((q) => (
          <figure key={q.n} className="rounded-2xl border border-white/8 bg-white/[0.02] p-6">
            <blockquote className="font-display text-lg leading-snug">"{q.q}"</blockquote>
            <figcaption className="mt-6 flex items-center gap-3">
              <div className="h-8 w-8 rounded-full bg-gradient-to-br from-[#2563EB] to-[#7C3AED]" />
              <div>
                <p className="text-sm font-medium">{q.n}</p>
                <p className="text-xs text-muted-foreground">{q.r}</p>
              </div>
            </figcaption>
          </figure>
        ))}
      </div>
    </Section>
  );
}

function CTASection() {
  return (
    <Section className="pb-32">
      <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-[oklch(0.22_0.06_265)] to-[oklch(0.18_0.08_290)] p-10 md:p-16">
        <div className="pointer-events-none absolute -right-20 -top-20 h-80 w-80 rounded-full bg-[#2563EB]/30 blur-[100px]" />
        <div className="pointer-events-none absolute -bottom-24 -left-10 h-80 w-80 rounded-full bg-[#7C3AED]/30 blur-[100px]" />
        <div className="relative max-w-2xl">
          <h3 className="font-display text-3xl font-semibold tracking-tight md:text-5xl">
            Land your <span className="text-gradient">next offer</span>.
          </h3>
          <p className="mt-4 text-muted-foreground md:text-lg">
            Free to start. Bring your resumes, connect your inbox, install the
            extension. Your calmest job search yet begins in under two minutes.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <ButtonLink to="/signup" size="lg">
              Get Started Free
              <ArrowRight className="h-4 w-4" />
            </ButtonLink>
            <ButtonLink to="/pricing" size="lg" variant="outline">
              View pricing
            </ButtonLink>
          </div>
        </div>
      </div>
    </Section>
  );
}
