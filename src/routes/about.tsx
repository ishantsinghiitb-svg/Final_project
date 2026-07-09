import { createFileRoute } from "@tanstack/react-router";
import { Shield, Compass, Heart, Map, Lock, Mail } from "lucide-react";
import { Section } from "@/components/site/Section";
import { ButtonLink } from "@/components/site/PrimaryButton";

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
      <Section
        align="center"
        eyebrow="About"
        title="We're building the calmest way to find your next job."
        description="Job hunting is one of the most stressful things people do. It shouldn't happen across browser tabs, spreadsheets, and document versions. NextOffer is the workspace we always wished existed."
      />

      {/* Mission */}
      <Section className="pt-0" title="Why we exist.">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-6">
            <div className="mb-4 grid h-9 w-9 place-items-center rounded-lg border border-white/10 bg-gradient-to-br from-white/5 to-transparent text-[#93C5FD]">
              <Compass className="h-4 w-4" />
            </div>
            <p className="font-display text-lg font-semibold">Mission</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Give every job seeker a single, calm workspace for their entire search — from the first
              role they notice to the offer they sign. No more lost tabs, forgotten follow-ups, or
              generic resumes sent into the void.
            </p>
          </div>
          <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-6">
            <div className="mb-4 grid h-9 w-9 place-items-center rounded-lg border border-white/10 bg-gradient-to-br from-white/5 to-transparent text-[#A78BFA]">
              <Heart className="h-4 w-4" />
            </div>
            <p className="font-display text-lg font-semibold">Vision</p>
            <p className="mt-2 text-sm text-muted-foreground">
              A world where finding your next role feels less like a second job and more like a focused
              project — with the right tools, the right information, and the right nudge at the right
              moment.
            </p>
          </div>
        </div>
      </Section>

      {/* Philosophy */}
      <Section className="pt-0" title="What we believe.">
        <div className="grid gap-4 md:grid-cols-3">
          {[
            { t: "Craft over volume", d: "One tailored application beats fifty generic ones. Our AI helps you send fewer, better." },
            { t: "Your data is yours", d: "Encrypted at rest, exportable at any time, never sold or shared. You can delete it whenever you want." },
            { t: "Calm is a feature", d: "Job search feels heavy enough. The product should feel light in your hand — focused, fast, and quiet." },
            { t: "Grounded, not generic", d: "Every AI suggestion is tied to the actual job description and your real resume. No templates, no filler." },
            { t: "Signal over vanity", d: "We surface the metrics that predict outcomes — not dashboards designed to look busy." },
            { t: "Honest pricing", d: "Free forever for casual use. Pro when it's serious. Cancel in one click, no retention theater." },
          ].map((v) => (
            <div key={v.t} className="rounded-2xl border border-white/8 bg-white/[0.02] p-5">
              <p className="font-display text-base font-semibold">{v.t}</p>
              <p className="mt-2 text-sm text-muted-foreground">{v.d}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* Privacy & trust */}
      <Section className="pt-0" title="Privacy & trust.">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-6">
            <div className="mb-4 grid h-9 w-9 place-items-center rounded-lg border border-white/10 text-[#22C55E]">
              <Shield className="h-4 w-4" />
            </div>
            <p className="font-display text-base font-semibold">Your resume is never training data</p>
            <p className="mt-2 text-sm text-muted-foreground">
              We use your resume only to perform the actions you ask for — match scoring, tailoring,
              cover letters. We never train models on your data, and we never share it with third
              parties.
            </p>
          </div>
          <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-6">
            <div className="mb-4 grid h-9 w-9 place-items-center rounded-lg border border-white/10 text-[#93C5FD]">
              <Lock className="h-4 w-4" />
            </div>
            <p className="font-display text-base font-semibold">Encrypted, exportable, deletable</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Your data is encrypted at rest with AES-256 and in transit with TLS 1.3, stored in EU/US
              data centers. Export everything at any time, or delete your account and all its data in
              one click.
            </p>
          </div>
        </div>
      </Section>

      {/* Roadmap */}
      <Section className="pt-0" title="What's next.">
        <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-6 md:p-8">
          <div className="space-y-6">
            <RoadmapItem
              phase="Now"
              status="live"
              title="The core workspace"
              items={[
                "Chrome extension for one-click saving",
                "Resume match, ATS score, and AI cover letters",
                "Kanban tracker, interview prep, and analytics",
              ]}
            />
            <RoadmapItem
              phase="Next"
              status="building"
              title="Smarter application tracking"
              items={[
                "Automatic follow-up nudges based on response time",
                "Calendar sync for interviews (Google Calendar)",
                "Recruiter email detection (Gmail integration)",
              ]}
            />
            <RoadmapItem
              phase="Later"
              status="planned"
              title="Beyond the individual search"
              items={[
                "Refer-a-friend and shared job libraries",
                "Salary insights from anonymized offer data",
                "Coach and career-services workspace (Team plan)",
              ]}
            />
          </div>
          <div className="mt-6 flex items-center gap-2 text-xs text-muted-foreground">
            <Map className="h-3.5 w-3.5" />
            This is a living roadmap — we ship continuously and adjust based on what you tell us.
          </div>
        </div>
      </Section>

      {/* CTA */}
      <Section className="pb-32 pt-0">
        <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-[oklch(0.22_0.06_265)] to-[oklch(0.18_0.08_290)] p-10 md:p-14">
          <div className="flex flex-col items-start gap-6 md:flex-row md:items-center md:justify-between">
            <div>
              <h3 className="font-display text-3xl font-semibold md:text-4xl">Come build it with us.</h3>
              <p className="mt-3 max-w-xl text-muted-foreground">
                We're a small, focused team. If you have ideas, found a bug, or want a feature — we
                read every message.
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
    </>
  );
}

function RoadmapItem({
  phase,
  status,
  title,
  items,
}: {
  phase: string;
  status: "live" | "building" | "planned";
  title: string;
  items: string[];
}) {
  const statusMap = {
    live: { label: "Live", tone: "bg-[#22C55E]/15 text-[#22C55E]" },
    building: { label: "In progress", tone: "bg-[#2563EB]/15 text-[#93C5FD]" },
    planned: { label: "Planned", tone: "bg-white/5 text-muted-foreground" },
  } as const;
  const s = statusMap[status];
  return (
    <div className="flex flex-col gap-3 border-b border-white/5 pb-6 last:border-0 last:pb-0 md:flex-row md:items-start">
      <div className="flex w-32 shrink-0 items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{phase}</span>
      </div>
      <div className="flex-1">
        <div className="flex flex-wrap items-center gap-3">
          <p className="font-display text-base font-semibold">{title}</p>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${s.tone}`}>{s.label}</span>
        </div>
        <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
          {items.map((it) => (
            <li key={it} className="flex items-start gap-2">
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-muted-foreground/50" />
              {it}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
