import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  PlayCircle,
  Chrome,
  Sparkles,
  Bookmark,
  BrainCircuit,
  Kanban,
  Trophy,
  Check,
} from "lucide-react";
import { HeroComposition } from "@/components/site/HeroComposition";
import { LogoRow } from "@/components/site/LogoRow";
import { Section } from "@/components/site/Section";
import { ButtonLink } from "@/components/site/PrimaryButton";
import { Reveal } from "@/components/site/Reveal";

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
      <StorySteps />
      <PipelinePreview />
      <TestimonialSection />
      <CTASection />
    </>
  );
}

/* ----------------------------------------------------------------- Hero */

function Hero() {
  return (
    <section className="relative overflow-hidden pt-28 pb-4">
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
        <h1 className="mt-5 font-display text-5xl font-semibold tracking-tight md:text-6xl lg:text-7xl">
          The workspace for your{" "}
          <span className="text-gradient">next offer</span>.
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-base text-muted-foreground md:text-lg">
          Save jobs as you browse, tailor your resume with AI, track every
          application, and walk into interviews ready.
        </p>
        <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <ButtonLink to="/signup" size="lg">
            Get Started Free
            <ArrowRight className="h-4 w-4" />
          </ButtonLink>
          <ButtonLink to="/dashboard" size="lg" variant="outline">
            <PlayCircle className="h-4 w-4" />
            See the workspace
          </ButtonLink>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Free forever. No credit card. Chrome extension included.
        </p>
      </div>
      <div className="mt-10">
        <HeroComposition />
      </div>
    </section>
  );
}

/* ----------------------------------------------------- The journey (condensed) */

