import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Shared AI page frame (Module 6G, Phase 4) ──
//
// Before this, each AI surface set its own width and rhythm: the Optimizer used
// `max-w-6xl` with `space-y-5`, the Cover Letter pages inherited the dashboard
// default with no cap, and the Hub was new. Moving between them felt like
// moving between three products, because the content column literally jumped.
//
// One frame fixes all of it. Every AI page renders inside AIPage, so the
// measure, the vertical rhythm and the header treatment are decided once:
//
//   width    max-w-5xl  — wide enough for a two-column report, narrow enough
//                         that body text stays readable on a 27" monitor
//   rhythm   space-y-4  — matches DashboardShell's own <main> spacing, so an
//                         AI page and a non-AI page scroll identically
//   padding  none here  — DashboardShell already pads <main>; adding more
//                         would make AI pages inset differently from the rest
//
// Two deliberate exceptions, both about reading measure rather than framing:
//   • the Optimizer's review step narrows its own column further, because a
//     list of suggested rewrites is prose and prose has a comfortable measure
//   • the Cover Letter Studio uses `width="workspace"`, because squeezing a
//     three-pane workspace (versions | editor | AI actions) into a reading
//     column would leave the editor too narrow to write in. It still gets the
//     same margins, rhythm and header treatment as the rest.

const WIDTHS = {
  /** Reading and list surfaces: the Hub, the Cover Letter library, the Optimizer. */
  default: "max-w-5xl",
  /** Multi-pane workspaces that need the room. */
  workspace: "max-w-7xl",
} as const;

export function AIPage({
  children,
  className,
  width = "default",
  /** Extra bottom room for pages with a fixed action bar (the Optimizer). */
  bottomGutter = false,
}: {
  children: ReactNode;
  className?: string;
  width?: keyof typeof WIDTHS;
  bottomGutter?: boolean;
}) {
  return (
    <div
      className={cn("mx-auto w-full space-y-4", WIDTHS[width], bottomGutter && "pb-24", className)}
    >
      {children}
    </div>
  );
}

/**
 * The back-link + icon + title block used by AI pages that are a step INTO
 * something (the Optimizer, the Cover Letter Studio) rather than a top-level
 * destination. Top-level AI pages use PageHeader instead — same type scale, but
 * without a back link they'd have nowhere to point.
 */
export function AIPageHeader({
  backTo,
  backParams,
  backLabel,
  icon: Icon,
  title,
  subtitle,
  actions,
}: {
  backTo:
    | "/dashboard/resumes"
    | "/dashboard/cover-letters"
    | "/dashboard/interviews"
    | "/dashboard/interviews/$interviewId";
  /** Route params for a dynamic `backTo` (e.g. `{ interviewId }`). Omit for a static route. */
  backParams?: Record<string, string>;
  backLabel: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div>
      <Link
        to={backTo}
        params={backParams}
        className="inline-flex items-center gap-1.5 text-sm text-[oklch(0.45_0.02_265)] transition-colors hover:text-[#2563EB]"
      >
        <ArrowLeft className="h-4 w-4" /> {backLabel}
      </Link>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-[#2563EB]/10 to-[#7C3AED]/15 text-[#7C3AED]">
            <Icon className="h-4.5 w-4.5" />
          </div>
          <div className="min-w-0">
            <h1 className="truncate font-display text-[22px] font-semibold tracking-tight text-[oklch(0.2_0.02_265)]">
              {title}
            </h1>
            {subtitle && (
              <div className="truncate text-sm text-[oklch(0.45_0.02_265)]">{subtitle}</div>
            )}
          </div>
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}
