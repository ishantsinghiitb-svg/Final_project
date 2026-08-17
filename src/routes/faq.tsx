import { createFileRoute } from "@tanstack/react-router";
import { useId, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Section } from "@/components/site/Section";
import {
  CONTACT_EMAIL,
  SUPPORTED_PLATFORM_NAMES,
  extensionAccessSentence,
} from "@/content/extension";
import { contactLinkProps } from "@/content/contact";
import { CREDIT_COSTS, FREE_CREDITS } from "@/content/credits";
import { pageSeo } from "@/content/site";

export const Route = createFileRoute("/faq")({
  head: () => ({
    ...pageSeo({
      path: "/faq",
      title: "FAQ: Job Tracker, Resume AI & Extension Questions — OfferLyst",
      description:
        "Answers about the Chrome extension, supported job sites, AI resume matching, application tracking, the Gmail inbox review, privacy, and AI credits.",
      ogDescription: "Everything worth knowing before you sign up.",
    }),
    // FAQPage structured data, built directly from the same `groups` this page
    // renders — a Google rich-result snippet can only ever show what a visitor
    // sees on the page, never invented Q&A content.
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: groups.flatMap((g) =>
            g.faqs.map((f) => ({
              "@type": "Question",
              name: f.q,
              acceptedAnswer: { "@type": "Answer", text: f.a },
            })),
          ),
        }),
      },
    ],
  }),
  component: FAQ,
});

const platformList = `${SUPPORTED_PLATFORM_NAMES.slice(0, -1).join(", ")} and ${SUPPORTED_PLATFORM_NAMES.at(-1)}`;
const costList = CREDIT_COSTS.map((c) => `${c.label} (${c.cost})`).join(", ");

const groups = [
  {
    title: "The basics",
    faqs: [
      {
        q: "What is OfferLyst?",
        a: "A workspace for a job search. You save roles you find, tailor your resume against them with AI, track each application through its stages, prepare for interviews, and see what is actually working. It replaces the spreadsheet and the folder of resume versions.",
      },
      {
        q: "Is OfferLyst a job board?",
        a: "No. OfferLyst does not run a hiring marketplace and employers do not post to us. You bring roles from the sites you already use, either through the Chrome extension or by adding them yourself, and OfferLyst is where the rest of the process lives.",
      },
      {
        q: "What does it cost?",
        a: `Nothing to start. There are no paid plans right now. Every account gets a free allowance of ${FREE_CREDITS} AI credits, and if you need more you can write to us at ${CONTACT_EMAIL}.`,
      },
    ],
  },
  {
    title: "Chrome extension",
    faqs: [
      {
        q: "How does the Chrome extension work?",
        a: "On a supported job page it reads the posting and shows a floating panel with the title, company, location, salary and job type it found. Save for Later puts the job in your library. Apply & Track does that and opens an application in your pipeline at the same time. Neither button navigates you away from the posting.",
      },
      {
        q: "Which websites are supported?",
        a: `${platformList}. Those are the sites the extension has a dedicated parser for. On other hiring pages it tells you tracking is not available there yet rather than saving details it may have read incorrectly.`,
      },
      {
        q: "Do I need the extension?",
        a: "No. It saves you the copying, but you can add roles by hand from the dashboard and use everything else exactly the same way.",
      },
      {
        q: "How do I get the extension?",
        a: extensionAccessSentence(),
      },
      {
        q: "Do I sign in separately in the extension?",
        a: "No. The extension uses the OfferLyst session already in your browser, so you log in once on the website and the extension picks it up. It never asks for your password.",
      },
    ],
  },
  {
    title: "AI features",
    faqs: [
      {
        q: "How does AI resume matching work?",
        a: "You pick one of your resumes and a specific saved job. OfferLyst compares the resume against that posting's actual text and returns a score with a breakdown of where you line up and where you do not, plus an improvement plan. It is scored per job, so the same resume gets different results against different postings.",
      },
      {
        q: "What is the ATS check?",
        a: "A separate check that looks at how well a resume is likely to survive an applicant tracking system for a particular role. It combines deterministic checks on structure and keywords with an AI review, and returns a report of what to fix.",
      },
      {
        q: "Does AI write my cover letters from nothing?",
        a: "No. Cover letters are drafted from your resume and the job posting, and the system is built to prefer what your resume actually says over what would sound impressive. You can edit the draft freely afterwards.",
      },
      {
        q: "How do interview prep and mock interviews work?",
        a: "Prep generates a workspace for one specific interview: what to expect, priority topics, questions to practise and weak areas from your resume. A mock interview is a live practice session that ends with a scored report on your answers.",
      },
    ],
  },
  {
    title: "Tracking and inbox",
    faqs: [
      {
        q: "How are applications tracked?",
        a: "Each application moves through stages from applied to offer, on a board you drag between or a list you sort. Every application keeps its own notes, the resume you used, and any interviews attached to it, so nothing is scattered.",
      },
      {
        q: "How does the Gmail and Calendar integration work?",
        a: "Connecting Google is optional and separate from signing in. Once connected, OfferLyst reviews incoming mail and calendar events for things that look like your job search: interview invitations, assessments, offers and rejections. It then proposes updates for you to review.",
      },
      {
        q: "Will it change my applications without asking?",
        a: "No. Everything Gmail or Calendar finds arrives as a suggestion in your Inbox with the reason it was flagged. Nothing is created or changed until you approve it, and you can edit the details before accepting.",
      },
      {
        q: "Does OfferLyst send email on my behalf?",
        a: "No. It reads to make suggestions. Replying is something you do yourself.",
      },
    ],
  },
  {
    title: "Credits and privacy",
    faqs: [
      {
        q: "How do AI credits work?",
        a: `Every account starts with ${FREE_CREDITS} credits. Each AI action costs a set amount: ${costList}. A mock interview charges once for the whole session, not per question, and interview prep charges once for the whole workspace. Analytics recommendations and the Gmail review never charge.`,
      },
      {
        q: "How can I get more AI credits?",
        a: `Write to ${CONTACT_EMAIL} and tell us what you are working on. There is no checkout to go through, because there are no paid plans at this stage.`,
      },
      {
        q: "What happens when I run out?",
        a: "The AI features tell you the allowance is used up instead of failing oddly. Everything that does not use AI, including saving jobs, tracking applications, notes and analytics, keeps working normally.",
      },
      {
        q: "Are my documents and data private?",
        a: "Your resumes, applications and notes belong to your account and are protected by per-user access rules in the database, so other users cannot read them. Your data is not sold or shared, and it is not used to train models. AI features send only what a given action needs, at the moment you trigger it.",
      },
      {
        q: "Can I delete my data?",
        a: "Yes. You can remove resumes, saved jobs and applications from the dashboard at any time, and disconnecting Google stops any further inbox or calendar review.",
      },
    ],
  },
];

