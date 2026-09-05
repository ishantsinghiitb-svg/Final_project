import type { ReactNode } from "react";
import { PageHero, Section } from "@/components/site/Section";

// ── Shared legal-page shell (Module 13 · Phase 6) ──
//
// One layout for Privacy Policy and Terms of Service so they read as the
// same document family. The internal-review disclaimer banner and the
// per-section "Needs legal review" badges that used to render here were
// removed for public launch (they were an internal flag for the team, not
// content for users) — the policy text itself is unchanged; see privacy.tsx
// / terms.tsx. `LegalSection` below still accepts `needsReview` so those two
// files don't need to change, it just no longer renders anything for it.

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
  needsReview: _needsReview,
  children,
}: {
  title: string;
  /** No longer rendered (see this file's header) — kept only so existing call sites in privacy.tsx/terms.tsx don't need to change. */
  needsReview?: boolean;
  children: ReactNode;
}) {
  return (
    <div>
      <h2>{title}</h2>
      {children}
    </div>
  );
}
