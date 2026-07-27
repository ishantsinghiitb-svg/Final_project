import { Target, TrendingUp, CheckCircle2, AlertTriangle } from "lucide-react";
import { DashCard } from "@/components/dashboard/primitives";
import { cn } from "@/lib/utils";
import type { OptimizationResult, OptimizerScorecardEntry } from "@/features/optimizer/types";

// ── TransformationRoadmap (Module 6E · Resume Transformation Engine) ──
//
// The header of the optimization report: it reframes the run from "here are some
// fixes" into a category-specific transformation roadmap. It shows how ready the
// resume is TODAY for this category, the realistic ceiling it can truthfully
// reach, the category-adaptive scorecard (different dimensions per category —
// this is what makes a Product Management run feel different from a Finance run),
// and the category-specific strengths and gaps. The concrete, prioritized
// actions live below it (SuggestionReviewList).

const STATUS_BAR: Record<OptimizerScorecardEntry["status"], string> = {
  strong: "from-[#22C55E] to-[#16A34A]",
  adequate: "from-[#2563EB] to-[#7C3AED]",
  weak: "from-[#F59E0B] to-[#EAB308]",
};

const STATUS_TEXT: Record<OptimizerScorecardEntry["status"], string> = {
  strong: "text-[#16A34A]",
  adequate: "text-[#2563EB]",
  weak: "text-[#B45309]",
};

/**
 * Give the readiness number meaning by placing it on the applicant-pool
 * benchmark. Deterministic bands (presentation only — no AI, no schema): a
 * user sees whether a 68 means "average" or "competitive" for the field.
 */
function readinessBand(score: number): { label: string; tone: string } {
  if (score >= 85) return { label: "top-tier", tone: "text-[#16A34A]" };
  if (score >= 70) return { label: "competitive", tone: "text-[#2563EB]" };
  if (score >= 50) return { label: "around the average applicant", tone: "text-[#B45309]" };
  return { label: "below the average applicant", tone: "text-[#E11D48]" };
}

function StatTile({
  label,
  value,
  accent,
  icon: Icon,
}: {
  label: string;
  value: number;
  accent: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="flex-1 rounded-xl border border-black/5 bg-white p-3.5">
      <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-[oklch(0.5_0.02_265)]">
        <Icon className={cn("h-3.5 w-3.5", accent)} />
        {label}
      </p>
      <p className="mt-1 font-display text-3xl font-semibold leading-none text-[oklch(0.2_0.02_265)]">
        {value}
        <span className="text-sm font-medium text-[oklch(0.5_0.02_265)]">/100</span>
      </p>
    </div>
  );
}

