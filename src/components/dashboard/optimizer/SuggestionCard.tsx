import { useState } from "react";
import {
  ArrowDown,
  ArrowRightLeft,
  ArrowUp,
  Check,
  ChevronDown,
  Lightbulb,
  Pencil,
  Plus,
  RotateCcw,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { OptimizationSuggestion, SuggestionDecision } from "@/features/optimizer/types";
import { sectionLabel } from "@/features/optimizer/constants";

// ── SuggestionCard (Module 6D; 6E AI-quality pass) ──
//
// One reviewable change, framed as an action (What) with Why / How / Benefit
// and an optional Example behind a toggle — an improvement-plan item, not a
// severity-tagged issue. The diff shape adapts to the suggestion's `kind`
// (rewrite/replace/add/remove/move/rename/…). Once decided, the card collapses
// to a compact one-line row so a long, reviewed list stays lightweight.

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
  readability: "Readability",
  summary_quality: "Summary",
  headline: "Headline",
  positioning: "Positioning",
  narrative: "Narrative",
  product_thinking: "Product thinking",
  customer_focus: "Customer focus",
  ownership: "Ownership",
  metrics: "Metrics",
  business_impact: "Business impact",
  technical_depth: "Technical depth",
  leadership: "Leadership",
  collaboration: "Collaboration",
  prioritization: "Prioritization",
  experimentation: "Experimentation",
  project_description: "Project",
  skills_organization: "Skills",
  section_order: "Ordering",
  formatting: "Formatting",
  ats_friendliness: "ATS",
  duplicate_removal: "Duplicate",
  relevance: "Relevance",
  missing_info: "Missing info",
};

const KIND_META: Record<
  OptimizationSuggestion["kind"],
  { icon: React.ComponentType<{ className?: string }>; label: string }
> = {
  rewrite: { icon: Sparkles, label: "Rewrite" },
  replace: { icon: Sparkles, label: "Replace" },
  add: { icon: Plus, label: "Add" },
  remove: { icon: Trash2, label: "Remove" },
  merge: { icon: Sparkles, label: "Merge" },
  split: { icon: Sparkles, label: "Split" },
  move: { icon: ArrowRightLeft, label: "Move" },
  reorder: { icon: ArrowRightLeft, label: "Reorder" },
  rename: { icon: Pencil, label: "Rename" },
  highlight: { icon: Sparkles, label: "Highlight" },
  compress: { icon: Sparkles, label: "Compress" },
  expand: { icon: Sparkles, label: "Expand" },
  promote: { icon: ArrowUp, label: "Promote" },
  demote: { icon: ArrowDown, label: "Demote" },
  restructure: { icon: Sparkles, label: "Restructure" },
};

const MOVE_KINDS = new Set<OptimizationSuggestion["kind"]>([
  "move",
  "reorder",
  "promote",
  "demote",
]);
const REPLACE_KINDS = new Set<OptimizationSuggestion["kind"]>([
  "rewrite",
  "replace",
  "merge",
  "split",
  "highlight",
  "compress",
  "expand",
  "restructure",
]);

type Props = {
  suggestion: OptimizationSuggestion;
  decision: SuggestionDecision;
  onAccept: () => void;
  onReject: () => void;
  onUndo: () => void;
};

