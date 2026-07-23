import { ArrowDown, Check, RotateCcw, Sparkles, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { OptimizationSuggestion, SuggestionDecision } from "@/features/optimizer/types";
import { sectionLabel } from "@/features/optimizer/constants";

// ── SuggestionCard (Module 6D) ──
//
// One reviewable change: Current → Suggested → Reason, with Accept / Reject and
// an Undo once decided. Nothing is ever applied automatically — a card only
// changes the composed resume once the user accepts it. The left accent + tint
// reflect the decision so a long list stays scannable.

const CHANGE_LABELS: Record<string, string> = {
  impact: "Impact",
  action_verb: "Stronger verb",
  quantify: "Quantify",
  clarity: "Clarity",
  keyword: "Keyword",
  grammar: "Grammar",
  tone: "Tone",
  structure: "Structure",
  concise: "Concise",
};

type Props = {
  suggestion: OptimizationSuggestion;
  decision: SuggestionDecision;
  onAccept: () => void;
  onReject: () => void;
  onUndo: () => void;
};

export function SuggestionCard({ suggestion, decision, onAccept, onReject, onUndo }: Props) {
  const accent =
    decision === "accepted"
      ? "border-l-[#16A34A]"
      : decision === "rejected"
        ? "border-l-[#E11D48]"
        : "border-l-[#2563EB]";

  const label = suggestion.target?.trim() || sectionLabel(suggestion.section);

  return (
    <div
      className={cn(
        "rounded-2xl border border-black/5 border-l-[3px] bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.03)] transition-colors",
        accent,
        decision === "rejected" && "opacity-70",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="inline-flex items-center gap-1 rounded-full bg-[#7C3AED]/10 px-2 py-0.5 text-[11px] font-medium text-[#7C3AED]">
              <Sparkles className="h-3 w-3" />
              {CHANGE_LABELS[suggestion.changeType] ?? "Improve"}
            </span>
            <span className="truncate text-xs font-medium text-[oklch(0.45_0.02_265)]">
              {label}
            </span>
          </div>
        </div>

        {decision === "pending" ? (
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              onClick={onReject}
              className="inline-flex items-center gap-1 rounded-lg border border-black/10 bg-white px-2.5 py-1.5 text-xs font-medium text-[oklch(0.4_0.02_265)] transition-colors hover:border-[#E11D48]/30 hover:bg-[#E11D48]/[0.04] hover:text-[#E11D48]"
            >
              <X className="h-3.5 w-3.5" /> Reject
            </button>
            <button
              onClick={onAccept}
              className="inline-flex items-center gap-1 rounded-lg bg-[#16A34A] px-2.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[#15803D]"
            >
              <Check className="h-3.5 w-3.5" /> Accept
            </button>
          </div>
        ) : (
          <div className="flex shrink-0 items-center gap-2">
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
                decision === "accepted"
                  ? "bg-[#22C55E]/15 text-[#16A34A]"
                  : "bg-[#F43F5E]/10 text-[#E11D48]",
              )}
            >
              {decision === "accepted" ? (
                <>
                  <Check className="h-3 w-3" /> Accepted
                </>
              ) : (
                <>
                  <X className="h-3 w-3" /> Rejected
                </>
              )}
            </span>
            <button
              onClick={onUndo}
              aria-label="Undo"
              className="inline-flex items-center gap-1 rounded-lg border border-black/10 bg-white px-2 py-1.5 text-xs font-medium text-[oklch(0.45_0.02_265)] transition-colors hover:bg-black/[0.03]"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Undo
            </button>
          </div>
        )}
      </div>

      <div className="mt-3 space-y-2">
        <div className="rounded-xl border border-[#F43F5E]/15 bg-[#F43F5E]/[0.04] px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#E11D48]/80">
            Current
          </p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-[oklch(0.4_0.02_265)]">
            {suggestion.current}
          </p>
        </div>

        <div className="flex justify-center">
          <ArrowDown className="h-3.5 w-3.5 text-[oklch(0.6_0.02_265)]" />
        </div>

        <div className="rounded-xl border border-[#22C55E]/20 bg-[#22C55E]/[0.06] px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#16A34A]">
            Suggested
          </p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-[oklch(0.25_0.02_265)]">
            {suggestion.suggested}
          </p>
        </div>
      </div>

      {suggestion.reason && (
        <p className="mt-2.5 text-xs leading-relaxed text-[oklch(0.5_0.02_265)]">
          <span className="font-semibold text-[oklch(0.4_0.02_265)]">Why: </span>
          {suggestion.reason}
        </p>
      )}
    </div>
  );
}
