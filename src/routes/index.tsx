import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, CirclePlay as PlayCircle, Trophy } from "lucide-react";
import { SUPPORTED_PLATFORM_NAMES } from "@/content/extension";
import { HeroComposition } from "@/components/site/HeroComposition";
import { LogoRow } from "@/components/site/LogoRow";
import { Section } from "@/components/site/Section";
import { ButtonLink } from "@/components/site/PrimaryButton";
import { Reveal } from "@/components/site/Reveal";
import { pageSeo, absoluteUrl } from "@/content/site";

export const Route = createFileRoute("/")({
  head: () => ({
    ...pageSeo({
      path: "/",
      title: "Job Application Tracker & Resume AI — OfferLyst",
      description:
        "Save jobs from the sites you already use, tailor your resume with AI, track every application, and land your next offer, all in one calm workspace.",
      ogDescription:
        "The calmest way to find your next job. Save, tailor, track, and land offers from one focused workspace.",
    }),
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebSite",
          name: "OfferLyst",
          url: absoluteUrl("/"),
          description:
            "OfferLyst is the workspace for your entire job search: save jobs from the sites you already use, tailor your resume with AI, track every application, and prepare for interviews.",
        }),
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
      <BuiltForSection />
    </>
  );
}

/* ----------------------------------------------------------------- Hero */

function Hero() {
  return (
    <section className="relative overflow-hidden pt-28 pb-4 md:pt-32">
      <div className="absolute inset-0 grid-bg -z-10" />
      <div className="site-container text-center">
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
        <h1 className="mx-auto mt-6 max-w-[16ch] font-display text-fluid-hero font-semibold tracking-tight">
          The workspace for your <span className="text-gradient">next offer</span>
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-fluid-lead text-muted-foreground">
          Save jobs as you browse, tailor your resume with AI, track every application, and walk
          into interviews ready.
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
        <p className="mt-3 text-xs text-muted-foreground">
          Free to start. No credit card. Chrome extension included.
        </p>
      </div>
      <div className="mt-12">
        <HeroComposition />
      </div>
    </section>
  );
}

/* ----------------------------------------------------- The journey (condensed) */

