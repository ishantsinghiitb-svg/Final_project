import { createFileRoute } from "@tanstack/react-router";
import { Check, ArrowRight, Minus, GraduationCap } from "lucide-react";
import { Section } from "@/components/site/Section";
import { ButtonLink } from "@/components/site/PrimaryButton";
import { useState } from "react";

export const Route = createFileRoute("/pricing")({
  head: () => ({
    meta: [
      { title: "Pricing — NextOffer" },
      {
        name: "description",
        content:
          "Free forever for casual job seekers. Pro for active searches — unlimited AI, cover letters, and analytics. 50% off for students.",
      },
      { property: "og:title", content: "Pricing — NextOffer" },
      { property: "og:description", content: "Free forever, Pro for unlimited AI, 50% off for students. No hidden fees." },
    ],
  }),
  component: Pricing,
});

const plans = [
  {
    name: "Starter",
    desc: "For getting started and casual browsing.",
    price: 0,
    annual: 0,
    cta: "Start free",
    to: "/signup",
    features: ["Chrome extension", "Up to 25 saved jobs", "1 resume", "10 AI actions / month", "Kanban tracker"],
  },
  {
    name: "Pro",
    desc: "For an active, serious job search.",
    highlight: true,
    price: 15,
    annual: 12,
    cta: "Go Pro",
    to: "/signup",
    features: [
      "Unlimited saved jobs",
      "Unlimited resumes",
      "Unlimited AI actions",
      "ATS score + skill gap",
      "AI cover letters",
      "Interview tracker + prep",
      "Analytics",
    ],
  },
  {
    name: "Team",
    desc: "For coaches and career services.",
    price: 39,
    annual: 29,
    cta: "Contact sales",
    to: "/contact",
    features: ["Everything in Pro", "Up to 10 seats", "Shared job libraries", "Coach analytics", "Priority support"],
  },
];

const comparison: { group: string; rows: { label: string; starter: string | boolean; pro: string | boolean; team: string | boolean }[] }[] = [
  {
    group: "Saving & discovering",
    rows: [
      { label: "Chrome extension", starter: true, pro: true, team: true },
      { label: "Saved jobs", starter: "25", pro: "Unlimited", team: "Unlimited" },
      { label: "Automatic job data extraction", starter: true, pro: true, team: true },
      { label: "Job library + filters", starter: true, pro: true, team: true },
    ],
  },
  {
    group: "Resumes & AI",
    rows: [
      { label: "Resumes", starter: "1", pro: "Unlimited", team: "Unlimited" },
      { label: "AI actions / month", starter: "10", pro: "Unlimited", team: "Unlimited" },
      { label: "Resume match score", starter: true, pro: true, team: true },
      { label: "ATS score", starter: false, pro: true, team: true },
      { label: "Skill gap analysis", starter: false, pro: true, team: true },
      { label: "AI cover letters", starter: false, pro: true, team: true },
    ],
  },
  {
    group: "Tracking & analytics",
    rows: [
      { label: "Kanban tracker", starter: true, pro: true, team: true },
      { label: "Interview tracker + AI prep", starter: false, pro: true, team: true },
      { label: "Personal notes", starter: true, pro: true, team: true },
      { label: "Analytics dashboard", starter: false, pro: true, team: true },
    ],
  },
  {
    group: "Team",
    rows: [
      { label: "Seats", starter: "1", pro: "1", team: "Up to 10" },
      { label: "Shared job libraries", starter: false, pro: false, team: true },
      { label: "Coach analytics", starter: false, pro: false, team: true },
      { label: "Priority support", starter: false, pro: false, team: true },
    ],
  },
];

