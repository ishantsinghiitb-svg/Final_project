import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Bookmark, CircleCheck, Pin, Puzzle, ScanLine } from "lucide-react";
import { PageHero, Section } from "@/components/site/Section";
import { ButtonLink } from "@/components/site/PrimaryButton";
import {
  CONTACT_EMAIL,
  SUPPORTED_PLATFORMS,
  extensionAccessSentence,
  extensionCta,
  isExtensionLive,
} from "@/content/extension";
import { contactLinkProps } from "@/content/contact";
import { ExtensionShowcase } from "@/components/site/ExtensionShowcase";
import { pageSeo } from "@/content/site";

export const Route = createFileRoute("/extension")({
  head: () => ({
    ...pageSeo({
      path: "/extension",
      title: "Chrome Extension for Job Tracking (LinkedIn, Naukri & More) — OfferLyst",
      description:
        "How the OfferLyst Chrome extension works: install it, open a supported job page, save the job, and pick it up in your OfferLyst workspace.",
      ogDescription: "Save a job from a supported job board in one click and continue in OfferLyst.",
    }),
  }),
  component: ExtensionPage,
});

/**
 * Every claim on this page is taken from the extension's own code:
 * supported sites come from `src/content/extension.ts` (guarded by
 * `extension.platforms.test.ts`), and the button labels and flow match
 * `extension/src/panel/sections/CtaRow.tsx` and `extension/src/popup/App.tsx`.
 *
 * The extension is not published to the Chrome Web Store yet (there is no
 * listing, extension key or store URL anywhere in the repo), so step 1 says so
 * plainly instead of linking to a store page that does not exist.
 */
const steps = [
  {
    icon: Puzzle,
    title: "Install the extension",
    body: extensionAccessSentence(),
  },
  {
    icon: Pin,
    title: "Pin it to your toolbar",
    body: "Open Chrome's extensions menu, find OfferLyst, and pin it. Pinning is optional but it keeps the popup one click away instead of two.",
  },
  {
    icon: ScanLine,
    title: "Open a supported job page",
    body: "On a job page from a supported site, OfferLyst reads the posting and shows a floating panel with the title, company, location, salary and job type it found.",
  },
  {
    icon: Bookmark,
    title: "Save it, or save and track it",
    body: "Save for Later keeps the job in your library. Apply & Track does the same and opens an application in your pipeline at the same time. Neither one navigates you away from the posting.",
  },
  {
    icon: CircleCheck,
    title: "Continue in OfferLyst",
    body: "The job appears under Saved, and tracked roles appear under Applications. View in OfferLyst opens the job or the application you just created.",
  },
];

function ExtensionPage() {
  const cta = extensionCta("extension access");

  return (
    <>
      <PageHero>
        <div className="mx-auto max-w-3xl text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs font-medium text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-[oklch(0.58_0.21_260)]" />
            Chrome extension
          </span>
          <h1 className="mt-5 font-display text-fluid-hero font-semibold tracking-tight">
            Save a job without leaving the tab
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-fluid-lead text-muted-foreground">
            The extension reads the posting you are already looking at and sends it to your
            OfferLyst workspace, so you are not copying job details into a spreadsheet.
          </p>
          {/* Primary action flips from "Request early access" to "Add to
              Chrome" purely from EXTENSION_AVAILABILITY — see
              src/content/extension.ts. Nothing here needs editing at launch. */}
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <a
              href={cta.href}
              {...(cta.external ? { target: "_blank", rel: "noreferrer" } : {})}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-[oklch(0.62_0.21_260)] to-[oklch(0.55_0.24_290)] px-5 py-3 text-[15px] font-medium text-white shadow-[inset_0_1px_0_0_rgba(255,255,255,0.2),0_10px_30px_-10px_oklch(0.58_0.21_260/0.8)] transition-transform hover:-translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[oklch(0.58_0.21_260)]/60"
            >
              {cta.label}
              <ArrowRight className="h-4 w-4" />
            </a>
            <ButtonLink to="/signup" size="lg" variant="outline">
              Create your workspace
            </ButtonLink>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">{cta.note}</p>
        </div>
      </PageHero>

      <Section spacing="tight">
        <ExtensionShowcase />
      </Section>

      <Section
        eyebrow="How it works"
        title="Five steps, then it is part of your browser."
        description="Nothing to configure. The extension uses the OfferLyst session already in this browser."
      >
        <ol className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {steps.map((s, i) => (
            <li
              key={s.title}
              className="flex flex-col rounded-2xl border border-white/8 bg-white/[0.02] p-6"
            >
              <div className="flex items-center gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-white/10 bg-white/[0.02] text-[#93C5FD]">
                  <s.icon className="h-4 w-4" />
                </span>
                <span className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Step {i + 1}
                </span>
              </div>
              <h2 className="mt-4 font-display text-lg font-semibold leading-snug">{s.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{s.body}</p>
            </li>
          ))}
        </ol>
      </Section>

      <Section
        eyebrow="Supported sites"
        title="Where the extension works today"
        description="These are the sites the extension has a dedicated parser for. Everywhere else it stays quiet rather than guessing at a job it cannot read properly."
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {SUPPORTED_PLATFORMS.map((p) => (
            <div key={p.name} className="rounded-xl border border-white/8 bg-white/[0.02] p-4">
              <p className="font-display text-sm font-semibold">{p.name}</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{p.note}</p>
            </div>
          ))}
        </div>
        <p className="mt-5 max-w-2xl text-xs leading-relaxed text-muted-foreground">
          On a hiring page from a site that is not on this list, the extension tells you tracking is
          not available there yet rather than saving something it may have read wrong. You can still
          add the role by hand from the dashboard.
        </p>
      </Section>

      <Section spacing="last">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-6">
            <h2 className="font-display text-lg font-semibold">Signing in</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              The extension uses the OfferLyst session already in your browser. Log in to OfferLyst
              in the same browser once and the extension picks it up. It never asks for your
              password and there is no separate extension account.
            </p>
          </div>
          <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-6">
            <h2 className="font-display text-lg font-semibold">If the panel does not appear</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Refresh the job page once. Chrome only injects the extension into tabs opened after it
              finished loading, so a tab that was already open when you installed or reloaded the
              extension needs one refresh.
            </p>
          </div>
        </div>
        <div className="mt-8 rounded-2xl border border-white/8 bg-white/[0.02] p-6 text-center">
          <p className="text-sm text-muted-foreground">
            {isExtensionLive()
              ? "Questions about the extension?"
              : "Questions about the extension, or want early access?"}{" "}
            <a
              {...contactLinkProps({ subject: "extension access" })}
              className="rounded text-[#93C5FD] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[oklch(0.58_0.21_260)]/60"
            >
              {CONTACT_EMAIL}
            </a>
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            More on how the rest of the workspace fits together on the{" "}
            <Link to="/features" className="text-[#93C5FD] hover:underline">
              features page
            </Link>
            .
          </p>
        </div>
      </Section>
    </>
  );
}
