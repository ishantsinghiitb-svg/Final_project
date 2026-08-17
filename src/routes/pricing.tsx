import { createFileRoute } from "@tanstack/react-router";
import { CircleCheck, Sparkles } from "lucide-react";
import { PageHero, Section } from "@/components/site/Section";
import { ButtonLink } from "@/components/site/PrimaryButton";
import { Reveal } from "@/components/site/Reveal";
import { CONTACT_EMAIL } from "@/content/extension";
import { contactLinkProps } from "@/content/contact";
import { CREDIT_COSTS, FREE_CAPABILITIES, FREE_CREDITS } from "@/content/credits";
import { pageSeo } from "@/content/site";

export const Route = createFileRoute("/pricing")({
  head: () => ({
    ...pageSeo({
      path: "/pricing",
      title: "Pricing — Free Job Tracker & Resume AI — OfferLyst",
      description:
        "OfferLyst is free during early access. No paid plans, no credit card, a free AI credit allowance on every account.",
      ogDescription: "Free during early access. No paid plans, no credit card required.",
    }),
  }),
  component: PricingPage,
});

/**
 * There are no paid plans — see src/content/credits.ts's own header comment.
 * This page exists because "pricing" is a real, common search/navigation
 * intent that had no dedicated page (the same free-positioning copy already
 * lived scattered across Features/About/FAQ); it must never show fabricated
 * tiers or numbers, only what src/content/credits.ts already derives from
 * the same config the server actually charges against.
 */

function PricingPage() {
  return (
    <>
      <PageHero>
        <div className="mx-auto max-w-3xl text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs font-medium text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-[oklch(0.58_0.21_260)]" />
            Pricing
          </span>
          <h1 className="mt-5 font-display text-fluid-hero font-semibold tracking-tight">
            Free during early access.
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-fluid-lead text-muted-foreground">
            There are no paid plans right now. Every account gets a free AI credit allowance, and
            everything that doesn't use AI stays free regardless.
          </p>
        </div>
      </PageHero>

      <Reveal>
        <Section>
          <div className="mx-auto max-w-2xl rounded-3xl border border-white/10 bg-white/[0.02] p-8 md:p-10">
            <div className="flex items-center gap-3">
              <span className="grid h-11 w-11 place-items-center rounded-xl border border-white/10 text-[#93C5FD]">
                <Sparkles className="h-5 w-5" />
              </span>
              <div>
                <p className="font-display text-fluid-h3 font-semibold">Free, early access</p>
                <p className="text-sm text-muted-foreground">No credit card required.</p>
              </div>
            </div>

            <ul className="mt-6 space-y-3 text-sm">
              <li className="flex items-start gap-2.5">
                <CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#93C5FD]" />
                <span>
                  <strong className="font-medium">{FREE_CREDITS} AI credits</strong> on every new
                  account
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#93C5FD]" />
                <span>Unlimited job saving, application tracking and notes</span>
              </li>
              <li className="flex items-start gap-2.5">
                <CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#93C5FD]" />
                <span>Chrome extension, in early access</span>
              </li>
              {FREE_CAPABILITIES.map((c) => (
                <li key={c} className="flex items-start gap-2.5">
                  <CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#93C5FD]" />
                  <span>{c}, always free</span>
                </li>
              ))}
            </ul>

            <ButtonLink to="/signup" size="lg" className="mt-8 w-full justify-center">
              Get Started Free
            </ButtonLink>
          </div>
        </Section>
      </Reveal>

      <Reveal>
        <Section eyebrow="AI credits" title="What each AI action costs.">
          <div className="mx-auto max-w-2xl divide-y divide-white/5 overflow-hidden rounded-2xl border border-white/8 bg-white/[0.02]">
            {CREDIT_COSTS.map((c) => (
              <div key={c.label} className="flex items-center justify-between px-5 py-4 sm:px-6">
                <span className="text-sm text-muted-foreground">{c.label}</span>
                <span className="text-sm font-medium tabular-nums">
                  {c.cost} {c.cost === 1 ? "credit" : "credits"}
                </span>
              </div>
            ))}
          </div>
          <p className="mx-auto mt-4 max-w-2xl text-sm text-muted-foreground">
            Everything else — saving jobs, tracking applications, notes and analytics — never uses
            credits.
          </p>
        </Section>
      </Reveal>

      <Reveal>
        <Section spacing="last">
          <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-[oklch(0.22_0.06_265)] to-[oklch(0.18_0.08_290)] p-8 md:p-12">
            <div className="flex flex-col items-start gap-6 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="font-display text-fluid-h2 font-semibold">Need more credits?</h2>
                <p className="mt-3 max-w-xl text-sm text-muted-foreground md:text-base">
                  There is no checkout to go through, because there are no paid plans at this
                  stage. Write to us and tell us what you're working on.
                </p>
              </div>
              <a
                {...contactLinkProps({ subject: "More AI credits" })}
                className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-gradient-to-br from-[oklch(0.62_0.21_260)] to-[oklch(0.55_0.24_290)] px-5 py-3 text-[15px] font-medium text-white shadow-[inset_0_1px_0_0_rgba(255,255,255,0.2),0_10px_30px_-10px_oklch(0.58_0.21_260/0.8)] transition-transform hover:-translate-y-px"
              >
                Write to {CONTACT_EMAIL}
              </a>
            </div>
          </div>
        </Section>
      </Reveal>
    </>
  );
}
