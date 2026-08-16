import { cn } from "@/lib/utils";
import { contactLinkProps, creditsRequestBody } from "@/content/contact";

/**
 * The single "you are out of AI credits" call to action for the whole
 * dashboard. OfferLyst has no paid plans, so every surface that used to link to
 * `/pricing` with "See upgrade options" opens a prefilled Gmail draft instead.
 * Keeping this in one component is what stops the call sites from drifting
 * apart again; the URL itself comes from `content/contact.ts`, shared with the
 * marketing site.
 */

/** Anchor props for a credits request. Exported for callers that render their own element. */
export function moreCreditsLinkProps(context?: string) {
  return contactLinkProps({
    subject: "more AI credits",
    body: creditsRequestBody(context),
  });
}

type Variant = "primary" | "secondary" | "inline";

const styles: Record<Variant, string> = {
  primary:
    "inline-flex items-center rounded-lg bg-gradient-to-br from-[#2563EB] to-[#7C3AED] px-2.5 py-1.5 text-xs font-semibold text-white transition-transform hover:-translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]/40",
  secondary:
    "inline-flex w-full items-center justify-center rounded-xl border border-black/10 bg-white py-2.5 text-sm font-medium text-[oklch(0.25_0.02_265)] transition-colors hover:bg-black/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]/40",
  inline:
    "font-medium text-[#2563EB] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]/40 rounded",
};

export function NeedMoreCreditsLink({
  variant = "primary",
  context,
  className,
  children = "Ask for more credits",
}: {
  variant?: Variant;
  /** Feature name, used to prefill the mail body. */
  context?: string;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <a {...moreCreditsLinkProps(context)} className={cn(styles[variant], className)}>
      {children}
    </a>
  );
}
