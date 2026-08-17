import type { ReactNode } from "react";
import { TriangleAlert } from "lucide-react";
import { PageHero, Section } from "@/components/site/Section";

// ── Shared legal-page shell (Module 13 · Phase 6) ──
//
// One layout for Privacy Policy and Terms of Service so they read as the
// same document family, plus the disclaimer banner both pages need: neither
// of these was written or reviewed by a lawyer. They describe the product's
// actual behavior (verified against the real codebase, not boilerplate),
// but "accurate" and "legally sufficient for launch" are different bars.

export function LegalDocument({
  title,
  lastUpdated,
  intro,
  children,
}: {
  title: string;
  lastUpdated: string;
  intro: ReactNode;
  children: ReactNode;
}) {
  return (
    <>
      <PageHero>
        <div className="mx-auto max-w-3xl">
          <h1 className="font-display text-fluid-hero font-semibold tracking-tight">{title}</h1>
          <p className="mt-3 text-sm text-muted-foreground">Last updated {lastUpdated}</p>
        </div>
      </PageHero>

      <Section spacing="tight">
        <div className="mx-auto max-w-3xl rounded-2xl border border-amber-400/20 bg-amber-400/[0.06] p-5">
          <div className="flex gap-3">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
            <p className="text-sm leading-relaxed text-amber-100/90">
              This document was written by the team from the product's actual behavior, not by a
              lawyer, and is not legal advice. Sections marked{" "}
              <strong className="font-medium text-amber-200">Needs legal review</strong> are
              flagged because they involve decisions — liability limits, jurisdiction, data-rights
              compliance — that should be confirmed with a qualified lawyer before this is relied
              on for a public launch.
            </p>
          </div>
        </div>
      </Section>

      <Section spacing="last">
        <div className="mx-auto max-w-3xl space-y-10 text-[15px] leading-relaxed text-muted-foreground [&_h2]:mb-3 [&_h2]:font-display [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-foreground [&_li]:ml-5 [&_li]:list-disc [&_p+p]:mt-3 [&_strong]:font-medium [&_strong]:text-foreground">
          <p>{intro}</p>
          {children}
        </div>
      </Section>
    </>
  );
}

export function LegalSection({
  title,
  needsReview,
  children,
}: {
  title: string;
  needsReview?: boolean;
  children: ReactNode;
}) {
  return (
    <div>
      <h2>
        {title}
        {needsReview && (
          <span className="ml-2 inline-flex items-center rounded-full border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 align-middle text-[11px] font-medium text-amber-300">
            Needs legal review
          </span>
        )}
      </h2>
      {children}
    </div>
  );
}
