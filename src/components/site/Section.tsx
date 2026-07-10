import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Section({
  children,
  className,
  eyebrow,
  title,
  description,
  align = "left",
}: {
  children?: ReactNode;
  className?: string;
  eyebrow?: string;
  title?: ReactNode;
  description?: ReactNode;
  align?: "left" | "center";
}) {
  return (
    <section className={cn("mx-auto w-full max-w-7xl px-6 py-10 md:py-14", className)}>
      {(eyebrow || title || description) && (
        <div
          className={cn(
            "mb-8 max-w-2xl",
            align === "center" && "mx-auto text-center",
          )}
        >
          {eyebrow && (
            <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs font-medium text-muted-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-[oklch(0.58_0.21_260)]" />
              {eyebrow}
            </span>
          )}
          {title && (
            <h2 className="mt-4 text-3xl font-semibold tracking-tight md:text-4xl">
              {title}
            </h2>
          )}
          {description && (
            <p className="mt-3 text-base text-muted-foreground md:text-lg">
              {description}
            </p>
          )}
        </div>
      )}
      {children}
    </section>
  );
}

/**
 * Consistent hero spacing for marketing pages so content
 * doesn't glue to the sticky navbar.
 */
export function PageHero({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mx-auto w-full max-w-7xl px-6 pt-20 pb-4 md:pt-28", className)}>
      {children}
    </div>
  );
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs font-medium text-muted-foreground">
      <span className="h-1.5 w-1.5 rounded-full bg-[oklch(0.58_0.21_260)]" />
      {children}
    </span>
  );
}
