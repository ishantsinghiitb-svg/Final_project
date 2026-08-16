import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { formatDistanceToNow } from "date-fns";
import {
  Award,
  Briefcase,
  CalendarClock,
  FileText,
  Link2,
  Sparkles,
  Target,
  type LucideIcon,
  ArrowRight,
} from "lucide-react";
import { DashCard, SectionTitle } from "@/components/dashboard/primitives";
import { AIThinkingInline } from "@/components/dashboard/ai/AIThinking";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { AI_CAPABILITIES } from "@/features/ai/constants";
import { useAIRecommendations } from "@/features/recommendations/hooks";
import type {
  RecommendationCandidateType,
  RecommendationItem,
} from "@/features/recommendations/types";

// ── AI Recommendations card (Module 8B, polished in Module 8's final pass) ──
//
// Replaces the old "What This Means" card (ActionSummaryCard). Every number
// and name shown here is backed by real stored data — see
// server/ai/RecommendationsService.ts and features/recommendations/candidates.ts
// for the deterministic evidence rules that decide what (if anything) shows.
// The engine itself never caps how many qualify (see candidates.ts) — this
// component is where the "top 3 inline, rest behind Show all" split lives.

const VISIBLE_COUNT = 3;

const TYPE_ICON: Record<RecommendationCandidateType, LucideIcon> = {
  resume_performance: FileText,
  stale_applications: Briefcase,
  interview_prep: CalendarClock,
  mock_interview: Sparkles,
  goal_progress: Target,
  ats_improvement: Award,
  resume_linking: Link2,
};

/** Generic, existing routes only — recommendations don't carry a specific entity id to deep-link to. */
const TYPE_CTA: Record<RecommendationCandidateType, { label: string; to: string }> = {
  resume_performance: { label: "View Resumes", to: "/dashboard/resumes" },
  stale_applications: { label: "View Applications", to: "/dashboard/applications" },
  interview_prep: { label: "Start Interview Prep", to: "/dashboard/interviews" },
  mock_interview: { label: "Start Mock Interview", to: "/dashboard/interviews" },
  goal_progress: { label: "View Applications", to: "/dashboard/applications" },
  ats_improvement: { label: "View Resumes", to: "/dashboard/resumes" },
  resume_linking: { label: "View Applications", to: "/dashboard/applications" },
};

export function AIRecommendationsCard({ className }: { className?: string }) {
  const { data, isLoading, isError } = useAIRecommendations();
  const [showAll, setShowAll] = useState(false);

  const items = data?.ok ? data.items : [];
  const visible = items.slice(0, VISIBLE_COUNT);
  const overflow = items.slice(VISIBLE_COUNT);

  return (
    <DashCard className={cn("flex flex-col", className)}>
      <div className="flex items-baseline justify-between gap-2">
        <SectionTitle>AI Recommendations</SectionTitle>
        {data?.ok && items.length > 0 && (
          <span className="text-[11px] text-[oklch(0.55_0.02_265)]">
            Updated {formatDistanceToNow(new Date(data.generatedAt), { addSuffix: true })}
          </span>
        )}
      </div>

      {isLoading ? (
        <div className="mt-4">
          <AIThinkingInline capability={AI_CAPABILITIES.RECOMMENDATIONS} />
        </div>
      ) : isError || !data || !data.ok ? (
        <p className="mt-3 text-sm text-[oklch(0.45_0.02_265)]">
          Couldn't load recommendations right now. Try refreshing the page.
        </p>
      ) : items.length === 0 ? (
        <div className="mt-3 rounded-xl border border-black/5 bg-[oklch(0.98_0.005_265)] p-4">
          <p className="text-sm font-medium text-[oklch(0.25_0.02_265)]">
            We need a little more data
          </p>
          <p className="mt-1 text-sm text-[oklch(0.5_0.02_265)]">
            Continue applying to jobs, preparing for interviews, and using OfferLyst. We'll generate
            personalized recommendations once there's enough reliable data.
          </p>
        </div>
      ) : (
        <>
          <div className="mt-3 space-y-2 pb-3">
            {visible.map((item) => (
              <RecommendationRow key={item.type} item={item} />
            ))}
          </div>

          {/* mt-auto pins this to the bottom of the card (the card is a flex
              column and gets h-full from the page), so it reads as a footer
              control instead of floating in the middle of leftover space. */}
          {overflow.length > 0 && (
            <div className="mt-auto border-t border-black/5 pt-2.5">
              <button
                onClick={() => setShowAll(true)}
                className="text-xs font-medium text-[#2563EB] hover:underline"
              >
                Show all ({items.length})
              </button>
            </div>
          )}

          <Dialog open={showAll} onOpenChange={setShowAll}>
            <DialogContent className="max-h-[80vh] max-w-lg overflow-y-auto">
              <DialogHeader>
                <DialogTitle>All recommendations</DialogTitle>
              </DialogHeader>
              <div className="space-y-2">
                {overflow.map((item) => (
                  <RecommendationRow key={item.type} item={item} />
                ))}
              </div>
            </DialogContent>
          </Dialog>
        </>
      )}
    </DashCard>
  );
}

function RecommendationRow({ item }: { item: RecommendationItem }) {
  const Icon = TYPE_ICON[item.type];
  const cta = TYPE_CTA[item.type];
  return (
    <div className="rounded-xl border border-black/5 bg-[oklch(0.98_0.005_265)] p-3">
      <div className="flex items-start gap-2.5">
        <div className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-[#2563EB]/10 to-[#7C3AED]/15 text-[#7C3AED]">
          <Icon className="h-3.5 w-3.5" />
        </div>
        {/* Status first, then one line of why it matters, then a single CTA.
            The row used to show the title, a two-line explanation AND a
            separate "Action: …" sentence that repeated what the CTA button
            already said, which is what made the card read as three paragraphs
            per item. When there is a CTA the button carries the instruction;
            the sentence is only rendered when there is nothing to link to. */}
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold leading-snug text-[oklch(0.2_0.02_265)]">
            {item.title}
          </p>
          <p className="mt-0.5 line-clamp-2 text-xs leading-snug text-[oklch(0.45_0.02_265)]">
            {item.explanation}
          </p>
          {cta ? (
            <Link
              to={cta.to}
              className="mt-2 inline-flex items-center gap-1 rounded-lg bg-[#2563EB]/10 px-2 py-1 text-[11px] font-medium text-[#2563EB] transition-colors hover:bg-[#2563EB]/15"
            >
              {cta.label}
              <ArrowRight className="h-3 w-3" />
            </Link>
          ) : (
            <p className="mt-1.5 line-clamp-2 text-xs text-[oklch(0.3_0.02_265)]">{item.action}</p>
          )}
        </div>
      </div>
    </div>
  );
}
