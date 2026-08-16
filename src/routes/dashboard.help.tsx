import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ChevronDown, ExternalLink, MessageSquarePlus } from "lucide-react";
import { DashCard, PageHeader, SectionTitle, StickyPageHeader } from "@/components/dashboard/primitives";
import { DashButton } from "@/components/dashboard/DashButton";
import { FeedbackDialog } from "@/components/dashboard/FeedbackDialog";
import { contactLinkProps } from "@/content/contact";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/dashboard/help")({
  head: () => ({
    meta: [{ title: "Help Center — OfferLyst" }, { name: "robots", content: "noindex" }],
  }),
  component: HelpPage,
});

// ── Help Center (Module 13 · Phase 3) ──
//
// A static, in-app reference — no CMS, no separate docs site. Content lives
// here as plain data so it is trivial to keep in sync with the product as it
// changes; if this ever needs to grow past "one page of topics", that is a
// sign to revisit the approach, not a reason to build more here now.

type Topic = {
  title: string;
  items: { q: string; a: string }[];
};

const TOPICS: Topic[] = [
  {
    title: "Getting started",
    items: [
      {
        q: "What does OfferLyst actually do?",
        a: "It's one place to track job applications, save roles you're considering, and get AI help with your resume, match score, cover letters and interview prep — instead of spreadsheets and browser tabs.",
      },
      {
        q: "Where do I begin?",
        a: "Start on Overview to see your pipeline at a glance, or head to Jobs to browse and save roles. Adding your resume under Resumes unlocks the AI features.",
      },
    ],
  },
  {
    title: "Jobs",
    items: [
      {
        q: "Where do job listings come from?",
        a: "From company career pages and job boards OfferLyst crawls directly — not user-submitted postings. Coverage is India-first and growing.",
      },
      {
        q: "What's the difference between Saved and Collections?",
        a: "Saved is a single flat list of jobs you want to revisit. Collections let you group saved jobs into named lists (e.g. \"Backend roles\", \"Bangalore only\").",
      },
    ],
  },
  {
    title: "Applications",
    items: [
      {
        q: "How do I add an application?",
        a: "Click \"Apply Now\" on a job to track it automatically, or use \"Add Application\" on the Applications page to log one you applied to elsewhere.",
      },
      {
        q: "Can I export my applications?",
        a: "Yes — the Applications page has an \"Export CSV\" button that downloads everything currently shown, including any filters you've applied.",
      },
      {
        q: "What happens when I archive an application?",
        a: "It's hidden from the active board but not deleted — open \"Archived\" from the Applications page to see or restore it.",
      },
    ],
  },
  {
    title: "Resume & AI",
    items: [
      {
        q: "What do AI credits cost, and what's free?",
        a: "Every account starts with a free allowance. Saving jobs, tracking applications, notes and analytics never use credits — only AI actions (match analysis, ATS score, optimizer, cover letters, interview prep) do. See Settings → Credits for exact costs and your balance.",
      },
      {
        q: "What can the AI actually do with my resume?",
        a: "Score it against a specific job, suggest concrete edits (Resume Optimizer), check ATS compatibility, and draft a tailored cover letter — all grounded in the resume and job you provide, not generic advice.",
      },
      {
        q: "I'm out of credits. What now?",
        a: "There are no paid plans yet — use the \"Contact us\" link in Settings → Credits and tell us what you're working on. We top up allowances directly.",
      },
    ],
  },
  {
    title: "Chrome extension",
    items: [
      {
        q: "What does the extension do?",
        a: "It lets you save a job or check your match score directly from a job posting page, without switching tabs. It signs in with the session already in this browser.",
      },
      {
        q: "Where do I get it?",
        a: "See Settings → Integrations, or the \"How it works\" link there, for install and setup details.",
      },
    ],
  },
  {
    title: "Account & settings",
    items: [
      {
        q: "How do I update my profile?",
        a: "Settings → Profile covers your name, location, target role and avatar. Changes save immediately.",
      },
      {
        q: "How do I change my password?",
        a: "Use \"Forgot password\" on the login page to receive a reset link by email.",
      },
      {
        q: "Is there a way to see what notifications I get?",
        a: "Settings → Notifications explains what's live today (the bell icon's calendar-based alerts). There isn't a scheduled email digest yet.",
      },
    ],
  },
  {
    title: "Common problems",
    items: [
      {
        q: "A job or application looks out of date.",
        a: "Job listings refresh on a crawl schedule, not instantly — a role can close on the company site slightly before it's removed here. Applications you track yourself are always current since you control them directly.",
      },
      {
        q: "An AI action failed or timed out.",
        a: "It's automatically refunded — a failed AI action never costs a credit. Check Settings → Credits to confirm your balance, then try again.",
      },
      {
        q: "The extension isn't detecting a job on a page I'm viewing.",
        a: "It only works on supported job boards and career-page layouts. If a site looks supported but isn't picked up, tell us with the feedback button below and include the URL.",
      },
    ],
  },
];

function TopicCard({ topic }: { topic: Topic }) {
  return (
    <DashCard>
      <SectionTitle>{topic.title}</SectionTitle>
      <div className="mt-3 divide-y divide-black/5">
        {topic.items.map((item) => (
          <FaqRow key={item.q} q={item.q} a={item.a} />
        ))}
      </div>
    </DashCard>
  );
}

function FaqRow({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="py-2.5">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3 text-left"
        aria-expanded={open}
      >
        <span className="text-sm font-medium text-[oklch(0.25_0.02_265)]">{q}</span>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-[oklch(0.5_0.02_265)] transition-transform",
            open && "rotate-180",
          )}
        />
      </button>
      {open && <p className="mt-2 text-sm text-[oklch(0.45_0.02_265)]">{a}</p>}
    </div>
  );
}

function HelpPage() {
  const [feedbackOpen, setFeedbackOpen] = useState(false);

  return (
    <>
      <StickyPageHeader>
        <PageHeader
          eyebrow="Help Center"
          title="Everything you need to use OfferLyst well."
          subtitle="Answers to common questions, grouped by area. Can't find what you need? Send us a note."
        />
      </StickyPageHeader>

      <div className="grid gap-3 md:grid-cols-2">
        {TOPICS.map((topic) => (
          <TopicCard key={topic.title} topic={topic} />
        ))}
      </div>

      <DashCard>
        <SectionTitle>Contact & support</SectionTitle>
        <p className="mt-2 text-sm text-[oklch(0.45_0.02_265)]">
          Found a bug, have an idea, or just stuck on something? Both routes reach the same team.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <DashButton size="sm" onClick={() => setFeedbackOpen(true)}>
            <MessageSquarePlus className="h-4 w-4" /> Send feedback
          </DashButton>
          <a
            {...contactLinkProps({ subject: "Question from the Help Center" })}
            className="inline-flex items-center gap-1.5 rounded-lg border border-black/5 bg-white px-3 py-1.5 text-sm font-medium text-[oklch(0.4_0.02_265)] hover:bg-black/[0.03]"
          >
            Email us <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      </DashCard>

      <FeedbackDialog open={feedbackOpen} onClose={() => setFeedbackOpen(false)} />
    </>
  );
}
