import { DashCard, Chip } from "@/components/dashboard/primitives";
import { HIRING_DECISION_LABELS, HIRING_DECISION_TONE } from "@/features/mock-interview/constants";
import { performanceBandForScore } from "@/features/mock-interview/performanceBand";
import { formatElapsed } from "@/features/mock-interview/timer";
import type { MockInterviewSession } from "@/features/mock-interview/types";

// ── ReportHero (Module 7C) ──
//
// The headline read: overall score + band (derived in code, never AI-
// generated — see performanceBand.ts), the hiring recommendation, and the
// session's vitals. Everything else in the report expands on this.

export function ReportHero({ session }: { session: MockInterviewSession }) {
  const report = session.report;
  if (!report) return null;
  const band = performanceBandForScore(report.overallPerformance.score);
  const questionCount = session.turn_count;

  return (
    <DashCard className="bg-gradient-to-br from-[#2563EB]/[0.04] to-[#7C3AED]/[0.06]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-[oklch(0.5_0.02_265)]">
            Overall performance
          </p>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="font-display text-4xl font-semibold text-[oklch(0.2_0.02_265)]">
              {report.overallPerformance.score}
            </span>
            <span className="text-sm text-[oklch(0.5_0.02_265)]">/ 100</span>
            <Chip tone={HIRING_DECISION_TONE[report.hiringRecommendation.decision]}>{band}</Chip>
          </div>
          {report.overallPerformance.headline && (
            <p className="mt-2 max-w-xl text-sm text-[oklch(0.4_0.02_265)]">
              {report.overallPerformance.headline}
            </p>
          )}
        </div>

        <div className="text-right">
          <Chip
            tone={HIRING_DECISION_TONE[report.hiringRecommendation.decision]}
            className="text-xs"
          >
            {HIRING_DECISION_LABELS[report.hiringRecommendation.decision]}
          </Chip>
          <p className="mt-2 text-xs text-[oklch(0.5_0.02_265)]">
            {questionCount} question{questionCount === 1 ? "" : "s"} ·{" "}
            {formatElapsed(session.elapsed_ms)} · {session.interviewer_role_label}
          </p>
        </div>
      </div>

      {report.interviewSummary && (
        <p className="mt-4 border-t border-black/5 pt-4 text-sm leading-relaxed text-[oklch(0.35_0.02_265)]">
          {report.interviewSummary}
        </p>
      )}
    </DashCard>
  );
}
