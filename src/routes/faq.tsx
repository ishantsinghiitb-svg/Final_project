import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Section } from "@/components/site/Section";

export const Route = createFileRoute("/faq")({
  head: () => ({
    meta: [
      { title: "FAQ — NextOffer" },
      {
        name: "description",
        content:
          "Answers about resume matching, ATS scoring, AI usage, privacy, the Chrome extension, billing, and student plans.",
      },
      { property: "og:title", content: "FAQ — NextOffer" },
      { property: "og:description", content: "Everything you might want to know before signing up." },
    ],
  }),
  component: FAQ,
});

const groups = [
  {
    title: "Product & features",
    faqs: [
      {
        q: "Is NextOffer a job board?",
        a: "No. NextOffer works with the platforms you already use — LinkedIn, Wellfound, Greenhouse, Lever, Ashby, Naukri, and any company career page. We help you save, tailor, and track the roles you find there.",
      },
      {
        q: "How does resume match work?",
        a: "When you save a job, NextOffer compares your resume against the actual job description across four dimensions: skills coverage, experience level, keyword density, and tone. You get an overall score plus a breakdown, so you know exactly where you're strong and what to improve.",
      },
      {
        q: "What is the ATS score?",
        a: "The ATS score checks how well your resume will parse through modern applicant tracking systems (the software most companies use to filter applications). It looks at formatting, keyword density, and section completeness, then suggests fixes ranked by impact.",
      },
      {
        q: "Do I need the Chrome extension?",
        a: "It's optional but recommended. Without it you can add jobs manually. With it, you save any job in one click and NextOffer extracts the title, company, salary, and requirements automatically.",
      },
      {
        q: "Which job sites does the extension support?",
        a: "LinkedIn, Wellfound, Greenhouse, Lever, Ashby, Naukri, and most company career pages. We're adding more continuously — if a site doesn't extract cleanly, you can edit the saved job before it lands in your library.",
      },
    ],
  },
  {
    title: "AI & your data",
    faqs: [
      {
        q: "How is my resume used by AI?",
        a: "Only for the specific action you trigger — a match score, a tailoring suggestion, a cover letter. We never train models on your resume or applications, and we never share your data with third parties.",
      },
      {
        q: "Where is my data stored?",
        a: "In EU/US data centers, encrypted at rest with AES-256 and in transit with TLS 1.3. You can export everything at any time, or delete your account and all its data in one click.",
      },
      {
        q: "Do you sell or share my applications?",
        a: "No. Ever. Your job search is yours. We don't sell data to recruiters, employers, or data brokers.",
      },
      {
        q: "Can I delete my data?",
        a: "Yes, at any time, from Settings. Deleting your account removes your resumes, saved jobs, applications, and notes permanently. There's no retention period and no backup that lingers.",
      },
    ],
  },
  {
    title: "Billing & plans",
    faqs: [
      {
        q: "Is there a free plan?",
        a: "Yes — Starter is free forever and includes the Chrome extension, up to 25 saved jobs, one resume, 10 AI actions per month, and the kanban tracker. No credit card required.",
      },
      {
        q: "Can I cancel any time?",
        a: "Yes, in one click from your dashboard. No support email, no phone call, no retention flow. You keep access until the end of your billing period.",
      },
      {
        q: "Do you offer student pricing?",
        a: "Yes — 50% off Pro for verified .edu (or equivalent) addresses. After signing up, reach out from your school email and we'll apply the discount. That's $6/mo billed annually.",
      },
      {
        q: "What happens to my data if I downgrade from Pro?",
        a: "Nothing is deleted. Your data stays, and you can export it whenever. If you exceed Starter's limits after downgrading, some saved jobs become read-only until you're back under the limit.",
      },
    ],
  },
  {
    title: "Integrations & support",
    faqs: [
      {
        q: "Which integrations are available?",
        a: "Today: the Chrome extension and LinkedIn job importing. In progress: Google Calendar sync for interviews and Gmail recruiter-email detection. Planned: Slack nudges and Notion export.",
      },
      {
        q: "How do I get support?",
        a: "Email hello@nextoffer.io. A real person replies within one business day. Pro and Team plan members get priority handling.",
      },
      {
        q: "What's on the roadmap?",
        a: "Smarter follow-up nudges, calendar sync, recruiter email detection, shared job libraries, and a coach workspace. We ship continuously and adjust based on feedback — see our About page for the full picture.",
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
      description="Still curious? Reach out — a real human replies within a day."
      className="pb-32"
    >
      <div className="mx-auto max-w-3xl space-y-10 text-left">
        {groups.map((g) => (
          <div key={g.title}>
            <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              {g.title}
            </p>
            <div className="divide-y divide-white/5 rounded-2xl border border-white/8 bg-white/[0.02]">
              {g.faqs.map((f) => (
                <FAQItem key={f.q} q={f.q} a={f.a} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}

function FAQItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <button
      type="button"
      onClick={() => setOpen((o) => !o)}
      className="w-full px-6 py-5 text-left"
      aria-expanded={open}
    >
      <div className="flex items-center justify-between gap-4">
        <p className="font-medium">{q}</p>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 ${
            open ? "rotate-180" : ""
          }`}
        />
      </div>
      <div
        className={`grid overflow-hidden text-sm text-muted-foreground transition-all duration-300 ${
          open ? "mt-3 grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        }`}
      >
        <div className="min-h-0">{a}</div>
      </div>
    </button>
  );
}