function Pricing() {
  const [annual, setAnnual] = useState(true);

  return (
    <>
      <Section
        align="center"
        eyebrow="Pricing"
        title="Simple, honest pricing."
        description="Free forever for casual browsing. Upgrade when the search gets serious. Cancel any time, no email required."
      >
        <div className="mb-10 flex items-center justify-center">
          <div
            role="radiogroup"
            aria-label="Billing period"
            className="relative flex items-center rounded-full border border-white/10 bg-white/[0.03] p-1"
          >
            <div
              className={`absolute top-1 bottom-1 rounded-full bg-gradient-to-br from-[#2563EB] to-[#7C3AED] shadow-[0_4px_16px_-4px_rgba(37,99,235,0.6)] transition-transform duration-300 ease-out ${
                annual ? "translate-x-[calc(100%-0.5px)]" : "translate-x-0"
              }`}
              style={{ width: "calc(50% - 4px)" }}
            />
            <button
              role="radio"
              aria-checked={!annual}
              onClick={() => setAnnual(false)}
              className={`relative z-10 rounded-full px-5 py-1.5 text-sm font-medium transition-colors ${
                !annual ? "text-white" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Monthly
            </button>
            <button
              role="radio"
              aria-checked={annual}
              onClick={() => setAnnual(true)}
              className={`relative z-10 flex items-center gap-1.5 rounded-full px-5 py-1.5 text-sm font-medium transition-colors ${
                annual ? "text-white" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Annual
              <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold transition-colors ${
                annual ? "bg-white/20 text-white" : "bg-[#22C55E]/15 text-[#22C55E]"
              }`}>
                −20%
              </span>
            </button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {plans.map((p) => {
            const price = annual ? p.annual : p.price;
            return (
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
                  <span className="font-display text-4xl font-semibold">${price}</span>
                  <span className="pb-1 text-sm text-muted-foreground">/ mo</span>
                </div>
                {annual && p.price > 0 && (
                  <p className="mt-1 text-[11px] text-muted-foreground">Billed annually</p>
                )}
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
            );
          })}
        </div>
      </Section>

      {/* Comparison table */}
      <Section className="pt-0" title="Compare every feature.">
        <div className="overflow-x-auto rounded-2xl border border-white/8 bg-white/[0.02]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/8 text-left">
                <th className="px-5 py-4 font-display font-semibold">Feature</th>
                <th className="px-5 py-4 text-center font-display font-semibold">Starter</th>
                <th className="px-5 py-4 text-center font-display font-semibold text-[#93C5FD]">Pro</th>
                <th className="px-5 py-4 text-center font-display font-semibold">Team</th>
              </tr>
            </thead>
            <tbody>
              {comparison.map((g) => (
                <>
                  <tr key={g.group} className="border-b border-white/5 bg-white/[0.015]">
                    <td colSpan={4} className="px-5 py-2 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                      {g.group}
                    </td>
                  </tr>
                  {g.rows.map((r) => (
                    <tr key={r.label} className="border-b border-white/5 last:border-0">
                      <td className="px-5 py-3 text-muted-foreground">{r.label}</td>
                      <Cell value={r.starter} />
                      <Cell value={r.pro} highlight />
                      <Cell value={r.team} />
                    </tr>
                  ))}
                </>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {/* Student pricing */}
      <Section className="pt-0" align="center" title="Searching on a student budget?">
        <div className="mx-auto max-w-2xl rounded-3xl border border-white/10 bg-gradient-to-br from-[oklch(0.22_0.06_265)] to-[oklch(0.18_0.08_290)] p-10 text-center md:p-14">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-gradient-to-br from-[#2563EB] to-[#7C3AED]">
            <GraduationCap className="h-6 w-6 text-white" />
          </span>
          <h3 className="mt-5 font-display text-2xl font-semibold md:text-3xl">50% off Pro for students</h3>
          <p className="mt-3 text-muted-foreground">
            Verify with a <span className="text-foreground">.edu</span> (or equivalent) email and get Pro for
            <span className="text-foreground"> $6/mo billed annually</span>. The same unlimited AI, cover letters, and
            analytics — half the price, while you're finding your first role.
          </p>
          <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
            <ButtonLink to="/signup" size="lg">Claim student pricing <ArrowRight className="h-4 w-4" /></ButtonLink>
            <ButtonLink to="/faq" size="lg" variant="outline">How verification works</ButtonLink>
          </div>
        </div>
      </Section>

      {/* Pricing FAQ */}
      <Section className="pb-32 pt-0" align="center" title="Pricing questions, answered.">
        <div className="mx-auto max-w-3xl divide-y divide-white/5 rounded-2xl border border-white/8 bg-white/[0.02]">
          {[
            { q: "Is there a free plan?", a: "Yes — Starter is free forever and includes the Chrome extension, up to 25 saved jobs, and the kanban tracker." },
            { q: "Why upgrade to Pro?", a: "Pro removes the limits that matter during an active search: unlimited saved jobs, unlimited resumes, unlimited AI actions, ATS scoring, cover letters, interview prep, and analytics. Most people upgrade when they're applying to more than a handful of roles at once." },
            { q: "Can I cancel any time?", a: "Absolutely. Cancel from your dashboard in one click — no email, no call, no retention theater. You keep access until the end of your billing period." },
            { q: "Do you offer student discounts?", a: "Yes. 50% off Pro for verified .edu (or equivalent) addresses. Reach out from your school email after signing up." },
            { q: "What happens to my data if I downgrade?", a: "Your data stays. You can export everything at any time. If you exceed the Starter limits after downgrading, some saved jobs will be read-only until you're back under the limit — but nothing is deleted." },
            { q: "Is there a team plan for career coaches?", a: "Yes — Team includes everything in Pro for up to 10 seats, shared job libraries, coach analytics, and priority support. Contact us and we'll set it up." },
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

function Cell({ value, highlight }: { value: string | boolean; highlight?: boolean }) {
  if (value === true) {
    return (
      <td className={`px-5 py-3 text-center ${highlight ? "text-[#93C5FD]" : ""}`}>
        <Check className={`mx-auto h-4 w-4 ${highlight ? "text-[#93C5FD]" : "text-[#22C55E]"}`} />
      </td>
    );
  }
  if (value === false) {
    return (
      <td className="px-5 py-3 text-center">
        <Minus className="mx-auto h-4 w-4 text-muted-foreground/40" />
      </td>
    );
  }
  return <td className={`px-5 py-3 text-center ${highlight ? "text-[#93C5FD]" : "text-foreground"}`}>{value}</td>;
}