export function SuggestionCard({ suggestion, decision, onAccept, onReject, onUndo }: Props) {
  const [showExample, setShowExample] = useState(false);
  const kindMeta = KIND_META[suggestion.kind] ?? KIND_META.rewrite;
  const where = suggestion.target?.trim() || sectionLabel(suggestion.section);
  const headline = suggestion.action?.trim() || where;

  // ── Decided: compact row ──
  if (decision !== "pending") {
    const isAccepted = decision === "accepted";
    return (
      <div
        className={cn(
          "flex items-center gap-3 rounded-xl border border-l-[3px] bg-white px-3.5 py-2.5 transition-all",
          isAccepted
            ? "border-l-[#16A34A] border-black/5"
            : "border-l-black/10 border-black/5 opacity-60",
        )}
      >
        <span
          className={cn(
            "grid h-6 w-6 shrink-0 place-items-center rounded-full",
            isAccepted
              ? "bg-[#22C55E]/15 text-[#16A34A]"
              : "bg-black/[0.05] text-[oklch(0.5_0.02_265)]",
          )}
        >
          {isAccepted ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm text-[oklch(0.35_0.02_265)]">
            <span className="font-medium">{headline}</span>
            <span className="text-[oklch(0.55_0.02_265)]"> · {where}</span>
          </p>
        </div>
        <button
          onClick={onUndo}
          className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-black/10 bg-white px-2 py-1 text-xs font-medium text-[oklch(0.45_0.02_265)] transition-colors hover:bg-black/[0.03]"
        >
          <RotateCcw className="h-3.5 w-3.5" /> Undo
        </button>
      </div>
    );
  }

  // ── Pending: full card ──
  return (
    <div className="rounded-2xl border border-l-[3px] border-black/5 border-l-[#2563EB] bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.03)] transition-all">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="inline-flex items-center gap-1 rounded-full bg-[#7C3AED]/10 px-2 py-0.5 text-[11px] font-medium text-[#7C3AED]">
              <kindMeta.icon className="h-3 w-3" />
              {kindMeta.label}
            </span>
            <span className="rounded-full bg-black/[0.04] px-2 py-0.5 text-[11px] font-medium text-[oklch(0.4_0.02_265)]">
              {CHANGE_LABELS[suggestion.changeType] ?? "Improve"}
            </span>
            <span className="truncate text-[11px] text-[oklch(0.55_0.02_265)]">{where}</span>
          </div>
          <p className="mt-1.5 text-sm font-semibold text-[oklch(0.22_0.02_265)]">{headline}</p>
        </div>

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
      </div>

      <div className="mt-3 space-y-2">
        <SuggestionDiff suggestion={suggestion} />
      </div>

      <div className="mt-2.5 space-y-1.5">
        {suggestion.reason && (
          <p className="text-xs leading-relaxed text-[oklch(0.5_0.02_265)]">
            <span className="font-semibold text-[oklch(0.4_0.02_265)]">Why: </span>
            {suggestion.reason}
          </p>
        )}
        {suggestion.how && (
          <p className="text-xs leading-relaxed text-[oklch(0.5_0.02_265)]">
            <span className="font-semibold text-[oklch(0.4_0.02_265)]">How: </span>
            {suggestion.how}
          </p>
        )}
        {suggestion.benefit && (
          <p className="flex items-start gap-1.5 text-xs leading-relaxed text-[oklch(0.45_0.02_265)]">
            <Lightbulb className="mt-0.5 h-3 w-3 shrink-0 text-[#F59E0B]" />
            {suggestion.benefit}
          </p>
        )}
        {suggestion.example && (
          <div>
            <button
              onClick={() => setShowExample((v) => !v)}
              className="inline-flex items-center gap-1 text-xs font-medium text-[#2563EB] hover:underline"
            >
              <ChevronDown
                className={cn("h-3 w-3 transition-transform", showExample && "rotate-180")}
              />
              {showExample ? "Hide example" : "Show example"}
            </button>
            {showExample && (
              <div className="mt-1 rounded-lg bg-black/[0.02] px-2.5 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[oklch(0.55_0.02_265)]">
                  Illustrative example
                </p>
                <p className="mt-0.5 text-xs italic leading-relaxed text-[oklch(0.4_0.02_265)]">
                  {suggestion.example}
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** The Current/Suggested diff area, shaped by the suggestion's `kind`. */
function SuggestionDiff({ suggestion }: { suggestion: OptimizationSuggestion }) {
  if (MOVE_KINDS.has(suggestion.kind)) {
    const anchor = suggestion.beforeSection
      ? `before ${suggestion.beforeSection}`
      : suggestion.kind === "demote"
        ? "lower"
        : suggestion.kind === "promote"
          ? "higher"
          : "to the top";
    return (
      <div className="flex items-center gap-2 rounded-xl border border-[#2563EB]/15 bg-[#2563EB]/[0.04] px-3 py-2.5 text-sm text-[oklch(0.3_0.02_265)]">
        <ArrowRightLeft className="h-4 w-4 shrink-0 text-[#2563EB]" />
        <span>
          Move <span className="font-medium">{suggestion.moveSection}</span> {anchor}
        </span>
      </div>
    );
  }

  if (suggestion.kind === "rename") {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-[#2563EB]/15 bg-[#2563EB]/[0.04] px-3 py-2.5 text-sm text-[oklch(0.3_0.02_265)]">
        <Pencil className="h-4 w-4 shrink-0 text-[#2563EB]" />
        <span>
          Rename <span className="font-medium">{suggestion.current || suggestion.target}</span> →{" "}
          <span className="font-medium">{suggestion.renameTo}</span>
        </span>
      </div>
    );
  }

  if (suggestion.kind === "add") {
    return (
      <div className="rounded-xl border border-[#22C55E]/20 bg-[#22C55E]/[0.06] px-3 py-2">
        <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#16A34A]">
          <Plus className="h-3 w-3" /> New addition
        </p>
        <p className="mt-1 whitespace-pre-wrap text-sm text-[oklch(0.25_0.02_265)]">
          {suggestion.suggested}
        </p>
      </div>
    );
  }

  if (suggestion.kind === "remove") {
    return (
      <div className="rounded-xl border border-[#F43F5E]/15 bg-[#F43F5E]/[0.04] px-3 py-2">
        <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#E11D48]/80">
          <Trash2 className="h-3 w-3" /> Remove
        </p>
        <p className="mt-1 whitespace-pre-wrap text-sm text-[oklch(0.4_0.02_265)] line-through decoration-[#E11D48]/40">
          {suggestion.removeSection || suggestion.current}
        </p>
      </div>
    );
  }

  // replace-like kinds: show Current → Suggested when both present.
  const showCurrent = REPLACE_KINDS.has(suggestion.kind) && suggestion.current.trim().length > 0;
  return (
    <>
      {showCurrent && (
        <>
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
        </>
      )}
      <div className="rounded-xl border border-[#22C55E]/20 bg-[#22C55E]/[0.06] px-3 py-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#16A34A]">
          Suggested
        </p>
        <p className="mt-1 whitespace-pre-wrap text-sm text-[oklch(0.25_0.02_265)]">
          {suggestion.suggested}
        </p>
      </div>
    </>
  );
}