function FAQ() {
  return (
    <Section
      align="center"
      eyebrow="FAQ"
      title="Answers, before you ask."
      description="Still curious? Write to us and a person will reply."
      spacing="last"
      className="pt-24 md:pt-32"
    >
      {/* Section's title renders as an h2 (shared across every marketing page,
          not worth changing for one page) — this page has no other heading,
          so a visually-hidden h1 carries the real page title for SEO/a11y
          without altering the visible design. */}
      <h1 className="sr-only">Frequently asked questions about OfferLyst</h1>
      <div className="mx-auto max-w-3xl space-y-10 text-left">
        {groups.map((g) => (
          <div key={g.title}>
            <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              {g.title}
            </p>
            <div className="divide-y divide-white/5 overflow-hidden rounded-2xl border border-white/8 bg-white/[0.02]">
              {g.faqs.map((f) => (
                <FAQItem key={f.q} q={f.q} a={f.a} />
              ))}
            </div>
          </div>
        ))}
        <p className="text-center text-sm text-muted-foreground">
          Something not covered here?{" "}
          <a
            {...contactLinkProps({ subject: "a question" })}
            className="rounded text-[#93C5FD] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[oklch(0.58_0.21_260)]/60"
          >
            {CONTACT_EMAIL}
          </a>
        </p>
      </div>
    </Section>
  );
}

function FAQItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-4 px-5 py-5 text-left transition-colors hover:bg-white/[0.02] sm:px-6"
        aria-expanded={open}
        aria-controls={panelId}
      >
        <span className="font-medium">{q}</span>
        <ChevronDown
          aria-hidden
          className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>
      <div
        id={panelId}
        role="region"
        hidden={!open}
        className="px-5 pb-5 text-sm leading-relaxed text-muted-foreground sm:px-6"
      >
        {a}
      </div>
    </div>
  );
}
