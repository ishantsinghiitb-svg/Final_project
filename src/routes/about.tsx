import { createFileRoute } from "@tanstack/react-router";
import {
  Shield,
  Compass,
  Heart,
  Map,
  Lock,
  Mail,
  Layers,
  PencilLine,
  Clock,
  StickyNote,
  Feather,
  Target,
  ShieldCheck,
} from "lucide-react";
import { Section } from "@/components/site/Section";
import { ButtonLink } from "@/components/site/PrimaryButton";
import { Reveal } from "@/components/site/Reveal";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "About — NextOffer" },
      { name: "description", content: "Why NextOffer exists, our philosophy, and what we're building next." },
      { property: "og:title", content: "About — NextOffer" },
      { property: "og:description", content: "Our mission, our philosophy, and the road ahead." },
    ],
  }),
  component: About,
});

function About() {
  return (
    <>
      {/* Hero */}
      <Reveal>
        <Section
          align="center"
          className="pt-20 md:pt-28"
          eyebrow="About"
          title="We're building the calmest way to find your next job."
          description="Job hunting shouldn't happen across browser tabs, spreadsheets, and document versions. NextOffer is the calm workspace we always wished existed."
        />
      </Reveal>

      {/* Mission */}
      <Reveal>
        <Section className="pt-0" title="Why we exist.">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-6">
              <div className="mb-4 grid h-9 w-9 place-items-center rounded-lg border border-white/10 bg-gradient-to-br from-white/5 to-transparent text-[#93C5FD]">
                <Compass className="h-4 w-4" />
              </div>
              <p className="font-display text-lg font-semibold">Mission</p>
              <p className="mt-2 text-sm text-muted-foreground">
                One calm workspace for your whole search — from the first role you notice to the offer
                you sign.
              </p>
            </div>
            <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-6">
              <div className="mb-4 grid h-9 w-9 place-items-center rounded-lg border border-white/10 bg-gradient-to-br from-white/5 to-transparent text-[#A78BFA]">
                <Heart className="h-4 w-4" />
              </div>
              <p className="font-display text-lg font-semibold">Vision</p>
              <p className="mt-2 text-sm text-muted-foreground">
                A job search that feels like a focused project, not a second job.
              </p>
            </div>
          </div>
        </Section>
      </Reveal>

      {/* Why we built it */}
      <Reveal>
        <Section className="pt-0" align="center" eyebrow="Why we built it" title="We lived the mess. So we built the fix.">
          <p className="mx-auto max-w-2xl text-base text-muted-foreground md:text-lg">
            Every job hunt ends the same way — forty tabs, a stale spreadsheet, a resume tweaked twelve
            times. NextOffer is the workspace we wished had existed.
          </p>
        </Section>
      </Reveal>

      {/* Problems with today's job search */}
      <Reveal>
        <Section className="pt-0" eyebrow="The problem" title="How the job search breaks down.">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                icon: Layers,
                t: "Browser tab chaos",
                d: "Forty open tabs, no idea which one was promising.",
              },
              {
                icon: PencilLine,
                t: "Resume guesswork",
                d: "Tweaking blindly, hoping it fits the role.",
              },
              {
                icon: Clock,
                t: "Forgotten follow-ups",
                d: "The email you meant to send two weeks ago.",
              },
              {
                icon: StickyNote,
                t: "Scattered notes",
                d: "Interview prep spread across docs, chats, and sticky notes.",
              },
            ].map((v) => (
              <div key={v.t} className="rounded-2xl border border-white/8 bg-white/[0.02] p-5">
                <div className="mb-4 grid h-9 w-9 place-items-center rounded-lg border border-white/10 bg-gradient-to-br from-white/5 to-transparent text-[#93C5FD]">
                  <v.icon className="h-4 w-4" />
                </div>
                <p className="font-display text-base font-semibold">{v.t}</p>
                <p className="mt-2 text-sm text-muted-foreground">{v.d}</p>
              </div>
            ))}
          </div>
        </Section>
      </Reveal>

      {/* Philosophy */}
      <Reveal>
        <Section className="pt-0" title="What we believe.">
          <div className="grid gap-4 md:grid-cols-3">
            {[
              { t: "Craft over volume", d: "One tailored application beats fifty generic ones. We help you send fewer, better." },
              { t: "Your data is yours", d: "Encrypted, exportable, deletable. Never sold or shared." },
              { t: "Calm is a feature", d: "The product should feel light in your hand — focused, fast, quiet." },
              { t: "Grounded, not generic", d: "Every AI suggestion ties to the real job description and your real resume." },
              { t: "Signal over vanity", d: "We surface metrics that predict outcomes, not dashboards that look busy." },
              { t: "Honest pricing", d: "Free for casual use. Pro when it's serious. Cancel in one click." },
            ].map((v) => (
              <div key={v.t} className="rounded-2xl border border-white/8 bg-white/[0.02] p-5">
                <p className="font-display text-base font-semibold">{v.t}</p>
                <p className="mt-2 text-sm text-muted-foreground">{v.d}</p>
              </div>
            ))}
          </div>
        </Section>
      </Reveal>

      {/* How we build */}
      <Reveal>
        <Section className="pt-0" eyebrow="How we build" title="Three principles we won't trade away.">
          <div className="grid gap-4 md:grid-cols-3">
            {[
              {
                icon: Feather,
                t: "Calm over feature-bloat",
                d: "We ship fewer things, done well. Every feature earns its place.",
              },
              {
                icon: Target,
                t: "AI that's grounded, not generic",
                d: "Suggestions tie to your real resume and the real job. No filler.",
              },
              {
                icon: ShieldCheck,
                t: "Privacy as default",
                d: "Encrypted by default. Your data is never training data.",
              },
            ].map((v) => (
              <div key={v.t} className="rounded-2xl border border-white/8 bg-white/[0.02] p-6">
                <div className="mb-4 grid h-9 w-9 place-items-center rounded-lg border border-white/10 bg-gradient-to-br from-white/5 to-transparent text-[#A78BFA]">
                  <v.icon className="h-4 w-4" />
                </div>
                <p className="font-display text-base font-semibold">{v.t}</p>
                <p className="mt-2 text-sm text-muted-foreground">{v.d}</p>
              </div>
            ))}
          </div>
        </Section>
      </Reveal>

      {/* Roadmap */}
      <Reveal>
        <Section className="pt-0" eyebrow="Roadmap" title="What's next.">
          <div className="grid gap-4 md:grid-cols-3">
            <RoadmapPhase
              phase="Now"
              status="live"
              title="The core workspace"
              items={[
                "Chrome extension for one-click saving",
                "Resume match, ATS score, and AI cover letters",
                "Kanban tracker, interview prep, and analytics",
              ]}
            />
            <RoadmapPhase
              className="md:mt-10"
              phase="Next"
              status="building"
              title="Smarter tracking"
              items={[
                "Automatic follow-up nudges based on response time",
                "Calendar sync for interviews (Google Calendar)",
                "Recruiter email detection (Gmail integration)",
              ]}
            />
            <RoadmapPhase
              className="md:mt-20"
              phase="Later"
              status="planned"
              title="Beyond the search"
              items={[
                "Refer-a-friend and shared job libraries",
                "Salary insights from anonymized offer data",
                "Coach and career-services workspace (Team plan)",
              ]}
            />
          </div>
          <div className="mt-6 flex items-center gap-2 text-xs text-muted-foreground">
            <Map className="h-3.5 w-3.5" />
            A living roadmap — we ship continuously and adjust based on what you tell us.
          </div>
        </Section>
      </Reveal>

      {/* Privacy & trust */}
      <Reveal>
        <Section className="pt-0" title="Privacy & trust.">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-6">
              <div className="mb-4 grid h-9 w-9 place-items-center rounded-lg border border-white/10 text-[#22C55E]">
                <Shield className="h-4 w-4" />
              </div>
              <p className="font-display text-base font-semibold">Your resume is never training data</p>
              <p className="mt-2 text-sm text-muted-foreground">
                We use your resume only to do what you ask — match scoring, tailoring, cover letters.
                We never train models on it or share it with anyone.
              </p>
            </div>
            <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-6">
              <div className="mb-4 grid h-9 w-9 place-items-center rounded-lg border border-white/10 text-[#93C5FD]">
                <Lock className="h-4 w-4" />
              </div>
              <p className="font-display text-base font-semibold">Encrypted, exportable, deletable</p>
              <p className="mt-2 text-sm text-muted-foreground">
                AES-256 at rest, TLS 1.3 in transit, stored in EU/US data centers. Export everything
                anytime, or delete it all in one click.
              </p>
            </div>
          </div>
        </Section>
      </Reveal>

      {/* Future vision */}
      <Reveal>
        <Section className="pt-0" align="center" eyebrow="Where we're headed" title="A calmer search, by default.">
          <p className="mx-auto max-w-2xl text-base text-muted-foreground md:text-lg">
            The right role, the right application, and the right nudge — all in one quiet workspace.
            That's the future we're building toward.
          </p>
        </Section>
      </Reveal>

      {/* CTA */}
      <Reveal>
        <Section className="pb-32 pt-0">
          <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-[oklch(0.22_0.06_265)] to-[oklch(0.18_0.08_290)] p-10 md:p-14">
            <div className="flex flex-col items-start gap-6 md:flex-row md:items-center md:justify-between">
              <div>
                <h3 className="font-display text-3xl font-semibold md:text-4xl">Come build it with us.</h3>
                <p className="mt-3 max-w-xl text-muted-foreground">
                  We're a small, focused team. Ideas, bugs, or feature requests — we read every message.
                </p>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row">
                <ButtonLink to="/contact" size="lg">
                  <Mail className="h-4 w-4" /> Talk to us
                </ButtonLink>
                <ButtonLink to="/signup" size="lg" variant="outline">
                  Try the product
                </ButtonLink>
              </div>
            </div>
          </div>
        </Section>
      </Reveal>
    </>
  );
}

