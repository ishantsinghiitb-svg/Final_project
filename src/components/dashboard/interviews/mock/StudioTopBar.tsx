import { Pause, X } from "lucide-react";
import { COMPETENCY_LABELS } from "@/features/mock-interview/constants";
import type { CoverageEntry, MockInterviewPlanContent } from "@/features/mock-interview/types";
import { CoverageRail } from "./CoverageRail";

// ── StudioTopBar (Module 7C) ──
//
// Progress + timer + pause, always visible during a live interview. Shows
// coverage, never a score — see CoverageRail. "Covering: X" names the current
// competency so the candidate has SOME sense of where the interview is, but
// the interviewer's own reasoning stays entirely hidden.

export function StudioTopBar({
  companyName,
  roundLabel,
  elapsedDisplay,
  plan,
  coverage,
  currentCompetencyId,
  onPause,
  isPausing,
  onEnd,
}: {
  companyName: string;
  roundLabel: string | null;
  elapsedDisplay: string;
  plan: MockInterviewPlanContent | null;
  coverage: CoverageEntry[];
  currentCompetencyId: string | null;
  onPause: () => void;
  isPausing: boolean;
  onEnd: () => void;
}) {
  const currentLabel = currentCompetencyId
    ? (COMPETENCY_LABELS[currentCompetencyId as keyof typeof COMPETENCY_LABELS] ??
      currentCompetencyId)
    : null;

  return (
    <div className="border-b border-white/10 bg-[oklch(0.14_0.02_265)] px-4 py-3 md:px-6">
      <div className="mx-auto flex max-w-4xl items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <button
            onClick={onPause}
            disabled={isPausing}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs font-medium text-white/80 transition-colors hover:bg-white/10 disabled:opacity-50"
          >
            <Pause className="h-3.5 w-3.5" /> Pause
          </button>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-white">
              {roundLabel ? `${roundLabel} · ` : ""}
              {companyName}
            </p>
            {currentLabel && (
              <p className="truncate text-xs text-white/50">Covering: {currentLabel}</p>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <span className="font-mono text-sm text-white/70">{elapsedDisplay}</span>
          <button
            onClick={onEnd}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs font-medium text-white/80 transition-colors hover:bg-[#F43F5E]/20 hover:text-[#FDA4AF]"
          >
            <X className="h-3.5 w-3.5" /> End
          </button>
        </div>
      </div>

      {plan && plan.competencyMap.length > 0 && (
        <div className="mx-auto mt-2.5 max-w-4xl">
          <CoverageRail
            competencyMap={plan.competencyMap}
            coverage={coverage}
            currentCompetencyId={currentCompetencyId}
          />
        </div>
      )}
    </div>
  );
}
