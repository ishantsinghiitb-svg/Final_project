import { createFileRoute } from "@tanstack/react-router";
import { Clock, Layers, Mail, PencilLine, StickyNote } from "lucide-react";
import { PageHero, Section } from "@/components/site/Section";
import { ButtonLink } from "@/components/site/PrimaryButton";
import { Reveal } from "@/components/site/Reveal";
import { CONTACT_EMAIL, isExtensionLive } from "@/content/extension";
import { contactLinkProps } from "@/content/contact";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "About — OfferLyst" },
      {
        name: "description",
        content: "What OfferLyst is, the problem it solves, and how it is built.",
      },
      { property: "og:title", content: "About — OfferLyst" },
      {
        property: "og:description",
        content: "An early-access workspace for the job search, and the thinking behind it.",
      },
    ],
  }),
  component: About,
});

/**
 * Kept deliberately short and claim-free. The previous version advertised a Pro
 * tier, AES-256/TLS-1.3 in named data centres, a Team plan, salary insights
 * from pooled offer data, and listed Gmail/Calendar as "in progress" when both
 * had already shipped. None of that was accurate, and the page has no need to
 * invent a company history to be useful.
 */

const problems = [
  {
    icon: Layers,
    t: "The search lives in browser tabs",
    d: "Roles come from several sites at once, and by the weekend it is hard to remember which ones were worth returning to.",
  },
  {
    icon: PencilLine,
    t: "One resume goes out for everything",
    d: "Tailoring properly takes time, so most applications go out generic and get filtered out.",
  },
  {
    icon: Clock,
    t: "Replies get lost",
    d: "An interview invitation sits unread in a busy inbox, and the follow-up never happens.",
  },
  {
    icon: StickyNote,
    t: "Preparation is scattered",
    d: "Notes for one interview end up split across documents, chats and memory.",
  },
];

const principles = [
  {
    t: "Grounded, not generic",
    d: "Every AI feature works from your actual resume and one actual job posting. Cover letters are built to stay truthful to what your resume says rather than what would sound impressive.",
  },
  {
    t: "Nothing changes without you",
    d: "When OfferLyst reads your inbox or calendar it proposes changes and shows its reasoning. Applications and interviews are only created or updated once you approve.",
  },
  {
    t: "Your data is yours",
    d: "Resumes, applications and notes are scoped to your account. They are not sold, not shared, and not used to train models.",
  },
  {
    t: "Honest about what exists",
    d: "The site describes what has shipped. If a job site is not supported by the extension, it says so instead of implying otherwise.",
  },
];

function About() {
  return (
    <>
      <PageHero>
        <div className="mx-auto max-w-3xl text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs font-medium text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-[oklch(0.58_0.21_260)]" />
            About
          </span>
          <h1 className="mt-5 font-display text-fluid-hero font-semibold tracking-tight">
            A calmer way to run a job search
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-fluid-lead text-muted-foreground">
            OfferLyst is a workspace for everything that happens after you find a role: tailoring
            your resume, applying, keeping track, and preparing for the interview. It is early
            access and built by a small team.
          </p>
        </div>
      </PageHero>

      <Reveal>
        <Section eyebrow="The problem" title="Why it exists.">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {problems.map((v) => (
              <div key={v.t} className="rounded-2xl border border-white/8 bg-white/[0.02] p-5">
                <div className="mb-4 grid h-9 w-9 place-items-center rounded-lg border border-white/10 bg-gradient-to-br from-white/5 to-transparent text-[#93C5FD]">
                  <v.icon className="h-4 w-4" />
                </div>
                <p className="font-display text-base font-semibold leading-snug">{v.t}</p>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{v.d}</p>
              </div>
            ))}
          </div>
          <p className="mt-6 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            None of those are hard problems on their own. Together they make a job search feel like
            a second job, and the usual answer is a spreadsheet that stops being accurate after two
            weeks. OfferLyst replaces the spreadsheet with something that actually knows what is in
            your resume and what each posting is asking for.
          </p>
        </Section>
      </Reveal>

      <Reveal>
        <Section eyebrow="How it is built" title="What we hold to.">
          <div className="grid gap-4 md:grid-cols-2">
            {principles.map((v) => (
              <div key={v.t} className="rounded-2xl border border-white/8 bg-white/[0.02] p-6">
                <p className="font-display text-base font-semibold">{v.t}</p>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{v.d}</p>
              </div>
            ))}
          </div>
        </Section>
      </Reveal>

      <Reveal>
        <Section eyebrow="Where it is" title="Early access, and honest about it.">
          {/* Two prose columns rather than one narrow column with an empty half
              beside it — the section reads as an intentional composition at
              every width instead of a two-column layout missing its second
              column. */}
          <div className="grid gap-6 text-sm leading-relaxed text-muted-foreground md:text-base lg:grid-cols-2 lg:gap-10">
            <p>
              OfferLyst is usable today and being worked on continuously. The workspace, the AI
              features, the Chrome extension, and the Gmail and Calendar review have all shipped.
              {isExtensionLive()
                ? " The extension is on the Chrome Web Store."
                : " The extension is not on the Chrome Web Store yet, so access is by request."}
            </p>
            <p>
              There are no paid plans. Every account gets a free allowance of AI credits, and if you
              need more the answer is to ask rather than to buy something. That will change at some
              point, and when it does we would rather set pricing against real usage than guess at
              it now.
            </p>
          </div>
        </Section>
      </Reveal>

      <Reveal>
        <Section spacing="last">
          <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-[oklch(0.22_0.06_265)] to-[oklch(0.18_0.08_290)] p-8 md:p-12">
            <div className="flex flex-col items-start gap-6 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="font-display text-fluid-h2 font-semibold">
                  Tell us what is missing.
                </h2>
                <p className="mt-3 max-w-xl text-sm text-muted-foreground md:text-base">
                  Bugs, a job site you want supported, or something that got in your way. Mail goes
                  straight to the people building it.
                </p>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row">
                <a
                  {...contactLinkProps({ subject: "hello" })}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-[oklch(0.62_0.21_260)] to-[oklch(0.55_0.24_290)] px-5 py-3 text-[15px] font-medium text-white shadow-[inset_0_1px_0_0_rgba(255,255,255,0.2),0_10px_30px_-10px_oklch(0.58_0.21_260/0.8)] transition-transform hover:-translate-y-px"
                >
                  <Mail className="h-4 w-4" /> Talk to us
                </a>
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
