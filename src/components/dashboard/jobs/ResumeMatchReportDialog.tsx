import { Sparkles, X, CheckCircle2, ArrowUpCircle, RefreshCw } from "lucide-react";
import { Chip } from "@/components/dashboard/primitives";
import { DashButton } from "@/components/dashboard/DashButton";
import { cn } from "@/lib/utils";
import { useResumeMatchHistory } from "@/features/ai/hooks";
import { MATCH_LABELS, matchLabelForScore, type MatchLabel } from "@/features/ai/matchLabel";
import type { ResumeMatchSummary, ResumeMatchRecommendation } from "@/features/ai/types";

// ── ResumeMatchReportDialog (Module 6C polish) ──
//
// The full Resume Match report, split out of the dashboard card so the card
// itself can stay a compact, quick-decision summary (see ResumeMatchCard).
// Deliberately a NEW, self-contained file rather than a shared component with
// AtsReportDialog: that dialog is frozen ("leave exactly as implemented"), so
// reusing its internals would mean editing a file we're not allowed to touch.
// The visual language (header layout, section typography, keyword chip
// groups, icon lists) is copied to match it, not imported from it.

const LABEL_TONE: Record<MatchLabel, "green" | "blue" | "amber" | "rose"> = {
  [MATCH_LABELS.EXCELLENT]: "green",
  [MATCH_LABELS.GOOD]: "blue",
  [MATCH_LABELS.PARTIAL]: "amber",
  [MATCH_LABELS.LIMITED]: "rose",
};

const RECOMMENDATION_LABEL: Record<ResumeMatchRecommendation["shouldApply"], string> = {
  apply: "Apply",
  stretch: "Stretch",
  improve_first: "Improve First",
  skip: "Skip",
};

const RECOMMENDATION_TONE: Record<
  ResumeMatchRecommendation["shouldApply"],
  "green" | "blue" | "amber" | "rose"
> = {
  apply: "green",
  stretch: "blue",
  improve_first: "amber",
  skip: "rose",
};

function barGradient(score: number): string {
  if (score >= 85) return "from-[#22C55E] to-[#16A34A]";
  if (score >= 70) return "from-[#2563EB] to-[#7C3AED]";
  if (score >= 50) return "from-[#F59E0B] to-[#EAB308]";
  return "from-[#F43F5E] to-[#E11D48]";
}

function KeywordGroup({
  label,
  keywords,
  className,
}: {
  label: string;
  keywords: string[];
  className: string;
}) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-medium text-[oklch(0.45_0.02_265)]">
        {label} ({keywords.length})
      </p>
      <div className="flex flex-wrap gap-1.5">
        {keywords.map((kw, i) => (
          <span
            key={`${kw}-${i}`}
            className={cn(
              "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium",
              className,
            )}
          >
            {kw}
          </span>
        ))}
      </div>
    </div>
  );
}

