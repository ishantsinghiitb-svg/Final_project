import { createFileRoute } from "@tanstack/react-router";
import { ArrowRight, CirclePlay as PlayCircle, Chromium as Chrome, Sparkles, FileText, Kanban, BrainCircuit, Bookmark, Bot, CalendarClock, StickyNote, MousePointerClick, Check, Wand as Wand2, ChartLine as LineChart, Trophy } from "lucide-react";
import { HeroComposition } from "@/components/site/HeroComposition";
import { LogoRow } from "@/components/site/LogoRow";
import { Section } from "@/components/site/Section";
import { ButtonLink } from "@/components/site/PrimaryButton";
import { Link } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "NextOffer — The workspace for your job search" },
      {
        name: "description",
        content:
          "Save jobs from anywhere, tailor your resume with AI, track every application, and land your next offer — all in one calm workspace.",
      },
      { property: "og:title", content: "NextOffer — The workspace for your job search" },
      {
        property: "og:description",
        content:
          "The calmest way to find your next job. Save, tailor, track, and land offers from one focused workspace.",
      },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <>
      <Hero />
      <LogoRow />
      <StoryDiscover />
      <StorySave />
      <StoryOrganize />
      <StoryResumeMatch />
      <StoryATS />
      <StoryCoverLetter />
      <StoryApply />
      <StoryTrack />
      <StoryInterviews />
      <StoryOffers />
      <TestimonialSection />
      <CTASection />
    </>
  );
}

/* ----------------------------------------------------------------- Hero */

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
          AI cover letters, grounded in your resume
          <ArrowRight className="h-3 w-3" />
        </Link>
        <h1 className="mt-6 font-display text-5xl font-semibold tracking-tight md:text-6xl lg:text-7xl">
          The workspace for your{" "}
          <span className="text-gradient">next offer</span>.
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-base text-muted-foreground md:text-lg">
          NextOffer sits alongside the platforms you already use. Save jobs as
          you browse, tailor your resume with AI, track every application, and
          walk into interviews ready — without spreadsheets, tabs, or guesswork.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <ButtonLink to="/signup" size="lg">
            Get Started Free
            <ArrowRight className="h-4 w-4" />
          </ButtonLink>
          <ButtonLink to="/dashboard" size="lg" variant="outline">
            <PlayCircle className="h-4 w-4" />
            See the workspace
          </ButtonLink>
        </div>
        <p className="mt-4 text-xs text-muted-foreground">
          Free forever. No credit card. Chrome extension included.
        </p>
      </div>
      <div className="mt-14">
        <HeroComposition />
      </div>
    </section>
  );
}

/* ----------------------------------------------------------- Story scaffolding */

function StepLabel({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-center gap-3">
      <span className="grid h-7 w-7 place-items-center rounded-full border border-white/10 bg-white/[0.03] text-xs font-semibold text-muted-foreground">
        {n}
      </span>
      <span className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
        {children}
      </span>
    </div>
  );
}

function MiniCheck({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2 text-sm">
      <span className="mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full bg-[#22C55E]/20 text-[#22C55E]">
        <Check className="h-3 w-3" />
      </span>
      <span className="text-muted-foreground">{children}</span>
    </li>
  );
}

/* 1. Discover ------------------------------------------------------------- */

function StoryDiscover() {
  return (
    <Section>
      <div className="grid items-center gap-12 md:grid-cols-2">
        <div>
          <StepLabel n={1}>Discover</StepLabel>
          <h2 className="font-display text-3xl font-semibold tracking-tight md:text-4xl">
            Stop hunting. Start noticing.
          </h2>
          <p className="mt-4 text-muted-foreground">
            The best roles aren't in one place — they're scattered across
            LinkedIn, Wellfound, Greenhouse, Lever, Ashby and company career
            pages. NextOffer meets you wherever you browse.
          </p>
          <ul className="mt-6 space-y-3">
            <MiniCheck>One-click save from any job posting</MiniCheck>
            <MiniCheck>Auto-extracted title, salary, location, and requirements</MiniCheck>
            <MiniCheck>A growing job library you actually want to return to</MiniCheck>
          </ul>
          <div className="mt-6">
            <ButtonLink to="/features" variant="outline">
              How saving works <ArrowRight className="h-4 w-4" />
            </ButtonLink>
          </div>
        </div>
        <DiscoverPreview />
      </div>
    </Section>
  );
}

