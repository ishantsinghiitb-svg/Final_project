import { memo } from "react";
import { Link } from "@tanstack/react-router";
import { AlertCircle, Zap, RotateCcw, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatGeneratedAt } from "@/features/ai/format";
import { aiErrorCopy } from "@/features/ai/errorMessages";
import type { AIActivityAction, AIActivityItem } from "@/features/ai/activity";

// ── One row of the AI Hub timeline (Module 6G) ──
//
// A row, not a card. The Hub's job is "what have I run lately, and can I get
// back to it" — so every row is one line of identity, one line of facts, and
// the actions on the right. Nothing here expands, charts, or scores: the
// numbers live in the feature that produced them, one click away.

/**
 * The facts line. Deliberately short and in this order — what it cost, when it
 * ran, which resume — because cost is the thing a user scans a credit-metered
 * timeline for.
 */
function factsLine(item: AIActivityItem): string[] {
  const facts: string[] = [];

  if (item.failed) {
    facts.push("Didn't complete");
  } else if (item.reused) {
    facts.push("Reused earlier result");
  } else if (item.creditsCharged > 0) {
    facts.push(`${item.creditsCharged} credit${item.creditsCharged === 1 ? "" : "s"}`);
  }

  facts.push(formatGeneratedAt(item.createdAt));
  if (item.resumeName) facts.push(item.resumeName);

  return facts.filter(Boolean);
}

/**
 * Renders one action as a route-typed `<Link>`. Kept as a switch over the
 * action union (rather than a `to={string}`) so every Hub destination is
 * checked against the generated route tree at build time.
 */
function ActionLink({
  action,
  className,
  children,
}: {
  action: AIActivityAction;
  className: string;
  children: React.ReactNode;
}) {
  switch (action.kind) {
    case "job":
      return (
        <Link
          to="/dashboard/jobs/$jobId"
          params={{ jobId: action.jobId }}
          search={action.search}
          className={className}
        >
          {children}
        </Link>
      );
    case "optimize":
      return (
        <Link
          to="/dashboard/resumes/$resumeId/optimize"
          params={{ resumeId: action.resumeId }}
          className={className}
        >
          {children}
        </Link>
      );
    case "coverLetter":
      return (
        <Link
          to="/dashboard/cover-letters/$coverLetterId"
          params={{ coverLetterId: action.coverLetterId }}
          className={className}
        >
          {children}
        </Link>
      );
  }
}

/**
 * Memoized: switching the Hub's capability filter re-renders the list, and
 * every row's props come from a `useMemo`-stable item object, so identical rows
 * can skip re-rendering entirely.
 */
export const AIActivityRow = memo(function AIActivityRow({ item }: { item: AIActivityItem }) {
  const Icon = item.icon;
  const facts = factsLine(item);

  return (
    <li className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-[oklch(0.98_0.005_265)]">
      <div
        className={cn(
          "grid h-8 w-8 shrink-0 place-items-center rounded-lg",
          item.failed
            ? "bg-[#F43F5E]/10 text-[#E11D48]"
            : "bg-gradient-to-br from-[#2563EB]/10 to-[#7C3AED]/15 text-[#7C3AED]",
        )}
      >
        {item.failed ? <AlertCircle className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="shrink-0 text-sm font-medium text-[oklch(0.25_0.02_265)]">
            {item.capabilityLabel}
          </span>
          <span className="text-[oklch(0.7_0.02_265)]">·</span>
          <span className="truncate text-sm text-[oklch(0.45_0.02_265)]" title={item.subject}>
            {item.subject}
          </span>
        </div>

        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-[oklch(0.55_0.02_265)]">
          {item.reused && !item.failed && <Zap className="h-3 w-3 text-[#16A34A]" />}
          <span className="truncate">{facts.join(" · ")}</span>

          {item.resumeChangedSince && !item.failed && (
            <span
              className="inline-flex items-center gap-1 rounded-full bg-[#F59E0B]/15 px-1.5 py-0.5 font-medium text-[#B45309]"
              title="Your resume has been updated since this ran, so this result reflects the older version."
            >
              <RotateCcw className="h-2.5 w-2.5" /> Resume updated since
            </span>
          )}
        </div>

        {/* A failure keeps its reason on the row — the user shouldn't have to
            reopen the feature to find out why nothing came back. */}
        {item.failed && (
          <p className="mt-0.5 text-[11px] text-[oklch(0.5_0.02_265)]">
            {aiErrorCopy(item.errorCode ?? undefined).title}
          </p>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        {item.regenerate && (
          <ActionLink
            action={item.regenerate}
            className="hidden rounded-lg border border-black/10 bg-white px-2.5 py-1.5 text-xs font-medium text-[oklch(0.4_0.02_265)] transition-colors hover:bg-black/[0.03] sm:inline-flex"
          >
            {item.regenerate.label}
          </ActionLink>
        )}
        {item.open ? (
          <ActionLink
            action={item.open}
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium text-[#2563EB] transition-colors hover:bg-[#2563EB]/[0.06]"
          >
            <span className="hidden sm:inline">{item.open.label}</span>
            <ChevronRight className="h-3.5 w-3.5" />
          </ActionLink>
        ) : (
          <span
            className="px-2 text-[11px] text-[oklch(0.6_0.02_265)]"
            title="The job or document this ran against is no longer available."
          >
            Unavailable
          </span>
        )}
      </div>
    </li>
  );
});
