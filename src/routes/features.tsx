import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Bookmark,
  Bot,
  BrainCircuit,
  CalendarClock,
  ChartLine as LineChart,
  Chromium as Chrome,
  FileText,
  Gauge,
  Inbox,
  Kanban,
  MessagesSquare,
} from "lucide-react";
import { PageHero, Section } from "@/components/site/Section";
import { ButtonLink } from "@/components/site/PrimaryButton";
import { CONTACT_EMAIL, SUPPORTED_PLATFORM_NAMES } from "@/content/extension";
import { contactLinkProps } from "@/content/contact";
import { FREE_CREDITS } from "@/content/credits";
import { pageSeo } from "@/content/site";

export const Route = createFileRoute("/features")({
  head: () => ({
    ...pageSeo({
      path: "/features",
      title: "Job Tracker Features: Resume AI, Kanban & Extension — OfferLyst",
      description:
        "Everything OfferLyst does: save jobs from supported sites, tailor your resume with AI, track applications, prepare for interviews, review your inbox, and see what is working.",
      ogDescription: "One workspace for the whole job search, not another job board.",
    }),
  }),
  component: FeaturesPage,
});

/**
 * Copy here describes shipped behaviour only. Supported sites come from
 * `src/content/extension.ts`, credit costs from `src/content/credits.ts`, and
 * the pipeline stages match `features/applications/constants`. The previous
 * version of this page advertised Greenhouse/Lever/Ashby extension support, an
 * "Interested" pipeline stage and follow-up nudges, none of which exist.
 */

type Feature = {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  body: string;
  meta?: string;
};

const groups: { eyebrow: string; title: string; description: string; features: Feature[] }[] = [
  {
    eyebrow: "Collect",
    title: "Get every role into one place.",
    description:
      "The search starts scattered across job boards and browser tabs. This is the part that ends that.",
    features: [
      {
        icon: Chrome,
        title: "Chrome extension",
        body: `On a job page from ${SUPPORTED_PLATFORM_NAMES.length} supported sites, OfferLyst reads the posting and saves it with one click, without navigating you away.`,
        meta: SUPPORTED_PLATFORM_NAMES.join(" · "),
      },
      {
        icon: Bookmark,
        title: "Saved jobs and collections",
        body: "Everything you save lands in one library you can search, filter and group into collections for different kinds of role.",
      },
      {
        icon: FileText,
        title: "Resume library",
        body: "Keep several versions, mark a default, and pick which one a given application went out with.",
      },
    ],
  },
  {
    eyebrow: "Tailor",
    title: "Send something built for the role.",
    description:
      "Every AI feature works against a specific job posting and your actual resume, so the output is about that application rather than generic advice.",
    features: [
      {
        icon: BrainCircuit,
        title: "Resume match",
        body: "Scores one resume against one job, shows where you line up and where you fall short, and gives you an ordered plan of what to change.",
        meta: "1 credit",
      },
      {
        icon: Gauge,
        title: "ATS compatibility",
        body: "Combines deterministic structure and keyword checks with an AI review, then reports what to fix before you submit.",
        meta: "1 credit",
      },
      {
        icon: Bot,
        title: "Optimization studio",
        body: "Works through your resume by category, proposing concrete rewrites you accept or reject line by line. Exports to PDF or DOCX.",
        meta: "1 credit",
      },
      {
        icon: MessagesSquare,
        title: "Cover letters",
        body: "Drafts from your resume and the posting, built to stay truthful to what your resume says. You edit freely afterwards.",
        meta: "1 credit",
      },
    ],
  },
  {
    eyebrow: "Track",
    title: "Keep the thread on every application.",
    description:
      "Applications move through applied, online assessment, interview and offer, on a board or a list, whichever you prefer.",
    features: [
      {
        icon: Kanban,
        title: "Application pipeline",
        body: "Drag between stages on the board or work from a sortable list. Each application keeps its own notes, the resume you used, and its interviews.",
      },
      {
        icon: Inbox,
        title: "Gmail and Calendar review",
        body: "Connect Google and OfferLyst flags interview invitations, assessments, offers and rejections, then proposes updates. Nothing is written until you approve it.",
        meta: "Free",
      },
      {
        icon: LineChart,
        title: "Analytics",
        body: "Where applications stall, how each resume performs, and progress against goals you set. Recommendations are generated from your own data.",
        meta: "Free",
      },
    ],
  },
  {
    eyebrow: "Prepare",
    title: "Walk into the interview ready.",
    description: "Preparation is tied to a specific interview, not a generic question bank.",
    features: [
      {
        icon: CalendarClock,
        title: "Interview prep",
        body: "Builds a workspace for one interview: what to expect, priority topics, questions to practise, weak spots in your resume, and a checklist.",
        meta: "3 credits",
      },
      {
        icon: MessagesSquare,
        title: "Mock interview",
        body: "A live practice session with follow-up questions, by voice or typing, ending in a scored report on your answers. One charge covers the whole session.",
        meta: "5 credits",
      },
    ],
  },
];

