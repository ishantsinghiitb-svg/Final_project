import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Vertical rhythm for marketing sections. The Home page is the reference for
 * what "correct" feels like, so `default` is exactly what Home already used.
 * Pages previously reached for one-off `pt-6` / `pb-24` / `pt-0` classNames,
 * which is why spacing drifted between pages; those cases are now named.
 */
type Spacing = "default" | "tight" | "last";

const SPACING: Record<Spacing, string> = {
  /** Standard section rhythm (the Home page baseline). */
  default: "py-12 md:py-16",
  /** Follows directly on from a hero or a closely related block above it. */
  tight: "pt-2 pb-12 md:pt-4 md:pb-16",
  /** Final section on a page, with a little extra room before the footer. */
  last: "pt-12 pb-20 md:pt-16 md:pb-24",
};

export function Section({
  children,
  className,
  eyebrow,
  title,
  description,
  align = "left",
  spacing = "default",
}: {
  children?: ReactNode;
  className?: string;
  eyebrow?: string;
  title?: ReactNode;
  description?: ReactNode;
  align?: "left" | "center";
  spacing?: Spacing;
}) {
  const hasHeader = Boolean(eyebrow || title || description);

  return (
    <section className={cn("site-container", SPACING[spacing], className)}>
      {hasHeader && (
        <SectionHeader eyebrow={eyebrow} title={title} description={description} align={align} />
      )}
      {children}
    </section>
  );
}

/**
 * The section header is the piece that made several pages look broken.
 *
 * It used to be a single `max-w-2xl` block. Once the site container grew to
 * 1280–1536px that measure is under half the available width, so a left-aligned
 * header read as a two-column layout whose second column had been forgotten,
 * and short headings wrapped early enough to orphan a word ("Where the
 * extension works / today").
 *
 * Now the composition is explicit:
 *   • left + description  → a real two-column header on large screens, title
 *                           against description, so the width is used on
 *                           purpose rather than left empty.
 *   • left, title only    → a wider measure, so the heading fills the line
 *                           instead of wrapping early.
 *   • center              → unchanged intent, slightly wider measure.
 */
function SectionHeader({
  eyebrow,
  title,
  description,
  align,
}: {
  eyebrow?: string;
  title?: ReactNode;
  description?: ReactNode;
  align: "left" | "center";
}) {
  const eyebrowEl = eyebrow ? (
    <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs font-medium text-muted-foreground">
      <span className="h-1.5 w-1.5 rounded-full bg-[oklch(0.58_0.21_260)]" />
      {eyebrow}
    </span>
  ) : null;

  const titleEl = title ? (
    <h2 className="font-display text-fluid-h2 font-semibold tracking-tight text-balance">
      {title}
    </h2>
  ) : null;

  const descriptionEl = description ? (
    <p className="text-fluid-lead text-muted-foreground">{description}</p>
  ) : null;

  if (align === "center") {
    return (
      <div className="mx-auto mb-8 max-w-3xl text-center">
        {eyebrowEl}
        {titleEl && <div className="mt-4">{titleEl}</div>}
        {descriptionEl && <div className="mx-auto mt-3 max-w-2xl">{descriptionEl}</div>}
      </div>
    );
  }

  // Left-aligned with a description: two intentional columns on large screens,
  // stacked below that. `items-end` sits the description on the heading's
  // baseline block rather than floating it at the top of a tall heading.
  if (descriptionEl) {
    return (
      <div className="mb-8 lg:grid lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:items-end lg:gap-x-12">
        <div>
          {eyebrowEl}
          {titleEl && <div className="mt-4">{titleEl}</div>}
        </div>
        <div className="mt-3 max-w-2xl lg:mt-0">{descriptionEl}</div>
      </div>
    );
  }

  // Left-aligned, title only: a wider measure so short headings don't wrap
  // early and orphan their last word.
  return (
    <div className="mb-8 max-w-4xl">
      {eyebrowEl}
      {titleEl && <div className="mt-4">{titleEl}</div>}
    </div>
  );
}

/**
 * Consistent hero spacing for marketing pages so content
 * doesn't glue to the fixed navbar.
 */
export function PageHero({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("site-container pt-24 pb-4 md:pt-32", className)}>{children}</div>;
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs font-medium text-muted-foreground">
      <span className="h-1.5 w-1.5 rounded-full bg-[oklch(0.58_0.21_260)]" />
      {children}
    </span>
  );
}
