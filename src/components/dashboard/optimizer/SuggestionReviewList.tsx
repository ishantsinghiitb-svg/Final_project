import { CheckCheck, FileText, ClipboardList, Sparkles, X } from "lucide-react";
import { DashCard, EmptyState } from "@/components/dashboard/primitives";
import { cn } from "@/lib/utils";
import type { OptimizationSuggestion, SuggestionDecision } from "@/features/optimizer/types";
import { SuggestionCard } from "./SuggestionCard";

// ── SuggestionReviewList (Module 6D; 6E AI-quality pass) ──
//
// The review workspace, framed as a PRIORITIZED improvement plan: the
// recruiter-style audit verdict, a controls row (Accept all / Reject all + live
// progress), then the suggestions grouped into priority tiers (Top priority →
// High impact → Recommended → Nice to have) derived from each suggestion's
// impact `severity`, most impactful first. So a user works the list top-down
// instead of scanning a flat wall. Save lives in the page's sticky action bar,
// which reads the same accepted set.

const SEVERITY_TIERS: {
  severity: OptimizationSuggestion["severity"];
  label: string;
  dot: string;
}[] = [
  { severity: "critical", label: "Top priority", dot: "bg-[#E11D48]" },
  { severity: "high", label: "High impact", dot: "bg-[#F59E0B]" },
  { severity: "medium", label: "Recommended", dot: "bg-[#2563EB]" },
  { severity: "low", label: "Nice to have", dot: "bg-[#16A34A]" },
];

type Props = {
  suggestions: OptimizationSuggestion[];
  decisions: Record<string, SuggestionDecision>;
  auditSummary: string;
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
  auditSummary,
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
      <div className="space-y-4">
        {auditSummary && <AuditCard auditSummary={auditSummary} />}
        <EmptyState
          icon={FileText}
          title="No changes suggested"
          body="Your resume already reads well for this selection, so there were no safe improvements to make. Try a different career target or section."
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {(auditSummary || summary) && <AuditCard auditSummary={auditSummary || summary} />}

      <div className="sticky top-15 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-black/5 bg-white/95 px-4 py-3 shadow-[0_1px_2px_rgba(0,0,0,0.03)] backdrop-blur">
        <div className="flex items-center gap-2 text-sm text-[oklch(0.45_0.02_265)]">
          <ClipboardList className="h-4 w-4 text-[#7C3AED]" />
          <span>
            <span className="font-semibold text-[oklch(0.25_0.02_265)]">{accepted}</span> accepted ·{" "}
            <span className="font-medium text-[oklch(0.35_0.02_265)]">{reviewed}</span>/{total}{" "}
            reviewed
          </span>
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

      <div className="space-y-5">
        {SEVERITY_TIERS.map(({ severity, label, dot }) => {
          const group = suggestions.filter((s) => s.severity === severity);
          if (group.length === 0) return null;
          return (
            <div key={severity}>
              <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-[oklch(0.45_0.02_265)]">
                <span className={cn("h-2 w-2 rounded-full", dot)} />
                {label}
                <span className="text-[oklch(0.6_0.02_265)]">({group.length})</span>
              </p>
              <div className="space-y-2.5">
                {group.map((s) => (
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
        })}
      </div>
    </div>
  );
}

function AuditCard({ auditSummary }: { auditSummary: string }) {
  return (
    <DashCard className="border-[#2563EB]/15 bg-gradient-to-br from-[#2563EB]/[0.04] to-[#7C3AED]/[0.05]">
      <div className="flex gap-2.5">
        <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-[#7C3AED]" />
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-[#7C3AED]">
            Reviewer's verdict
          </p>
          <p className="mt-1 text-sm leading-relaxed text-[oklch(0.32_0.02_265)]">{auditSummary}</p>
        </div>
      </div>
    </DashCard>
  );
}