function RoadmapPhase({
  phase,
  status,
  title,
  items,
  className = "",
}: {
  phase: string;
  status: "live" | "building" | "planned";
  title: string;
  items: string[];
  className?: string;
}) {
  const statusMap = {
    live: {
      label: "Live",
      tone: "bg-[#22C55E]/15 text-[#22C55E]",
      accent: "bg-[#22C55E]",
    },
    building: {
      label: "In progress",
      tone: "bg-[#2563EB]/15 text-[#93C5FD]",
      accent: "bg-gradient-to-r from-[#2563EB] to-[#7C3AED]",
    },
    planned: {
      label: "Planned",
      tone: "bg-white/5 text-muted-foreground",
      accent: "bg-white/20",
    },
  } as const;
  const s = statusMap[status];
  return (
    <div className={`rounded-2xl border border-white/8 bg-white/[0.02] p-6 ${className}`}>
      <div className={`mb-4 h-1 w-10 rounded-full ${s.accent}`} />
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          {phase}
        </span>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${s.tone}`}>{s.label}</span>
      </div>
      <p className="mt-3 font-display text-lg font-semibold">{title}</p>
      <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
        {items.map((it) => (
          <li key={it} className="flex items-start gap-2">
            <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-muted-foreground/50" />
            {it}
          </li>
        ))}
      </ul>
    </div>
  );
}
