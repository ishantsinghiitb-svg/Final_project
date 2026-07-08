import { createFileRoute } from "@tanstack/react-router";
import { Check, ArrowRight } from "lucide-react";
import { Section } from "@/components/site/Section";
import { ButtonLink } from "@/components/site/PrimaryButton";
import { useState } from "react";

export const Route = createFileRoute("/pricing")({
  head: () => ({
    meta: [
      { title: "Pricing — NextOffer" },
      { name: "description", content: "Simple pricing for serious job seekers. Free forever, or upgrade for unlimited AI." },
      { property: "og:title", content: "Pricing — NextOffer" },
      { property: "og:description", content: "Free forever, Pro for unlimited AI. No hidden fees." },
    ],
  }),
  component: Pricing,
});

function Pricing() {
  const [annual, setAnnual] = useState(true);
  const plans = [
    {
      name: "Starter",
      desc: "For casual job hunters getting started.",
      price: 0,
      cta: "Start free",
      to: "/signup",
      features: ["Chrome extension", "Up to 25 saved jobs", "1 resume", "10 AI actions / mo", "Kanban tracker"],
    },
    {
      name: "Pro",
      desc: "For active job searches, funded moves.",
      highlight: true,
      price: annual ? 12 : 15,
      cta: "Go Pro",
      to: "/signup",
      features: ["Unlimited saved jobs", "Unlimited resumes", "Unlimited AI actions", "ATS + Skill gap", "Cover letters", "Interview tracker", "Analytics"],
    },
    {
      name: "Team",
      desc: "For coaches and career services.",
      price: annual ? 29 : 39,
      cta: "Contact sales",
      to: "/contact",
      features: ["Everything in Pro", "Up to 10 seats", "Shared job libraries", "Coach analytics", "Priority support"],
    },
  ];

  return (
    <>
      <Section
        align="center"
        eyebrow="Pricing"
        title="Simple, honest pricing."
        description="Free forever for casual users. Upgrade when the search gets serious."
      >
        <div className="mb-10 flex items-center justify-center gap-3 text-sm">
          <span className={annual ? "text-muted-foreground" : "text-foreground"}>Monthly</span>
          <button
            aria-label="Toggle billing"
            onClick={() => setAnnual((a) => !a)}
            className="relative h-6 w-11 rounded-full border border-white/10 bg-white/5"
          >
            <span
              className={`absolute top-0.5 h-4 w-4 rounded-full bg-gradient-to-br from-[#2563EB] to-[#7C3AED] transition-transform ${
                annual ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
          <span className={!annual ? "text-muted-foreground" : "text-foreground"}>
            Annual <span className="ml-1 rounded bg-[#22C55E]/15 px-1.5 py-0.5 text-[10px] text-[#22C55E]">Save 20%</span>
          </span>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {plans.map((p) => (
            <div
              key={p.name}
              className={`relative rounded-2xl border p-6 ${
                p.highlight
                  ? "border-transparent bg-gradient-to-br from-[oklch(0.22_0.06_265)] to-[oklch(0.18_0.08_290)] shadow-[0_30px_80px_-30px_oklch(0.58_0.21_260/0.6)]"
                  : "border-white/8 bg-white/[0.02]"
              }`}
            >
              {p.highlight && (
                <span className="absolute -top-2.5 right-6 rounded-full bg-gradient-to-r from-[#2563EB] to-[#7C3AED] px-2 py-0.5 text-[10px] font-semibold text-white">
                  MOST POPULAR
                </span>
              )}
              <p className="font-display text-lg font-semibold">{p.name}</p>
              <p className="mt-1 text-sm text-muted-foreground">{p.desc}</p>
              <div className="mt-6 flex items-end gap-1">
                <span className="font-display text-4xl font-semibold">${p.price}</span>
                <span className="pb-1 text-sm text-muted-foreground">/ mo</span>
              </div>
              <ButtonLink to={p.to} className="mt-6 w-full" variant={p.highlight ? "primary" : "outline"}>
                {p.cta} <ArrowRight className="h-4 w-4" />
              </ButtonLink>
              <ul className="mt-6 space-y-2.5 text-sm">
                {p.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-muted-foreground">
                    <span className="mt-0.5 grid h-4 w-4 place-items-center rounded-full bg-[#22C55E]/15 text-[#22C55E]">
                      <Check className="h-3 w-3" />
                    </span>
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Section>

      <Section className="pb-32" align="center" title="Frequently asked pricing questions">
        <div className="mx-auto max-w-3xl divide-y divide-white/5 rounded-2xl border border-white/8 bg-white/[0.02]">
          {[
            { q: "Is there a free plan?", a: "Yes — Starter is free forever and includes the Chrome extension." },
            { q: "Can I cancel any time?", a: "Absolutely. Cancel from your dashboard, no email or call required." },
            { q: "Do you offer student discounts?", a: "We do. Reach out from your .edu address for 50% off Pro." },
          ].map((f) => (
            <div key={f.q} className="p-6 text-left">
              <p className="font-semibold">{f.q}</p>
              <p className="mt-1 text-sm text-muted-foreground">{f.a}</p>
            </div>
          ))}
        </div>
      </Section>
    </>
  );
}