function FeaturesPage() {
  return (
    <>
      <PageHero>
        <div className="mx-auto max-w-3xl text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs font-medium text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-[oklch(0.58_0.21_260)]" />
            Features
          </span>
          <h1 className="mt-5 font-display text-fluid-hero font-semibold tracking-tight">
            Not a job board. A workspace.
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-fluid-lead text-muted-foreground">
            OfferLyst does not list jobs for you. It takes the roles you find, and handles
            everything after that: tailoring, applying, tracking, preparing and reviewing what
            worked.
          </p>
        </div>
      </PageHero>

      {groups.map((g) => (
        <Section key={g.eyebrow} eyebrow={g.eyebrow} title={g.title} description={g.description}>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {g.features.map((f) => (
              <div
                key={f.title}
                className="card-hover flex flex-col rounded-2xl border border-white/8 bg-white/[0.02] p-6"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-white/10 bg-gradient-to-br from-white/5 to-transparent text-[#93C5FD]">
                    <f.icon className="h-5 w-5" />
                  </span>
                  {f.meta && (
                    <span className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                      {f.meta}
                    </span>
                  )}
                </div>
                <h3 className="mt-4 font-display text-lg font-semibold leading-snug">{f.title}</h3>
                <p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">
                  {f.body}
                </p>
              </div>
            ))}
          </div>
        </Section>
      ))}

      <Section spacing="last">
        <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-[oklch(0.22_0.06_265)] to-[oklch(0.18_0.08_290)] p-8 md:p-12">
          <div className="pointer-events-none absolute -right-20 -top-20 h-80 w-80 rounded-full bg-[#2563EB]/25 blur-[100px]" />
          <div className="relative max-w-2xl">
            <h2 className="font-display text-fluid-h2 font-semibold tracking-tight">
              Free to start
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground md:text-base">
              There are no paid plans. Every account gets {FREE_CREDITS} AI credits to begin with,
              and everything that does not use AI stays free regardless. Need more credits? Write to{" "}
              <a
                {...contactLinkProps({ subject: "more AI credits" })}
                className="rounded text-[#93C5FD] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[oklch(0.58_0.21_260)]/60"
              >
                {CONTACT_EMAIL}
              </a>
              .
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <ButtonLink to="/signup" size="lg">
                Get Started Free <ArrowRight className="h-4 w-4" />
              </ButtonLink>
              <ButtonLink to="/extension" size="lg" variant="outline">
                How the extension works
              </ButtonLink>
            </div>
            <p className="mt-4 text-xs text-muted-foreground">
              Prefer to look around first?{" "}
              <Link to="/dashboard" className="underline underline-offset-4 hover:text-foreground">
                See the workspace
              </Link>
              .
            </p>
          </div>
        </div>
      </Section>
    </>
  );
}