function DiscoverPreview() {
  const sources = [
    { n: "LinkedIn", c: "from-[#0A66C2] to-[#0A66C2]/60", j: "Sr. Frontend Engineer · Notion" },
    { n: "Wellfound", c: "from-[#000] to-[#374151]", j: "Design Engineer · Raycast" },
    { n: "Greenhouse", c: "from-[#2D6E55] to-[#4FA57D]", j: "Product Designer · Anthropic" },
    { n: "Lever", c: "from-[#7C3AED] to-[#A855F7]", j: "Frontend Engineer · Figma" },
  ];
  return (
    <div className="relative">
      <div className="absolute -inset-8 -z-10 rounded-3xl bg-gradient-to-br from-[#2563EB]/15 to-[#7C3AED]/10 blur-3xl" />
      <div className="rounded-2xl border border-white/10 bg-[oklch(0.19_0.03_265)]/80 p-4 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.7)] backdrop-blur">
        <p className="px-1 pb-3 text-xs text-muted-foreground">Four jobs, four platforms — one library.</p>
        <div className="space-y-2.5">
          {sources.map((s) => (
            <div
              key={s.n}
              className="flex items-center gap-3 rounded-xl border border-white/5 bg-white/[0.02] p-3 transition-colors hover:border-white/10"
            >
              <div className={`grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br ${s.c} text-[10px] font-semibold text-white`}>
                {s.n[0]}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{s.j}</p>
                <p className="text-[11px] text-muted-foreground">via {s.n}</p>
              </div>
              <button className="rounded-lg bg-white/5 px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground">
                Save
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* 2. Save --------------------------------------------------------------- */

function StorySave() {
  return (
    <Section>
      <div className="grid items-center gap-12 md:grid-cols-2">
        <ExtensionMock className="order-2 md:order-1" />
        <div className="order-1 md:order-2">
          <StepLabel n={2}>Save</StepLabel>
          <h2 className="font-display text-3xl font-semibold tracking-tight md:text-4xl">
            Any job. One click. Gone from your tabs.
          </h2>
          <p className="mt-4 text-muted-foreground">
            The NextOffer Chrome extension reads the page for you — title,
            company, salary band, location, requirements — and drops it into your
            library with a live match score. No copy-paste, no spreadsheet.
          </p>
          <ul className="mt-6 space-y-3">
            <MiniCheck>Works on LinkedIn, Wellfound, Greenhouse, Lever, Ashby, Naukri</MiniCheck>
            <MiniCheck>Instant match score against your primary resume</MiniCheck>
            <MiniCheck>Lands in your pipeline, in the column you choose</MiniCheck>
          </ul>
          <div className="mt-6 flex gap-3">
            <ButtonLink to="/signup">
              <Chrome className="h-4 w-4" /> Install the extension
            </ButtonLink>
            <ButtonLink to="/features" variant="outline">See it work</ButtonLink>
          </div>
        </div>
      </div>
    </Section>
  );
}

function ExtensionMock({ className }: { className?: string }) {
  return (
    <div className={className}>
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
            Added to <span className="text-white">Interested</span> · auto-tagged
            <span className="text-[#93C5FD]"> Remote</span>,
            <span className="text-[#A78BFA]"> Senior</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* 3. Organize ----------------------------------------------------------- */

function StoryOrganize() {
  const cols = [
    { title: "Interested", tone: "text-muted-foreground", items: [{ c: "Linear", r: "Sr. Product Designer" }, { c: "Notion", r: "Design Engineer" }] },
    { title: "Applied", tone: "text-[#93C5FD]", items: [{ c: "Vercel", r: "Frontend Engineer" }, { c: "Raycast", r: "Design Engineer" }, { c: "Arc", r: "iOS Engineer" }] },
    { title: "Interview", tone: "text-[#A78BFA]", items: [{ c: "Stripe", r: "Design Systems" }, { c: "Anthropic", r: "Product Designer" }] },
    { title: "Offer", tone: "text-[#22C55E]", items: [{ c: "Figma", r: "Sr. Frontend" }] },
  ];
  return (
    <Section
      eyebrow="Organize"
      title="Your pipeline, made calm."
      description="Every role you're considering, in one focused board. Drag between stages, jot a note, and always know what's next."
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

/* 4. Resume match ------------------------------------------------------- */

function StoryResumeMatch() {
  return (
    <Section>
      <div className="grid items-center gap-12 md:grid-cols-2">
        <div className="order-2 md:order-1">
          <div className="relative">
            <div className="absolute -inset-8 -z-10 rounded-3xl bg-gradient-to-tr from-[#7C3AED]/20 to-[#2563EB]/10 blur-3xl" />
            <div className="rounded-2xl border border-white/10 bg-[oklch(0.19_0.03_265)]/80 p-4 backdrop-blur">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Match analysis</span>
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
                <p className="text-muted-foreground">Suggested improvement</p>
                <p className="mt-1">Add measurable impact to your Vercel role — the JD emphasizes performance metrics.</p>
              </div>
            </div>
          </div>
        </div>
        <div className="order-1 md:order-2">
          <StepLabel n={4}>Tailor</StepLabel>
          <h2 className="font-display text-3xl font-semibold tracking-tight md:text-4xl">
            Know which resume to send. And why.
          </h2>
          <p className="mt-4 text-muted-foreground">
            Upload your resume once. NextOffer scores it against the actual job
            description — per skill, keyword, and experience level — and tells
            you exactly what to change. No more guessing.
          </p>
          <div className="mt-6 grid grid-cols-2 gap-3 text-sm">
            {[
              { t: "Match score", d: "Per-role fit, grounded in the JD." },
              { t: "Skill gap", d: "What's missing, and how to close it." },
              { t: "AI rewrites", d: "One-click bullet rewrites, tuned for impact." },
              { t: "Cover letters", d: "In your voice — never generic." },
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

/* 5. ATS score ---------------------------------------------------------- */

function StoryATS() {
  return (
    <Section>
      <div className="grid items-center gap-12 md:grid-cols-2">
        <div>
          <StepLabel n={5}>Optimize</StepLabel>
          <h2 className="font-display text-3xl font-semibold tracking-tight md:text-4xl">
            Get past the bots before the humans.
          </h2>
          <p className="mt-4 text-muted-foreground">
            Most resumes are filtered out by software before a recruiter ever
            sees them. NextOffer checks your resume against modern applicant
            tracking systems in real time and shows fixes that actually move
            the needle.
          </p>
          <ul className="mt-6 space-y-3">
            <MiniCheck>Compatibility score for the role you're applying to</MiniCheck>
            <MiniCheck>Keyword density, formatting, and section checks</MiniCheck>
            <MiniCheck>Apply all fixes with a single click</MiniCheck>
          </ul>
        </div>
        <ATSMock />
      </div>
    </Section>
  );
}

function ATSMock() {
  return (
    <div className="relative">
      <div className="absolute -inset-8 -z-10 rounded-3xl bg-gradient-to-br from-[#7C3AED]/20 to-[#2563EB]/10 blur-3xl" />
      <div className="rounded-2xl border border-white/10 bg-[oklch(0.19_0.03_265)]/80 p-5 backdrop-blur">
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">ATS compatibility</p>
          <span className="rounded-full bg-[#22C55E]/15 px-2 py-0.5 text-[11px] text-[#22C55E]">Ready to apply</span>
        </div>
        <div className="mt-3 flex items-center gap-4">
          <svg viewBox="0 0 48 48" className="h-16 w-16 -rotate-90">
            <circle cx="24" cy="24" r="20" stroke="oklch(1 0 0 / 0.08)" strokeWidth="4" fill="none" />
            <circle cx="24" cy="24" r="20" stroke="#7C3AED" strokeWidth="4" fill="none" strokeDasharray={`${(88 / 100) * 125.6} 125.6`} strokeLinecap="round" />
          </svg>
          <div>
            <p className="font-display text-3xl font-semibold">88<span className="text-base text-muted-foreground">/100</span></p>
            <p className="text-[11px] text-muted-foreground">vs. Greenhouse screening rules</p>
          </div>
        </div>
        <div className="mt-5 space-y-2 text-xs">
          {[
            { l: "Keyword density", v: 82, c: "from-[#2563EB] to-[#3B82F6]" },
            { l: "Format & parsing", v: 96, c: "from-[#22C55E] to-[#16A34A]" },
            { l: "Section completeness", v: 90, c: "from-[#7C3AED] to-[#A855F7]" },
          ].map((r) => (
            <div key={r.l}>
              <div className="flex justify-between text-muted-foreground">
                <span>{r.l}</span>
                <span>{r.v}%</span>
              </div>
              <div className="mt-1 h-1.5 rounded-full bg-white/5">
                <div className={`h-full rounded-full bg-gradient-to-r ${r.c}`} style={{ width: `${r.v}%` }} />
              </div>
            </div>
          ))}
        </div>
        <button className="mt-5 inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-br from-[#2563EB] to-[#7C3AED] px-3 py-2 text-xs font-medium text-white">
          <Wand2 className="h-3.5 w-3.5" /> Apply all fixes
        </button>
      </div>
    </div>
  );
}

/* 6. Cover letter ------------------------------------------------------- */

function StoryCoverLetter() {
  return (
    <Section>
      <div className="grid items-center gap-12 md:grid-cols-2">
        <CoverLetterMock className="order-2 md:order-1" />
        <div className="order-1 md:order-2">
          <StepLabel n={6}>Write</StepLabel>
          <h2 className="font-display text-3xl font-semibold tracking-tight md:text-4xl">
            Cover letters that sound like you.
          </h2>
          <p className="mt-4 text-muted-foreground">
            NextOffer drafts a cover letter from your resume and the job
            description — in your tone, grounded in real projects you've shipped.
            Edit it in place, export to PDF, and send.
          </p>
          <ul className="mt-6 space-y-3">
            <MiniCheck>Generated from your resume and the JD — not a template</MiniCheck>
            <MiniCheck>Editable in place, exportable to PDF or paste-ready text</MiniCheck>
            <MiniCheck>One per application, saved with the role</MiniCheck>
          </ul>
        </div>
      </div>
    </Section>
  );
}

function CoverLetterMock({ className }: { className?: string }) {
  return (
    <div className={className}>
      <div className="relative">
        <div className="absolute -inset-8 -z-10 rounded-3xl bg-gradient-to-tr from-[#7C3AED]/20 to-[#2563EB]/10 blur-3xl" />
        <div className="rounded-2xl border border-white/10 bg-[oklch(0.19_0.03_265)]/80 p-4 backdrop-blur">
          <div className="flex items-center justify-between border-b border-white/5 pb-3 text-xs">
            <span className="text-muted-foreground">Cover letter · Linear · Sr. Product Designer</span>
            <span className="inline-flex items-center gap-1 text-[#A78BFA]"><Bot className="h-3 w-3" /> AI draft</span>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Hi Karri — I've followed Linear's craft since the first public beta.
            At Ramp I led the design-systems rollout that cut our component
            sprawl by 40%, and I'd love to bring that same discipline to your
            primitives team…
          </p>
          <div className="mt-4 flex items-center gap-2">
            <button className="rounded-lg bg-white/5 px-2.5 py-1.5 text-[11px] text-muted-foreground hover:bg-white/10">Regenerate</button>
            <button className="rounded-lg bg-white/5 px-2.5 py-1.5 text-[11px] text-muted-foreground hover:bg-white/10">Make it shorter</button>
            <button className="rounded-lg bg-gradient-to-br from-[#2563EB] to-[#7C3AED] px-2.5 py-1.5 text-[11px] font-medium text-white">Export PDF</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* 7. Apply -------------------------------------------------------------- */

function StoryApply() {
  return (
    <Section
      eyebrow="Apply"
      title="Send fewer applications. Better ones."
      description="When your resume is tailored and your cover letter is ready, applying is a single step — not a scramble. NextOffer keeps the right version attached to the right role."
    >
      <div className="grid gap-4 md:grid-cols-3">
        {[
          { icon: FileText, t: "Right resume, right role", d: "Each application remembers which tailored version you sent." },
          { icon: Bot, t: "Cover letter attached", d: "The AI draft is saved with the application, ready to resend or tweak." },
          { icon: Check, t: "One-click apply log", d: "Mark a role as applied and it moves to your pipeline automatically." },
        ].map((x) => (
          <div key={x.t} className="rounded-2xl border border-white/8 bg-white/[0.02] p-6">
            <div className="mb-4 grid h-9 w-9 place-items-center rounded-lg border border-white/10 bg-gradient-to-br from-white/5 to-transparent text-[#93C5FD]">
              <x.icon className="h-4 w-4" />
            </div>
            <p className="font-display text-[15px] font-semibold">{x.t}</p>
            <p className="mt-1.5 text-sm text-muted-foreground">{x.d}</p>
          </div>
        ))}
      </div>
    </Section>
  );
}

/* 8. Track -------------------------------------------------------------- */

function StoryTrack() {
  return (
    <Section
      eyebrow="Track"
      title="Never lose the thread."
      description="A dedicated kanban for job search — with reminders, notes, and follow-up nudges built in. You always know what's waiting on you."
    >
      <div className="grid gap-4 md:grid-cols-4">
        {[
          { icon: Kanban, t: "Kanban tracker", d: "Applied → Interview → Offer → Closed. Drag between stages." },
          { icon: StickyNote, t: "Notes per role", d: "Recruiter chats, salary bands, gut feelings — kept in context." },
          { icon: CalendarClock, t: "Interview tracker", d: "Rounds, panelists, prep notes, and follow-ups in one place." },
          { icon: LineChart, t: "Analytics", d: "Response rate, funnel, offer velocity — the metrics that predict outcomes." },
        ].map((x) => (
          <div key={x.t} className="rounded-2xl border border-white/8 bg-white/[0.02] p-5 transition-colors hover:border-white/15">
            <div className="mb-3 grid h-9 w-9 place-items-center rounded-lg border border-white/10 text-[#93C5FD]">
              <x.icon className="h-4 w-4" />
            </div>
            <p className="font-display text-sm font-semibold">{x.t}</p>
            <p className="mt-1.5 text-xs text-muted-foreground">{x.d}</p>
          </div>
        ))}
      </div>
    </Section>
  );
}

/* 9. Interviews --------------------------------------------------------- */

function StoryInterviews() {
  return (
    <Section>
      <div className="grid items-center gap-12 md:grid-cols-2">
        <div>
          <StepLabel n={9}>Prepare</StepLabel>
          <h2 className="font-display text-3xl font-semibold tracking-tight md:text-4xl">
            Walk in ready. Walk out confident.
          </h2>
          <p className="mt-4 text-muted-foreground">
            NextOffer generates likely interview questions from the job
            description, surfaces company research, and keeps your prep notes
            one click away. The night before gets a lot calmer.
          </p>
          <ul className="mt-6 space-y-3">
            <MiniCheck>AI-generated likely questions for the role and round</MiniCheck>
            <MiniCheck>Company research: funding, team size, what they just shipped</MiniCheck>
            <MiniCheck>Your prep notes, linked to the interview</MiniCheck>
          </ul>
        </div>
        <InterviewMock />
      </div>
    </Section>
  );
}

function InterviewMock() {
  return (
    <div className="relative">
      <div className="absolute -inset-8 -z-10 rounded-3xl bg-gradient-to-br from-[#7C3AED]/20 to-[#2563EB]/10 blur-3xl" />
      <div className="rounded-2xl border border-white/10 bg-[oklch(0.19_0.03_265)]/80 p-5 backdrop-blur">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold">Linear — Design round</p>
          <span className="rounded-full bg-[#7C3AED]/15 px-2 py-0.5 text-[11px] text-[#A78BFA]">Today · 2:30 PM</span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">with Karri Saarinen</p>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Likely questions</p>
            <ul className="mt-2 space-y-1.5 text-xs text-muted-foreground">
              <li>"Walk us through your favorite product's design."</li>
              <li>"How do you handle disagreements with engineering?"</li>
              <li>"What would you change about Linear's UI?"</li>
            </ul>
          </div>
          <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Company research</p>
            <ul className="mt-2 space-y-1.5 text-xs text-muted-foreground">
              <li>Just shipped Cycles v2 and Insights</li>
              <li>Series C · ~130 people · profitable</li>
              <li>Design-led, cares about primitives</li>
            </ul>
          </div>
        </div>
        <button className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-br from-[#2563EB] to-[#7C3AED] px-3 py-2 text-xs font-medium text-white">
          <Sparkles className="h-3.5 w-3.5" /> Open AI prep
        </button>
      </div>
    </div>
  );
}

/* 10. Offers ------------------------------------------------------------ */

function StoryOffers() {
  return (
    <Section>
      <div className="grid items-center gap-12 md:grid-cols-2">
        <OfferMock className="order-2 md:order-1" />
        <div className="order-1 md:order-2">
          <StepLabel n={10}>Land</StepLabel>
          <h2 className="font-display text-3xl font-semibold tracking-tight md:text-4xl">
            From first save to signed offer.
          </h2>
          <p className="mt-4 text-muted-foreground">
            When the offer lands, your whole search is already organized —
            comparisons, notes, and the resume version that got you there.
            NextOffer is the workspace that sees you through to the signature.
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

function OfferMock({ className }: { className?: string }) {
  return (
    <div className={className}>
      <div className="relative">
        <div className="absolute -inset-8 -z-10 rounded-3xl bg-gradient-to-tr from-[#22C55E]/20 to-[#2563EB]/10 blur-3xl" />
        <div className="rounded-2xl border border-white/10 bg-[oklch(0.19_0.03_265)]/80 p-5 backdrop-blur">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-[#22C55E]/15 text-[#22C55E]">
              <Trophy className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm font-semibold">Offer received — Stripe</p>
              <p className="text-xs text-muted-foreground">Design Engineer · $220k base + equity</p>
            </div>
          </div>
          <div className="mt-4 rounded-xl border border-white/5 bg-white/[0.02] p-4">
            <p className="text-xs text-muted-foreground">Your search at a glance</p>
            <div className="mt-3 grid grid-cols-3 gap-3 text-center">
              {[
                { v: "68", l: "Saved" },
                { v: "42", l: "Applied" },
                { v: "2", l: "Offers" },
              ].map((s) => (
                <div key={s.l}>
                  <p className="font-display text-xl font-semibold">{s.v}</p>
                  <p className="text-[10px] text-muted-foreground">{s.l}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------- Social proof */

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
            Free to start. Bring your resume, install the extension, save your
            first job. Your calmest job search begins in under two minutes.
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
