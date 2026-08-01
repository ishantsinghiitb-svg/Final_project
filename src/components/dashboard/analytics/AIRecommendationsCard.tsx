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
} from "lucide-react";
import { DashCard, SectionTitle } from "@/components/dashboard/primitives";
import { AIThinkingInline } from "@/components/dashboard/ai/AIThinking";
import { AI_CAPABILITIES } from "@/features/ai/constants";
import { useAIRecommendations } from "@/features/recommendations/hooks";
import type {
  RecommendationCandidateType,
  RecommendationItem,
} from "@/features/recommendations/types";

// ── AI Recommendations card (Module 8B) ──
//
// Replaces the old "What This Means" card (ActionSummaryCard). Every number
// and name shown here is backed by real stored data — see
// server/ai/RecommendationsService.ts and features/recommendations/candidates.ts
// for the deterministic evidence rules that decide what (if anything) shows.

const TYPE_ICON: Record<RecommendationCandidateType, LucideIcon> = {
  resume_performance: FileText,
  stale_applications: Briefcase,
  interview_prep: CalendarClock,
  mock_interview: Sparkles,
  goal_progress: Target,
  ats_improvement: Award,
  resume_linking: Link2,
};

export function AIRecommendationsCard() {
  const { data, isLoading, isError } = useAIRecommendations();

  return (
    <DashCard>
      <div className="flex items-baseline justify-between gap-2">
        <SectionTitle>AI Recommendations</SectionTitle>
        {data?.ok && (
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
      ) : data.items.length === 0 ? (
        <div className="mt-3 rounded-xl border border-black/5 bg-[oklch(0.98_0.005_265)] p-4">
          <p className="text-sm font-medium text-[oklch(0.25_0.02_265)]">
            We need a little more data
          </p>
          <p className="mt-1 text-sm text-[oklch(0.5_0.02_265)]">
            Continue applying to jobs, preparing for interviews, and using NextOffer. We'll generate
            personalized recommendations once there's enough reliable data.
          </p>
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          {data.items.map((item) => (
            <RecommendationRow key={item.type} item={item} />
          ))}
        </div>
      )}
    </DashCard>
  );
}

function RecommendationRow({ item }: { item: RecommendationItem }) {
  const Icon = TYPE_ICON[item.type];
  return (
    <div className="rounded-xl border border-black/5 bg-[oklch(0.98_0.005_265)] p-3">
      <div className="flex items-start gap-2.5">
        <div className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-[#2563EB]/10 to-[#7C3AED]/15 text-[#7C3AED]">
          <Icon className="h-3.5 w-3.5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-[oklch(0.2_0.02_265)]">{item.title}</p>
          <p className="mt-0.5 line-clamp-2 text-[13px] leading-snug text-[oklch(0.4_0.02_265)]">
            {item.explanation}
          </p>
          <p className="mt-1 truncate text-[13px]">
            <span className="font-medium text-[#2563EB]">Action: </span>
            <span className="text-[oklch(0.3_0.02_265)]">{item.action}</span>
          </p>
        </div>
      </div>
    </div>
  );
}
