import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Sparkles, ShieldCheck, Wand2, Mail, Loader2, AlertCircle, Activity } from "lucide-react";
import {
  DashCard,
  EmptyState,
  PageHeader,
  StickyPageHeader,
} from "@/components/dashboard/primitives";
import { AIActivityRow } from "@/components/dashboard/ai/AIActivityRow";
import { AIPage } from "@/components/dashboard/ai/AIPage";
import { useAIActivity, useAICredits } from "@/features/ai/hooks";
import { HUB_CAPABILITIES, hubCapabilityLabel, type HubCapability } from "@/features/ai/activity";
import { cn } from "@/lib/utils";

// ── AI Hub (Module 6G) ──
//
// ONE surface for everything the AI platform has done for this user. It
// deliberately replaces the two pages this could have been — an "AI dashboard"
// of charts and an "AI history" table — because neither answers a job seeker's
// actual questions, which are only ever:
//
//   "what have I already run, so I don't pay twice for it?"
//   "how many credits do I have left?"
//   "how do I get back to that analysis?"
//
// So: a credits line, a capability filter, and a timeline. No graphs, no
// aggregate widgets, no per-run telemetry. Everything the Hub shows is
// something the user could act on.
//
// The Hub reads only — opening it never triggers or charges for an AI call.

export const Route = createFileRoute("/dashboard/ai")({
  head: () => ({
    meta: [{ title: "AI Hub — NextOffer" }, { name: "robots", content: "noindex" }],
  }),
  component: AIHubPage,
});

type Filter = HubCapability | "all";

/**
 * The four entry points, so an empty Hub is a starting line rather than a dead
 * end and a returning user can begin their next run without navigating away.
 */
const STARTERS = [
  {
    icon: Sparkles,
    title: "Resume match",
    body: "See how well a resume fits a job before you apply.",
    to: "/dashboard/jobs" as const,
    cta: "Pick a job",
  },
  {
    icon: ShieldCheck,
    title: "ATS check",
    body: "Check that screening software can actually read your resume.",
    to: "/dashboard/jobs" as const,
    cta: "Pick a job",
  },
  {
    icon: Wand2,
    title: "Resume optimizer",
    body: "Get specific rewrites you can accept or skip, line by line.",
    to: "/dashboard/resumes" as const,
    cta: "Pick a resume",
  },
  {
    icon: Mail,
    title: "Cover letter",
    body: "Write a letter built from your real experience, not a template.",
    to: "/dashboard/cover-letters" as const,
    cta: "Write one",
  },
];

/**
 * Credits as one line, not a widget. A progress ring or a usage chart would be
 * the biggest thing on the page while telling the user strictly less than the
 * number itself.
 */
function CreditsLine() {
  const { data: credits, isLoading } = useAICredits();

  if (isLoading || !credits) {
    return <div className="h-4 w-40 animate-pulse rounded bg-black/[0.06]" />;
  }

  const remaining = credits.creditsRemaining;
  const out = remaining <= 0;

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
      <span className={cn("font-medium", out ? "text-[#B45309]" : "text-[oklch(0.25_0.02_265)]")}>
        {remaining} AI credit{remaining === 1 ? "" : "s"} left
      </span>
      <span className="text-[oklch(0.55_0.02_265)]">of {credits.creditsTotal}</span>
      {out && (
        <Link to="/pricing" className="font-medium text-[#2563EB] hover:underline">
          Get more
        </Link>
      )}
    </div>
  );
}

function FilterTabs({
  value,
  onChange,
  counts,
}: {
  value: Filter;
  onChange: (next: Filter) => void;
  counts: Record<Filter, number>;
}) {
  const options: Filter[] = ["all", ...HUB_CAPABILITIES];

  return (
    <div className="flex flex-wrap items-center gap-1 rounded-lg border border-black/5 bg-white p-0.5">
      {options.map((option) => {
        const count = counts[option] ?? 0;
        // A capability the user has never run is hidden rather than shown as a
        // permanently empty tab — the filter bar should only offer filters that
        // lead somewhere.
        if (option !== "all" && count === 0) return null;
        const label = option === "all" ? "All" : hubCapabilityLabel(option);
        return (
          <button
            key={option}
            onClick={() => onChange(option)}
            className={cn(
              "rounded-md px-2.5 py-1.5 text-xs transition-colors",
              option === value
                ? "bg-[oklch(0.95_0.02_265)] font-medium text-[#2563EB]"
                : "text-[oklch(0.45_0.02_265)] hover:bg-black/[0.03]",
            )}
          >
            {label}
            <span className="ml-1 tabular-nums opacity-60">{count}</span>
          </button>
        );
      })}
    </div>
  );
}

function StarterGrid() {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {STARTERS.map((starter) => (
        <DashCard key={starter.title} className="flex items-start gap-3 p-4">
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-[#2563EB]/10 to-[#7C3AED]/15 text-[#7C3AED]">
            <starter.icon className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-[oklch(0.25_0.02_265)]">{starter.title}</p>
            <p className="mt-0.5 text-xs leading-relaxed text-[oklch(0.5_0.02_265)]">
              {starter.body}
            </p>
            <Link
              to={starter.to}
              className="mt-1.5 inline-block text-xs font-medium text-[#2563EB] hover:underline"
            >
              {starter.cta} →
            </Link>
          </div>
        </DashCard>
      ))}
    </div>
  );
}

function AIHubPage() {
  const { items, isLoading, isError } = useAIActivity();
  const [filter, setFilter] = useState<Filter>("all");

  const counts = useMemo(() => {
    const next = { all: items.length } as Record<Filter, number>;
    for (const capability of HUB_CAPABILITIES) {
      next[capability] = items.filter((item) => item.capability === capability).length;
    }
    return next;
  }, [items]);

  const visible = useMemo(
    () => (filter === "all" ? items : items.filter((item) => item.capability === filter)),
    [items, filter],
  );

  return (
    <AIPage>
      <StickyPageHeader>
        <PageHeader
          eyebrow="AI"
          title="AI Hub"
          subtitle="Everything you've run, and what it cost."
          actions={<CreditsLine />}
        />
        {items.length > 0 && <FilterTabs value={filter} onChange={setFilter} counts={counts} />}
      </StickyPageHeader>

      {isLoading ? (
        <div className="flex items-center gap-2 py-16 text-sm text-[oklch(0.5_0.02_265)]">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading your AI activity…
        </div>
      ) : isError ? (
        <EmptyState
          icon={AlertCircle}
          title="Couldn't load your AI activity"
          body="Something went wrong fetching it. Refresh the page to try again."
        />
      ) : items.length === 0 ? (
        <div className="space-y-4">
          <EmptyState
            icon={Sparkles}
            title="No AI activity yet"
            body="Everything you generate — match scores, ATS checks, optimizations and cover letters — shows up here with what it cost and a way back to it."
          />
          <StarterGrid />
        </div>
      ) : visible.length === 0 ? (
        <EmptyState
          icon={Activity}
          title="Nothing here yet"
          body="You haven't run this one recently. Switch to All to see the rest of your activity."
        />
      ) : (
        <DashCard padded={false} className="overflow-hidden">
          <ul className="divide-y divide-black/5">
            {visible.map((item) => (
              <AIActivityRow key={item.id} item={item} />
            ))}
          </ul>
        </DashCard>
      )}
    </AIPage>
  );
}
