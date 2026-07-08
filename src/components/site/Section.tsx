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
    <section className={cn("mx-auto w-full max-w-6xl px-6 py-20 md:py-28", className)}>
      {(eyebrow || title || description) && (
        <div
          className={cn(
            "mb-12 max-w-2xl",
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
            <p className="mt-4 text-base text-muted-foreground md:text-lg">
              {description}
            </p>
          )}
        </div>
      )}
      {children}
    </section>
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