function StorySteps() {
  const steps = [
    {
      kicker: "Save",
      title: "Any job, one click.",
      copy: `The Chrome extension reads the title, company, location and salary straight off the posting on ${SUPPORTED_PLATFORM_NAMES.slice(0, -1).join(", ")} and ${SUPPORTED_PLATFORM_NAMES.at(-1)}.`,
      visual: <SaveVisual />,
    },
    {
      kicker: "Tailor",
      title: "Know what to change.",
      copy: "OfferLyst scores your resume against the actual job description, shows where it falls short on ATS checks, and suggests rewrites. Cover letters are drafted from your own resume, not invented.",
      visual: <TailorVisual />,
      reverse: true,
    },
    {
      kicker: "Track",
      title: "Never lose the thread.",
      copy: "A calm board for your search. Drag between stages, keep notes on each role, and let the Gmail inbox review catch replies you would otherwise miss.",
      visual: <TrackVisual />,
    },
    {
      kicker: "Prepare",
      title: "Walk in ready.",
      copy: "Generate prep for a specific interview, practise with a mock interviewer, and get a scored report on where your answers need work.",
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
                <h2 className="font-display text-fluid-h3 font-semibold tracking-tight">
                  {s.title}
                </h2>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground md:text-base">
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

/* ------------------------------------------------------- Visuals */

/**
 * Illustration wrapper. Everything inside a Frame is a drawing of the
 * interface, not a screenshot and not real user data, so each one carries a
 * visible "Example" marker rather than being passed off as a live view.
 */
function Frame({
  children,
  tone = "from-[#2563EB]/15 to-[#7C3AED]/10",
}: {
  children: React.ReactNode;
  tone?: string;
}) {
  return (
    <div className="relative">
      {/* Decorative glow. Kept inside the viewport at small widths: at -inset-6
          the card is already near full width on a 360-390px screen, so the
          glow spilled ~4px past the right edge and produced a horizontal
          scrollbar on the whole page. */}
      <div
        className={`absolute -inset-3 -z-10 rounded-3xl sm:-inset-6 bg-gradient-to-br ${tone} blur-3xl`}
      />
      <div className="rounded-2xl border border-white/10 bg-[oklch(0.19_0.03_265)]/80 p-4 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.7)] backdrop-blur">
        <span className="mb-2.5 inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Example
        </span>
        {children}
      </div>
    </div>
  );
}

function SaveVisual() {
  const sources = [
    { n: "LinkedIn", c: "from-[#0A66C2] to-[#0A66C2]/60", j: "Frontend Engineer" },
    { n: "Naukri", c: "from-[#4A90D9] to-[#2E5F8A]", j: "Business Analyst" },
    { n: "Internshala", c: "from-[#00A5EC] to-[#0077B0]", j: "Product Management Intern" },
  ];
  return (
    <Frame>
      <p className="px-1 pb-2 text-xs text-muted-foreground">
        Saved from three sites, one library.
      </p>
      <div className="space-y-2">
        {sources.map((s) => (
          <div
            key={s.n}
            className="flex items-center gap-3 rounded-xl border border-white/5 bg-white/[0.02] p-2.5 transition-colors hover:border-white/10"
          >
            <div
              className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-gradient-to-br ${s.c} text-[10px] font-semibold text-white`}
            >
              {s.n[0]}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium">{s.j}</p>
              <p className="text-[10px] text-muted-foreground">via {s.n}</p>
            </div>
            <span className="shrink-0 rounded-md bg-gradient-to-br from-[#2563EB] to-[#7C3AED] px-2 py-1 text-[10px] font-medium text-white">
              Saved
            </span>
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
        <p className="font-display text-4xl font-semibold">
          92<span className="text-xl text-muted-foreground">%</span>
        </p>
        <p className="pb-1.5 text-[11px] text-muted-foreground">resume ↔ JD</p>
      </div>
      <div className="mt-4 space-y-2.5 text-xs">
        {[
          { l: "Skills coverage", v: 94 },
          { l: "Keywords", v: 76 },
        ].map((r) => (
          <div key={r.l}>
            <div className="flex justify-between text-muted-foreground">
              <span>{r.l}</span>
              <span>{r.v}%</span>
            </div>
            <div className="mt-1 h-1.5 rounded-full bg-white/5">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#2563EB] to-[#7C3AED]"
                style={{ width: `${r.v}%` }}
              />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 rounded-lg border border-white/10 bg-white/[0.02] p-2.5 text-[11px] text-muted-foreground">
        Add measurable impact to your most recent role. This posting asks for performance metrics.
      </div>
    </Frame>
  );
}

function TrackVisual() {
  const cols = [
    {
      title: "Applied",
      tone: "text-[#93C5FD]",
      items: ["Data Analyst", "Backend Engineer"],
    },
    { title: "Interview", tone: "text-[#A78BFA]", items: ["Product Manager"] },
    { title: "Offer", tone: "text-[#22C55E]", items: ["Frontend Engineer"] },
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
                  <p className="text-[10px] font-semibold leading-tight">{it}</p>
                  <p className="mt-0.5 text-[9px] text-muted-foreground">Applied this week</p>
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
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#22C55E]/15 text-[#22C55E]">
          <Trophy className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold">Mock interview report</p>
          <p className="text-[11px] text-muted-foreground">Round 1 · Behavioural</p>
        </div>
      </div>
      <div className="mt-3 space-y-2 text-[11px]">
        {[
          { l: "Structure", v: 78 },
          { l: "Communication", v: 64 },
          { l: "Trade-offs", v: 52 },
        ].map((r) => (
          <div key={r.l}>
            <div className="flex justify-between text-muted-foreground">
              <span>{r.l}</span>
              <span className="tabular-nums">{r.v}</span>
            </div>
            <div className="mt-1 h-1.5 rounded-full bg-white/5">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#2563EB] to-[#7C3AED]"
                style={{ width: `${r.v}%` }}
              />
            </div>
          </div>
        ))}
      </div>
      <p className="mt-3 rounded-lg border border-white/10 bg-white/[0.02] p-2.5 text-[11px] text-muted-foreground">
        Weakest area: trade-offs. Practise justifying one decision per answer.
      </p>
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
      description="Applied, assessment, interview, offer. Drag between stages and always know what's next."
    >
      <Reveal>
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 backdrop-blur">
          <p className="mb-3 text-center text-[11px] text-muted-foreground">
            Example board. Your own roles appear here once you start saving jobs.
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                title: "Applied",
                tone: "text-[#93C5FD]",
                items: [
                  { r: "Frontend Engineer", m: "Applied 3 days ago" },
                  { r: "Business Analyst", m: "Applied last week" },
                ],
              },
              {
                title: "Assessment",
                tone: "text-[#C4B5FD]",
                items: [{ r: "Data Analyst", m: "Test due Friday" }],
              },
              {
                title: "Interview",
                tone: "text-[#A78BFA]",
                items: [
                  { r: "Product Manager", m: "Round 2 scheduled" },
                  { r: "Backend Engineer", m: "Awaiting a date" },
                ],
              },
              {
                title: "Offer",
                tone: "text-[#22C55E]",
                items: [{ r: "Product Internship", m: "Reviewing terms" }],
              },
            ].map((col) => (
              <div
                key={col.title}
                className="rounded-xl border border-white/5 bg-[oklch(0.19_0.03_265)]/50 p-3"
              >
                <div className="flex items-center justify-between px-1 pb-2 text-xs">
                  <span className={`font-semibold ${col.tone}`}>{col.title}</span>
                  <span className="text-muted-foreground tabular-nums">{col.items.length}</span>
                </div>
                <div className="space-y-2">
                  {col.items.map((it) => (
                    <div
                      key={it.r}
                      className="rounded-lg border border-white/5 bg-white/[0.02] p-3 transition-transform hover:-translate-y-0.5"
                    >
                      <p className="text-xs font-semibold leading-snug">{it.r}</p>
                      <p className="mt-1.5 text-[11px] text-muted-foreground">{it.m}</p>
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

/**
 * Replaces the previous testimonial section. OfferLyst is early access and has
 * no verified customer feedback to quote, so this describes the situations the
 * product is built around instead of attributing invented quotes to invented
 * people. Swap in real quotes only once there is pilot feedback that the
 * person has agreed to have published.
 */
function BuiltForSection() {
  const scenarios = [
    {
      title: "The search is spread across six tabs",
      body: "Naukri, Internshala, LinkedIn and three company sites, with a spreadsheet that stopped being accurate two weeks ago. Save from any supported site and it all lands in one place.",
    },
    {
      title: "The same resume goes out for every role",
      body: "OfferLyst scores your resume against a specific posting, flags what an ATS is likely to miss, and tells you which lines to change.",
    },
    {
      title: "Replies get buried in the inbox",
      body: "Connect Gmail and OfferLyst reviews what came in, then proposes updates to your applications and interviews. Nothing changes until you approve it.",
    },
  ];
  return (
    <Section
      spacing="last"
      eyebrow="Built for the Indian job search"
      title="For the parts of a job hunt nobody enjoys."
      description="OfferLyst is in early access. Rather than publish testimonials we cannot verify, here is what the product is actually built to handle."
    >
      <div className="grid gap-4 md:grid-cols-3">
        {scenarios.map((s) => (
          <div
            key={s.title}
            className="card-hover flex flex-col rounded-2xl border border-white/8 bg-white/[0.02] p-6"
          >
            <h3 className="font-display text-fluid-h3 font-semibold leading-snug">{s.title}</h3>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{s.body}</p>
          </div>
        ))}
      </div>
      <div className="mt-10 flex flex-col items-center gap-3 text-center">
        <ButtonLink to="/signup" size="lg">
          Get Started Free
          <ArrowRight className="h-4 w-4" />
        </ButtonLink>
        <p className="text-xs text-muted-foreground">
          Free to start, with an AI credit allowance on every account.
        </p>
      </div>
    </Section>
  );
}