export function TransformationRoadmap({
  result,
  showBenchmark = true,
}: {
  result: OptimizationResult;
  /** The action-first report renders the benchmark separately at the very bottom. */
  showBenchmark?: boolean;
}) {
  const {
    readiness,
    transformationPotential,
    benchmark,
    scorecard,
    categoryStrengths,
    categoryGaps,
  } = result;

  // Legacy / degenerate runs (e.g. an old cached optimization) carry no
  // transformation analysis — render nothing rather than an empty 0/100 shell.
  const hasData =
    scorecard.length > 0 ||
    readiness > 0 ||
    benchmark.length > 0 ||
    categoryStrengths.length > 0 ||
    categoryGaps.length > 0;
  if (!hasData) return null;

  const lift = Math.max(transformationPotential - readiness, 0);

  return (
    <DashCard className="border-[#2563EB]/15 bg-gradient-to-br from-[#2563EB]/[0.03] to-[#7C3AED]/[0.04]">
      <div className="flex items-center gap-2">
        <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white/70 text-[#7C3AED]">
          <Target className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="font-display text-sm font-semibold text-[oklch(0.22_0.02_265)]">
            Transformation roadmap
          </p>
          <p className="truncate text-[11px] text-[oklch(0.5_0.02_265)]">
            for {result.categoryLabel}
          </p>
        </div>
      </div>

      {/* Readiness now vs the truthful ceiling */}
      <div className="mt-4 flex items-stretch gap-3">
        <StatTile label="Readiness now" value={readiness} accent="text-[#2563EB]" icon={Target} />
        <StatTile
          label="Potential"
          value={transformationPotential}
          accent="text-[#16A34A]"
          icon={TrendingUp}
        />
      </div>
      {lift > 0 && (
        <p className="mt-2 text-xs text-[oklch(0.45_0.02_265)]">
          Applying this roadmap can truthfully lift you about{" "}
          <span className="font-semibold text-[#16A34A]">+{lift}</span> toward a top{" "}
          {result.categoryLabel} resume.
        </p>
      )}

      {/* Benchmark context — what the readiness number means vs the applicant pool */}
      <div className="mt-3 rounded-lg bg-white/60 px-3 py-2.5">
        <p className="text-xs text-[oklch(0.4_0.02_265)]">
          A readiness of <span className="font-semibold">{readiness}</span> is{" "}
          <span className={cn("font-semibold", readinessBand(readiness).tone)}>
            {readinessBand(readiness).label}
          </span>{" "}
          for a {result.categoryLabel} role.
        </p>
        <div className="relative mt-2 h-1.5 rounded-full bg-gradient-to-r from-[#F43F5E]/25 via-[#F59E0B]/30 to-[#22C55E]/40">
          <div
            className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-[#2563EB] shadow-sm"
            style={{ left: `${Math.min(Math.max(readiness, 2), 98)}%` }}
          />
        </div>
        <div className="mt-1.5 flex justify-between text-[9px] font-medium uppercase tracking-wide text-[oklch(0.55_0.02_265)]">
          <span>Below avg</span>
          <span>Average</span>
          <span>Competitive</span>
          <span>Top-tier</span>
        </div>
      </div>

      {showBenchmark && benchmark && (
        <p className="mt-3 rounded-lg bg-white/60 px-3 py-2 text-xs italic leading-relaxed text-[oklch(0.4_0.02_265)]">
          {benchmark}
        </p>
      )}

      {/* Category scorecard — dimensions are category-specific */}
      {scorecard.length > 0 && (
        <div className="mt-4">
          <p className="text-[11px] uppercase tracking-[0.14em] text-[oklch(0.5_0.02_265)]">
            {result.categoryLabel} scorecard
          </p>
          <ul className="mt-2.5 space-y-2.5">
            {scorecard.map((c, i) => (
              <li key={`${c.dimension}-${i}`}>
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="truncate font-medium text-[oklch(0.3_0.02_265)]">
                    {c.dimension}
                  </span>
                  <span className={cn("shrink-0 text-xs font-semibold", STATUS_TEXT[c.status])}>
                    {c.score}
                  </span>
                </div>
                <div className="mt-1 h-1.5 rounded-full bg-black/5">
                  <div
                    className={cn("h-full rounded-full bg-gradient-to-r", STATUS_BAR[c.status])}
                    style={{ width: `${c.score}%` }}
                  />
                </div>
                {c.insight && (
                  <p className="mt-1 text-xs leading-relaxed text-[oklch(0.5_0.02_265)]">
                    {c.insight}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Category-specific strengths + gaps */}
      {(categoryStrengths.length > 0 || categoryGaps.length > 0) && (
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {categoryStrengths.length > 0 && (
            <div>
              <p className="text-[11px] uppercase tracking-[0.14em] text-[oklch(0.5_0.02_265)]">
                Category strengths
              </p>
              <ul className="mt-2 space-y-1.5">
                {categoryStrengths.map((s, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#16A34A]" />
                    <span className="text-[oklch(0.3_0.02_265)]">{s}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {categoryGaps.length > 0 && (
            <div>
              <p className="text-[11px] uppercase tracking-[0.14em] text-[oklch(0.5_0.02_265)]">
                Category gaps
              </p>
              <ul className="mt-2 space-y-1.5">
                {categoryGaps.map((g, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#B45309]" />
                    <span className="text-[oklch(0.3_0.02_265)]">{g}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </DashCard>
  );
}
