import { Target } from "lucide-react";
import { COMPETENCY_LABELS } from "@/features/mock-interview/constants";
import type { MockInterviewReportContent } from "@/features/mock-interview/types";
import { CollapsibleSection } from "./CollapsibleSection";

function barTone(score: number): string {
  if (score >= 70) return "bg-[#22C55E]";
  if (score >= 45) return "bg-[#2563EB]";
  return "bg-[#F43F5E]";
}

export function CompetencyScoreList({
  scores,
  onCite,
}: {
  scores: MockInterviewReportContent["competencyScores"];
  onCite: (turnIndex: number) => void;
}) {
  return (
    <CollapsibleSection
      icon={Target}
      title="Competency Scores"
      meta={scores.length > 0 ? `${scores.length} evaluated` : undefined}
      defaultOpen
    >
      {scores.length === 0 ? (
        // `scores` has no minimum-length guarantee (the schema falls back to
        // [] on any validation issue with this field) — a report missing its
        // own scoring section without explanation reads as broken, not empty.
        <p className="text-sm text-[oklch(0.5_0.02_265)]">
          No competency scores were generated for this session.
        </p>
      ) : (
        <div className="space-y-3">
          {scores.map((s) => (
            <div key={s.competencyId}>
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-[oklch(0.25_0.02_265)]">
                  {COMPETENCY_LABELS[s.competencyId] ?? s.label ?? s.competencyId}
                </span>
                <span className="text-[oklch(0.45_0.02_265)]">{s.score}/100</span>
              </div>
              <div className="mt-1 h-1.5 w-full rounded-full bg-black/[0.06]">
                <div
                  className={`h-full rounded-full ${barTone(s.score)}`}
                  style={{ width: `${s.score}%` }}
                />
              </div>
              {s.evidence && (
                <p className="mt-1 text-xs text-[oklch(0.5_0.02_265)]">{s.evidence}</p>
              )}
              {s.turnIndexes.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {s.turnIndexes.map((t) => (
                    <button
                      key={t}
                      onClick={() => onCite(t)}
                      className="rounded-full bg-black/[0.04] px-1.5 py-0.5 text-[10px] font-medium text-[oklch(0.45_0.02_265)] hover:bg-black/[0.08]"
                    >
                      Q{t + 1}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </CollapsibleSection>
  );
}
