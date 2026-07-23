import { CheckCheck, Sparkles, X } from "lucide-react";
import { DashCard, EmptyState } from "@/components/dashboard/primitives";
import { FileText } from "lucide-react";
import type { OptimizationSuggestion, SuggestionDecision } from "@/features/optimizer/types";
import { SuggestionCard } from "./SuggestionCard";

// ── SuggestionReviewList (Module 6D) ──
//
// The review workspace: the AI's overall note, a controls row (Accept all /
// Reject all + live progress), and the list of Current → Suggested → Reason
// cards. Save lives in the page's sticky action bar, which reads the same
// accepted set.

type Props = {
  suggestions: OptimizationSuggestion[];
  decisions: Record<string, SuggestionDecision>;
  summary: string;
  onAccept: (id: string) => void;
  onReject: (id: string) => void;
  onUndo: (id: string) => void;
  onAcceptAll: () => void;
  onRejectAll: () => void;
};

export function SuggestionReviewList({
  suggestions,
  decisions,
  summary,
  onAccept,
  onReject,
  onUndo,
  onAcceptAll,
  onRejectAll,
}: Props) {
  const total = suggestions.length;
  const accepted = suggestions.filter((s) => decisions[s.id] === "accepted").length;
  const reviewed = suggestions.filter((s) => decisions[s.id] !== "pending").length;

  if (total === 0) {
    return (
      <EmptyState
        icon={FileText}
        title="No changes suggested"
        body="Your resume already reads well for this selection, so there were no safe improvements to make. Try a different category or section."
      />
    );
  }

  return (
    <div className="space-y-4">
      {summary && (
        <DashCard className="border-[#2563EB]/15 bg-gradient-to-br from-[#2563EB]/[0.04] to-[#7C3AED]/[0.05]">
          <div className="flex gap-2.5">
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-[#7C3AED]" />
            <p className="text-sm leading-relaxed text-[oklch(0.35_0.02_265)]">{summary}</p>
          </div>
        </DashCard>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-black/5 bg-white px-4 py-3">
        <div className="text-sm text-[oklch(0.45_0.02_265)]">
          <span className="font-semibold text-[oklch(0.25_0.02_265)]">{accepted}</span> accepted ·{" "}
          <span className="font-medium text-[oklch(0.35_0.02_265)]">{reviewed}</span>/{total}{" "}
          reviewed
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onRejectAll}
            className="inline-flex items-center gap-1.5 rounded-lg border border-black/10 bg-white px-3 py-1.5 text-xs font-medium text-[oklch(0.4_0.02_265)] transition-colors hover:bg-black/[0.03]"
          >
            <X className="h-3.5 w-3.5" /> Reject all
          </button>
          <button
            onClick={onAcceptAll}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#16A34A]/25 bg-[#22C55E]/10 px-3 py-1.5 text-xs font-semibold text-[#16A34A] transition-colors hover:bg-[#22C55E]/15"
          >
            <CheckCheck className="h-3.5 w-3.5" /> Accept all
          </button>
        </div>
      </div>

      <div className="space-y-3">
        {suggestions.map((s) => (
          <SuggestionCard
            key={s.id}
            suggestion={s}
            decision={decisions[s.id] ?? "pending"}
            onAccept={() => onAccept(s.id)}
            onReject={() => onReject(s.id)}
            onUndo={() => onUndo(s.id)}
          />
        ))}
      </div>
    </div>
  );
}
