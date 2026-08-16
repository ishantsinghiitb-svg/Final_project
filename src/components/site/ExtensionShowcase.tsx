import { Check } from "lucide-react";
import { LogoMark } from "@/components/site/Logo";

/**
 * Product illustration of the extension's floating panel on a job page.
 *
 * Drawn with markup rather than shipped as screenshots: it stays crisp at every
 * width, costs no image bytes, and can't go stale the way a captured PNG does.
 *
 * It mirrors what the panel actually renders, so nothing here implies a
 * capability that doesn't exist:
 *   • JobIdentity      → company mark + title + company name
 *   • MetadataChipRow  → only the fields a posting actually has
 *   • CtaRow "ready"   → "Apply & Track" / "Save for Later"
 *   • CtaRow "tracked" → disabled "✓ Application Tracked" / "View in OfferLyst"
 * (see extension/src/panel/sections/*).
 *
 * The underlying job page is drawn as neutral grey blocks on purpose: it stands
 * in for any supported site without borrowing another company's branding or
 * inventing a real posting.
 */

function PanelShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-[228px] shrink-0 overflow-hidden rounded-xl border border-white/12 bg-[oklch(0.17_0.03_265)]/95 shadow-[0_24px_60px_-24px_rgba(0,0,0,0.9)] backdrop-blur">
      <div className="flex items-center gap-1.5 border-b border-white/8 px-2.5 py-1.5">
        <LogoMark size={14} />
        <span className="font-display text-[10px] font-semibold tracking-tight">OfferLyst</span>
      </div>
      {children}
    </div>
  );
}

function JobIdentityBlock() {
  return (
    <>
      <div className="flex items-start gap-2">
        <div className="grid h-6 w-6 shrink-0 place-items-center rounded bg-gradient-to-br from-[#2563EB] to-[#7C3AED] text-[9px] font-semibold text-white">
          A
        </div>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold leading-tight">Frontend Engineer</p>
          <p className="text-[10px] leading-tight text-muted-foreground">Acme Technologies</p>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        {["Bengaluru", "Hybrid", "Full-time"].map((c) => (
          <span
            key={c}
            className="rounded border border-white/10 bg-white/[0.04] px-1.5 py-0.5 text-[9px] text-muted-foreground"
          >
            {c}
          </span>
        ))}
      </div>
    </>
  );
}

/** Browser + job-page backdrop the panel sits on. */
function PageBackdrop({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-[oklch(0.19_0.03_265)]/70 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.7)] backdrop-blur">
      {/* Browser chrome */}
      <div className="flex items-center gap-2 border-b border-white/8 bg-white/[0.02] px-3 py-2">
        <div className="flex gap-1.5">
          <span className="h-2 w-2 rounded-full bg-white/15" />
          <span className="h-2 w-2 rounded-full bg-white/15" />
          <span className="h-2 w-2 rounded-full bg-white/15" />
        </div>
        <div className="ml-1 flex-1 truncate rounded bg-white/[0.04] px-2 py-1 text-[10px] text-muted-foreground">
          {label}
        </div>
      </div>

      {/* Job page + overlaid panel */}
      <div className="flex gap-3 p-3">
        <div aria-hidden className="min-w-0 flex-1 space-y-2.5">
          <div className="h-2.5 w-2/3 rounded bg-white/10" />
          <div className="h-2 w-2/5 rounded bg-white/[0.07]" />
          <div className="mt-3 space-y-1.5">
            {["w-full", "w-11/12", "w-full", "w-4/5", "w-10/12", "w-3/5"].map((w, i) => (
              <div key={i} className={`h-1.5 rounded bg-white/[0.05] ${w}`} />
            ))}
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}

export function ExtensionShowcase() {
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      {/* State 1 — job detected, nothing saved yet */}
      <figure className="m-0">
        <PageBackdrop label="A supported job page">
          <PanelShell>
            <div className="p-2.5">
              <JobIdentityBlock />
              <div className="mt-2.5 grid grid-cols-2 gap-1.5">
                <span className="rounded-md bg-gradient-to-br from-[#2563EB] to-[#7C3AED] px-1.5 py-1 text-center text-[9px] font-medium text-white">
                  Apply &amp; Track
                </span>
                <span className="rounded-md border border-white/12 bg-white/[0.04] px-1.5 py-1 text-center text-[9px] font-medium text-muted-foreground">
                  Save for Later
                </span>
              </div>
            </div>
          </PanelShell>
        </PageBackdrop>
        <figcaption className="mt-3 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">It reads the posting for you.</span> The
          panel shows the title, company and only the details the page actually lists.
        </figcaption>
      </figure>

      {/* State 2 — already tracked */}
      <figure className="m-0">
        <PageBackdrop label="After you save it">
          <PanelShell>
            <div className="p-2.5">
              <JobIdentityBlock />
              <div className="mt-2.5 grid grid-cols-2 gap-1.5">
                <span className="inline-flex items-center justify-center gap-1 rounded-md border border-[#22C55E]/25 bg-[#22C55E]/12 px-1.5 py-1 text-[9px] font-medium text-[#4ADE80]">
                  <Check className="h-2.5 w-2.5" />
                  Tracked
                </span>
                <span className="rounded-md border border-white/12 bg-white/[0.04] px-1.5 py-1 text-center text-[9px] font-medium text-muted-foreground">
                  View in OfferLyst
                </span>
              </div>
            </div>
          </PanelShell>
        </PageBackdrop>
        <figcaption className="mt-3 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">One click and it is in your pipeline.</span>{" "}
          You stay on the posting; the job and the application are already in OfferLyst.
        </figcaption>
      </figure>
    </div>
  );
}
