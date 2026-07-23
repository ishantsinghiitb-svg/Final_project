import { ShieldCheck, X, CheckCircle2, AlertTriangle, ArrowUpCircle } from "lucide-react";
import { Chip } from "@/components/dashboard/primitives";
import { cn } from "@/lib/utils";
import { ATS_RATINGS, type AtsRating } from "@/features/ai/atsRating";
import type { AtsScoreSummary } from "@/features/ai/types";

// ── AtsReportDialog (Module 6C) ──
//
// The full ATS Compatibility report — everything the compact card summarizes:
// the six weighted components with per-component detail, matched / missing /
// critical-missing keywords, strengths, ATS risks, recommendations, and the
// summary. Same fixed-overlay/gradient-strip modal convention as the other
// dashboard dialogs; scrolls internally so it never grows the page.

const RATING_TONE: Record<AtsRating, "green" | "blue" | "amber" | "rose"> = {
  [ATS_RATINGS.EXCELLENT]: "green",
  [ATS_RATINGS.STRONG]: "blue",
  [ATS_RATINGS.MODERATE]: "amber",
  [ATS_RATINGS.NEEDS_IMPROVEMENT]: "rose",
};

function barGradient(score: number): string {
  if (score >= 85) return "from-[#22C55E] to-[#16A34A]";
  if (score >= 70) return "from-[#2563EB] to-[#7C3AED]";
  if (score >= 50) return "from-[#F59E0B] to-[#EAB308]";
  return "from-[#F43F5E] to-[#E11D48]";
}

type Props = {
  open: boolean;
  analysis: AtsScoreSummary;
  onClose: () => void;
};

export function AtsReportDialog({ open, analysis, onClose }: Props) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ats-report-title"
    >
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={onClose}
      />

      <div className="relative z-10 flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-black/5 bg-white shadow-[0_24px_80px_-12px_rgba(0,0,0,0.25)] animate-in slide-in-from-bottom-4 duration-300">
        <div className="h-1.5 w-full shrink-0 bg-gradient-to-r from-[#2563EB] to-[#7C3AED]" />

        <div className="flex items-start gap-3 border-b border-black/5 px-6 py-4">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-[#2563EB]/10 to-[#7C3AED]/15 text-[#7C3AED]">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h2
              id="ats-report-title"
              className="font-display text-base font-semibold text-[oklch(0.2_0.02_265)]"
            >
              ATS Compatibility Report
            </h2>
            <p className="text-[11px] text-[oklch(0.5_0.02_265)]">
              How this resume is likely to perform in ATS screening for this job
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="font-display text-2xl font-semibold leading-none text-[oklch(0.2_0.02_265)]">
                {analysis.overallScore}
                <span className="text-sm font-medium text-[oklch(0.5_0.02_265)]">/100</span>
              </p>
            </div>
            <Chip tone={RATING_TONE[analysis.rating]}>{analysis.rating}</Chip>
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
          {/* Breakdown */}
          <section>
            <p className="text-[11px] uppercase tracking-[0.14em] text-[oklch(0.5_0.02_265)]">
              Breakdown
            </p>
            <ul className="mt-3 space-y-3">
              {analysis.breakdown.map((c) => (
                <li key={c.key}>
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="flex items-center gap-2 font-medium text-[oklch(0.3_0.02_265)]">
                      {c.label}
                      <span className="rounded-full bg-black/[0.04] px-1.5 py-0.5 text-[10px] font-medium text-[oklch(0.5_0.02_265)]">
                        {c.weightPct}%
                      </span>
                      <span className="text-[10px] uppercase tracking-wide text-[oklch(0.6_0.02_265)]">
                        {c.source === "ai" ? "AI" : "Parser"}
                      </span>
                    </span>
                    <span className="shrink-0 font-semibold text-[oklch(0.25_0.02_265)]">
                      {c.score}
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 rounded-full bg-black/5">
                    <div
                      className={cn("h-full rounded-full bg-gradient-to-r", barGradient(c.score))}
                      style={{ width: `${c.score}%` }}
                    />
                  </div>
                  {c.detail && (
                    <p className="mt-1 text-xs leading-relaxed text-[oklch(0.5_0.02_265)]">
                      {c.detail}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </section>

          {/* Keywords */}
          <section className="space-y-3">
            <p className="text-[11px] uppercase tracking-[0.14em] text-[oklch(0.5_0.02_265)]">
              Keywords
            </p>

            {analysis.criticalMissingKeywords.length > 0 && (
              <KeywordGroup
                label="Critical missing"
                keywords={analysis.criticalMissingKeywords}
                className="border border-[#F43F5E]/20 bg-rose-50 text-[#E11D48]"
              />
            )}
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
            {analysis.matchedKeywords.length === 0 &&
              analysis.missingKeywords.length === 0 &&
              analysis.criticalMissingKeywords.length === 0 && (
                <p className="text-sm text-[oklch(0.5_0.02_265)]">No keywords identified.</p>
              )}
          </section>

          {/* Strengths */}
          {analysis.strengths.length > 0 && (
            <IconList
              title="Strengths"
              items={analysis.strengths}
              icon={<CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#16A34A]" />}
            />
          )}

          {/* ATS Risks */}
          {analysis.atsRisks.length > 0 && (
            <IconList
              title="ATS Risks"
              items={analysis.atsRisks}
              icon={<AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#B45309]" />}
            />
          )}

          {/* Recommendations */}
          {analysis.recommendations.length > 0 && (
            <IconList
              title="Recommendations"
              items={analysis.recommendations}
              icon={<ArrowUpCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#2563EB]" />}
            />
          )}

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
        </div>
      </div>
    </div>
  );
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
