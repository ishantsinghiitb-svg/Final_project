import { COMPETENCY_LABELS } from "@/features/mock-interview/constants";
import type { CompetencyMapEntry, CoverageEntry } from "@/features/mock-interview/types";
import { cn } from "@/lib/utils";

// ── CoverageRail (Module 7C) ──
//
// Shows COVERAGE, never judgment — a segment per planned competency, colored
// by whether it's been reached yet. Deliberately no percentage-complete
// number and no per-answer signal: the product decision is that live
// evaluation stays completely hidden, and a progress percentage here would
// read as a disguised score.

export function CoverageRail({
  competencyMap,
  coverage,
  currentCompetencyId,
}: {
  competencyMap: CompetencyMapEntry[];
  coverage: CoverageEntry[];
  currentCompetencyId: string | null;
}) {
  if (competencyMap.length === 0) return null;
  const core = competencyMap.filter((c) => c.priority === "core");
  const list = core.length > 0 ? core : competencyMap;

  return (
    <div className="flex items-center gap-1">
      {list.map((c) => {
        const status = coverage.find((e) => e.competencyId === c.id)?.status ?? "not_started";
        const isCurrent = c.id === currentCompetencyId;
        return (
          <span
            key={c.id}
            title={COMPETENCY_LABELS[c.id] ?? c.id}
            className={cn(
              "h-1.5 flex-1 rounded-full transition-colors",
              status === "covered"
                ? "bg-[#22C55E]"
                : status === "in_progress" || isCurrent
                  ? "bg-[#2563EB]"
                  : "bg-black/[0.08]",
            )}
          />
        );
      })}
    </div>
  );
}