function IconList({
  title,
  items,
  icon,
}: {
  title: string;
  items: string[];
  icon: React.ReactNode;
}) {
  return (
    <section>
      <p className="text-[11px] uppercase tracking-[0.14em] text-[oklch(0.5_0.02_265)]">{title}</p>
      <ul className="mt-2 space-y-1.5">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-2 text-sm">
            {icon}
            <span className="text-[oklch(0.3_0.02_265)]">{item}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function MatchHistoryList({ resumeId, jobId }: { resumeId: string; jobId: string }) {
  const { data: history, isLoading } = useResumeMatchHistory(resumeId, jobId);

  if (isLoading) {
    return <p className="text-xs text-[oklch(0.5_0.02_265)]">Loading history…</p>;
  }
  if (!history || history.length === 0) {
    return <p className="text-xs text-[oklch(0.5_0.02_265)]">No past analyses yet.</p>;
  }

  return (
    <ul className="space-y-1.5">
      {history.map((entry) => (
        <li
          key={entry.id}
          className="flex items-center justify-between text-xs text-[oklch(0.45_0.02_265)]"
        >
          <span>
            {new Date(entry.createdAt).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </span>
          <span className="font-medium">
            {entry.score != null ? `${entry.score}% · ${matchLabelForScore(entry.score)}` : "N/A"}
          </span>
        </li>
      ))}
    </ul>
  );
}

type Props = {
  open: boolean;
  analysis: ResumeMatchSummary;
  resumeId: string;
  jobId: string;
  onReanalyze: () => void;
  reanalyzeDisabled: boolean;
  reanalyzePending: boolean;
  onClose: () => void;
};

export function ResumeMatchReportDialog({
  open,
  analysis,
  resumeId,
  jobId,
  onReanalyze,
  reanalyzeDisabled,
  reanalyzePending,
  onClose,
}: Props) {
  if (!open) return null;

  const dimensionRows = [
    { label: "Experience Match", ...analysis.dimensions.experience },
    { label: "Education Match", ...analysis.dimensions.education },
    { label: "Domain Fit", ...analysis.dimensions.domain },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="match-report-title"
    >
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={onClose}
      />

      <div className="relative z-10 flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-black/5 bg-white shadow-[0_24px_80px_-12px_rgba(0,0,0,0.25)] animate-in slide-in-from-bottom-4 duration-300">
        <div className="h-1.5 w-full shrink-0 bg-gradient-to-r from-[#2563EB] to-[#7C3AED]" />

        <div className="flex items-start gap-3 border-b border-black/5 px-6 py-4">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-[#2563EB]/10 to-[#7C3AED]/15 text-[#7C3AED]">
            <Sparkles className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h2
              id="match-report-title"
              className="font-display text-base font-semibold text-[oklch(0.2_0.02_265)]"
            >
              Resume Match Report
            </h2>
            <p className="text-[11px] text-[oklch(0.5_0.02_265)]">
              How well your resume fits this job
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="font-display text-2xl font-semibold leading-none text-[oklch(0.2_0.02_265)]">
                {analysis.overallScore}
                <span className="text-sm font-medium text-[oklch(0.5_0.02_265)]">%</span>
              </p>
            </div>
            <Chip tone={LABEL_TONE[analysis.matchLabel]}>{analysis.matchLabel}</Chip>
            <button
              onClick={onClose}
              aria-label="Close"
              className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-[oklch(0.55_0.02_265)] hover:bg-black/[0.05] transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="space-y-6 overflow-y-auto px-6 py-5">
          {/* Strengths */}
          {analysis.whatMatches.length > 0 && (
            <IconList
              title="Strengths"
              items={analysis.whatMatches}
              icon={<CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#16A34A]" />}
            />
          )}

          {/* Areas to Improve */}
          {analysis.whatToImprove.length > 0 && (
            <IconList
              title="Areas to Improve"
              items={analysis.whatToImprove}
              icon={<ArrowUpCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#F59E0B]" />}
            />
          )}

          {/* Missing Skills */}
          {analysis.missingSkills.length > 0 && (
            <section>
              <p className="text-[11px] uppercase tracking-[0.14em] text-[oklch(0.5_0.02_265)]">
                Missing Skills
              </p>
              <ul className="mt-2 space-y-2">
                {analysis.missingSkills.map((s, i) => (
                  <li key={`${s.skill}-${i}`} className="text-sm">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-[oklch(0.3_0.02_265)]">{s.skill}</span>
                      <Chip tone={s.importance === "required" ? "rose" : "default"}>
                        {s.importance === "required" ? "Required" : "Preferred"}
                      </Chip>
                    </div>
                    {s.evidence && (
                      <p className="mt-0.5 text-xs italic text-[oklch(0.5_0.02_265)]">
                        {s.evidence}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Keywords */}
          {(analysis.missingKeywords.length > 0 || analysis.matchedKeywords.length > 0) && (
            <section className="space-y-3">
              <p className="text-[11px] uppercase tracking-[0.14em] text-[oklch(0.5_0.02_265)]">
                Keywords
              </p>
              {analysis.missingKeywords.length > 0 && (
                <KeywordGroup
                  label="Missing"
                  keywords={analysis.missingKeywords}
                  className="bg-amber-50 text-[#B45309]"
                />
              )}
              {analysis.matchedKeywords.length > 0 && (
                <KeywordGroup
                  label="Matched"
                  keywords={analysis.matchedKeywords}
                  className="bg-[#22C55E]/10 text-[#16A34A]"
                />
              )}
            </section>
          )}

          {/* Fit Breakdown */}
          <section>
            <p className="text-[11px] uppercase tracking-[0.14em] text-[oklch(0.5_0.02_265)]">
              Fit Breakdown
            </p>
            <ul className="mt-3 space-y-3">
              {dimensionRows.map((d) => (
                <li key={d.label}>
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="font-medium text-[oklch(0.3_0.02_265)]">{d.label}</span>
                    <span className="shrink-0 font-semibold text-[oklch(0.25_0.02_265)]">
                      {d.score}
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 rounded-full bg-black/5">
                    <div
                      className={cn("h-full rounded-full bg-gradient-to-r", barGradient(d.score))}
                      style={{ width: `${d.score}%` }}
                    />
                  </div>
                  {d.detail && (
                    <p className="mt-1 text-xs leading-relaxed text-[oklch(0.5_0.02_265)]">
                      {d.detail}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </section>

          {/* Recommendation */}
          <section>
            <p className="text-[11px] uppercase tracking-[0.14em] text-[oklch(0.5_0.02_265)]">
              Recommendation
            </p>
            <div className="mt-2 flex items-start gap-2">
              <Chip tone={RECOMMENDATION_TONE[analysis.recommendation.shouldApply]}>
                {RECOMMENDATION_LABEL[analysis.recommendation.shouldApply]}
              </Chip>
              {analysis.recommendation.rationale && (
                <p className="text-sm leading-relaxed text-[oklch(0.35_0.02_265)]">
                  {analysis.recommendation.rationale}
                </p>
              )}
            </div>
          </section>

          {/* Summary */}
          {analysis.summary && (
            <section>
              <p className="text-[11px] uppercase tracking-[0.14em] text-[oklch(0.5_0.02_265)]">
                Summary
              </p>
              <div className="mt-2 rounded-lg bg-[oklch(0.97_0.01_265)] p-3 text-sm italic leading-relaxed text-[oklch(0.35_0.02_265)]">
                {analysis.summary}
              </div>
            </section>
          )}

          {/* History */}
          <section>
            <p className="text-[11px] uppercase tracking-[0.14em] text-[oklch(0.5_0.02_265)]">
              History
            </p>
            <div className="mt-2">
              <MatchHistoryList resumeId={resumeId} jobId={jobId} />
            </div>
          </section>
        </div>

        {/* Footer — Re-analyze */}
        <div className="flex shrink-0 justify-end border-t border-black/5 px-6 py-4">
          <DashButton
            variant="outline"
            size="sm"
            onClick={onReanalyze}
            disabled={reanalyzeDisabled}
          >
            <RefreshCw className={cn("h-3.5 w-3.5", reanalyzePending && "animate-spin")} />
            {reanalyzePending ? "Analyzing…" : "Re-analyze"}
          </DashButton>
        </div>
      </div>
    </div>
  );
}
