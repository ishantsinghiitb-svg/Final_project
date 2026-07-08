import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Section } from "@/components/site/Section";

export const Route = createFileRoute("/faq")({
  head: () => ({
    meta: [
      { title: "FAQ — NextOffer" },
      { name: "description", content: "Answers to common questions about NextOffer, the AI job search copilot." },
      { property: "og:title", content: "FAQ — NextOffer" },
      { property: "og:description", content: "Everything you might want to know about NextOffer before signing up." },
    ],
  }),
  component: FAQ,
});

const groups = [
  {
    title: "Product",
    faqs: [
      { q: "Is NextOffer a job board?", a: "No. NextOffer works with the platforms you already use — LinkedIn, Wellfound, Greenhouse, Lever, Naukri and any career page. We help you save, tailor and track." },
      { q: "Do I need the Chrome extension?", a: "It's optional but recommended. It lets you save any job in one click with all data extracted automatically." },
      { q: "Can I store multiple resumes?", a: "Yes. Pro supports unlimited resumes with versioning and per-role assignment." },
    ],
  },
  {
    title: "AI & Privacy",
    faqs: [
      { q: "How is my resume used by AI?", a: "Only for the specific action you trigger. We never train models on your data, and you can delete it at any time." },
      { q: "Where is my data stored?", a: "In our EU/US data centers, encrypted at rest with AES-256 and in transit with TLS 1.3." },
      { q: "Do you sell or share my applications?", a: "No. Ever." },
    ],
  },
  {
    title: "Billing",
    faqs: [
      { q: "Can I cancel any time?", a: "Yes, in one click from your dashboard. No support email required." },
      { q: "Do you offer student pricing?", a: "50% off Pro for verified .edu addresses." },
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
          className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
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