function StorySteps() {
  const steps = [
    {
      icon: Bookmark,
      kicker: "Save",
      title: "Any job, one click.",
      copy: "The Chrome extension grabs the title, salary, and requirements from any posting — LinkedIn, Wellfound, Greenhouse, or a company page.",
      visual: <SaveVisual />,
    },
    {
      icon: BrainCircuit,
      kicker: "Tailor",
      title: "Know what to change.",
      copy: "NextOffer scores your resume against the actual job description and rewrites your bullets for impact. Cover letters come in your voice.",
      visual: <TailorVisual />,
      reverse: true,
    },
    {
      icon: Kanban,
      kicker: "Track",
      title: "Never lose the thread.",
      copy: "A calm kanban for your search. Drag between stages, jot notes, get nudged when something goes quiet.",
      visual: <TrackVisual />,
    },
    {
      icon: Trophy,
      kicker: "Land",
      title: "From first save to signed offer.",
      copy: "When the offer lands, your whole search is already organized — comparisons, notes, and the resume that got you there.",
      visual: <LandVisual />,
      reverse: true,
    },
  ];

  return (
    <Section>
      <div className="space-y-16">
        {steps.map((s, i) => (
          <Reveal key={s.kicker} delay={i * 60}>
          <div className="grid items-center gap-8 md:grid-cols-2 md:gap-12">
            <div className={s.reverse ? "order-2 md:order-1" : ""}>
              <div className="mb-3 flex items-center gap-2.5">
                <span className="grid h-6 w-6 place-items-center rounded-full border border-white/10 bg-white/[0.03] text-[11px] font-semibold text-muted-foreground">
                  {i + 1}
                </span>
                <span className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                  {s.kicker}
                </span>
              </div>
              <h2 className="font-display text-2xl font-semibold tracking-tight md:text-3xl">
                {s.title}
              </h2>
              <p className="mt-3 text-sm text-muted-foreground md:text-base">
                {s.copy}
              </p>
            </div>
            <div className={s.reverse ? "order-1 md:order-2" : ""}>{s.visual}</div>
          </div>
          </Reveal>
        ))}
      </div>
    </Section>
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

/* ------------------------------------------------------- Visuals */

function Frame({ children, tone = "from-[#2563EB]/15 to-[#7C3AED]/10" }: { children: React.ReactNode; tone?: string }) {
  return (
    <div className="relative">
      <div className={`absolute -inset-6 -z-10 rounded-3xl bg-gradient-to-br ${tone} blur-3xl`} />
      <div className="rounded-2xl border border-white/10 bg-[oklch(0.19_0.03_265)]/80 p-4 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.7)] backdrop-blur">
        {children}
      </div>
    </div>
  );
}

function SaveVisual() {
  const sources = [
    { n: "LinkedIn", c: "from-[#0A66C2] to-[#0A66C2]/60", j: "Sr. Frontend Engineer · Notion" },
    { n: "Wellfound", c: "from-[#000] to-[#374151]", j: "Design Engineer · Raycast" },
    { n: "Greenhouse", c: "from-[#2D6E55] to-[#4FA57D]", j: "Product Designer · Anthropic" },
  ];
  return (
    <Frame>
      <p className="px-1 pb-2 text-xs text-muted-foreground">Three platforms — one library.</p>
      <div className="space-y-2">
        {sources.map((s) => (
          <div key={s.n} className="flex items-center gap-3 rounded-xl border border-white/5 bg-white/[0.02] p-2.5 transition-colors hover:border-white/10">
            <div className={`grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br ${s.c} text-[10px] font-semibold text-white`}>
              {s.n[0]}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium">{s.j}</p>
              <p className="text-[10px] text-muted-foreground">via {s.n}</p>
            </div>
            <button className="rounded-md bg-gradient-to-br from-[#2563EB] to-[#7C3AED] px-2 py-1 text-[10px] font-medium text-white">Save</button>
          </div>
        ))}
      </div>
    </Frame>
  );
}

function TailorVisual() {
  return (
    <Frame tone="from-[#7C3AED]/15 to-[#2563EB]/10">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">Match analysis</span>
        <span className="rounded-full bg-[#22C55E]/15 px-2 py-0.5 text-[#22C55E]">Strong fit</span>
      </div>
      <div className="mt-3 flex items-end gap-2">
        <p className="font-display text-4xl font-semibold">92<span className="text-xl text-muted-foreground">%</span></p>
        <p className="pb-1.5 text-[11px] text-muted-foreground">resume ↔ JD</p>
      </div>
      <div className="mt-4 space-y-2.5 text-xs">
        {[
          { l: "Skills coverage", v: 94 },
          { l: "Keywords", v: 76 },
        ].map((r) => (
          <div key={r.l}>
            <div className="flex justify-between text-muted-foreground"><span>{r.l}</span><span>{r.v}%</span></div>
            <div className="mt-1 h-1.5 rounded-full bg-white/5">
              <div className="h-full rounded-full bg-gradient-to-r from-[#2563EB] to-[#7C3AED]" style={{ width: `${r.v}%` }} />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 rounded-lg border border-white/10 bg-white/[0.02] p-2.5 text-[11px] text-muted-foreground">
        Add measurable impact to your Vercel role — the JD emphasizes performance metrics.
      </div>
    </Frame>
  );
}

function TrackVisual() {
  const cols = [
    { title: "Applied", tone: "text-[#93C5FD]", items: ["Vercel", "Raycast"] },
    { title: "Interview", tone: "text-[#A78BFA]", items: ["Stripe"] },
    { title: "Offer", tone: "text-[#22C55E]", items: ["Figma"] },
  ];
  return (
    <Frame>
      <div className="grid grid-cols-3 gap-2">
        {cols.map((c) => (
          <div key={c.title} className="rounded-xl border border-white/5 bg-white/[0.02] p-2">
            <p className={`px-1 pb-1.5 text-[10px] font-semibold ${c.tone}`}>{c.title}</p>
            <div className="space-y-1.5">
              {c.items.map((it) => (
                <div key={it} className="rounded-lg border border-white/5 bg-white/[0.02] p-2">
                  <p className="text-[10px] font-semibold">{it}</p>
                  <p className="text-[9px] text-muted-foreground">Senior</p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Frame>
  );
}

function LandVisual() {
  return (
    <Frame tone="from-[#22C55E]/15 to-[#2563EB]/10">
      <div className="flex items-center gap-3">
        <span className="grid h-9 w-9 place-items-center rounded-full bg-[#22C55E]/15 text-[#22C55E]">
          <Trophy className="h-4 w-4" />
        </span>
        <div>
          <p className="text-sm font-semibold">Offer received — Stripe</p>
          <p className="text-[11px] text-muted-foreground">Design Engineer · $220k base + equity</p>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        {[{ v: "68", l: "Saved" }, { v: "42", l: "Applied" }, { v: "2", l: "Offers" }].map((s) => (
          <div key={s.l} className="rounded-lg border border-white/5 bg-white/[0.02] p-2">
            <p className="font-display text-lg font-semibold">{s.v}</p>
            <p className="text-[9px] text-muted-foreground">{s.l}</p>
          </div>
        ))}
      </div>
    </Frame>
  );
}

/* ----------------------------------------------------- Pipeline preview */

function PipelinePreview() {
  return (
    <Section
      align="center"
      eyebrow="See it in motion"
      title="One board for your whole search."
      description="Interested, applied, interviewing, offer — drag, drop, and always know what's next."
    >
      <Reveal>
      <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 backdrop-blur">
        <div className="grid gap-3 md:grid-cols-4">
          {[
            { title: "Interested", tone: "text-muted-foreground", items: [{ c: "Linear", r: "Sr. Product Designer" }, { c: "Notion", r: "Design Engineer" }] },
            { title: "Applied", tone: "text-[#93C5FD]", items: [{ c: "Vercel", r: "Frontend Engineer" }, { c: "Raycast", r: "Design Engineer" }] },
            { title: "Interview", tone: "text-[#A78BFA]", items: [{ c: "Stripe", r: "Design Systems" }, { c: "Anthropic", r: "Product Designer" }] },
            { title: "Offer", tone: "text-[#22C55E]", items: [{ c: "Figma", r: "Sr. Frontend" }] },
          ].map((col) => (
            <div key={col.title} className="rounded-xl border border-white/5 bg-[oklch(0.19_0.03_265)]/50 p-3">
              <div className="flex items-center justify-between px-1 pb-2 text-xs">
                <span className={`font-semibold ${col.tone}`}>{col.title}</span>
                <span className="text-muted-foreground">{col.items.length}</span>
              </div>
              <div className="space-y-2">
                {col.items.map((it) => (
                  <div key={it.c + it.r} className="rounded-lg border border-white/5 bg-white/[0.02] p-3 transition-transform hover:-translate-y-0.5">
                    <div className="flex items-center gap-2">
                      <div className="grid h-6 w-6 place-items-center rounded bg-white/10 text-[10px] font-semibold">{it.c[0]}</div>
                      <p className="text-xs font-semibold">{it.c}</p>
                    </div>
                    <p className="mt-1.5 text-[11px] text-muted-foreground">{it.r}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
      </Reveal>
      <div className="mt-6 text-center">
        <ButtonLink to="/features" variant="outline">
          Explore every feature <ArrowRight className="h-4 w-4" />
        </ButtonLink>
      </div>
    </Section>
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
    <Section eyebrow="Trusted by careful job hunters" title="A calmer way to look for your next thing.">
      <div className="grid gap-4 md:grid-cols-3">
        {quotes.map((q) => (
          <figure key={q.n} className="rounded-2xl border border-white/8 bg-white/[0.02] p-6">
            <blockquote className="font-display text-lg leading-snug">"{q.q}"</blockquote>
            <figcaption className="mt-5 flex items-center gap-3">
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
    <Section className="pb-20">
      <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-[oklch(0.22_0.06_265)] to-[oklch(0.18_0.08_290)] p-8 md:p-12">
        <div className="pointer-events-none absolute -right-20 -top-20 h-80 w-80 rounded-full bg-[#2563EB]/30 blur-[100px]" />
        <div className="pointer-events-none absolute -bottom-24 -left-10 h-80 w-80 rounded-full bg-[#7C3AED]/30 blur-[100px]" />
        <div className="relative max-w-2xl">
          <h3 className="font-display text-3xl font-semibold tracking-tight md:text-4xl">
            Land your <span className="text-gradient">next offer</span>.
          </h3>
          <p className="mt-3 text-sm text-muted-foreground md:text-base">
            Free to start. Your calmest job search begins in under two minutes.
          </p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
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
