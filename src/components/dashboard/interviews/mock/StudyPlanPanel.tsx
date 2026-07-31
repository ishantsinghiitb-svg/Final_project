import { Link } from "@tanstack/react-router";
import { ArrowRight, BookOpen, ListChecks } from "lucide-react";
import { DashCard, Chip } from "@/components/dashboard/primitives";
import type { MockInterviewReportContent } from "@/features/mock-interview/types";
import { CollapsibleSection } from "./CollapsibleSection";

// ── StudyPlanPanel (Module 7C) ──
//
// Everything forward-looking in one place: recommended improvements, a
// personalized study plan, recommended topics, and the recommended next mock
// interview — the report's answer to "what do I do now?".

export function StudyPlanPanel({
  report,
  interviewId,
}: {
  report: MockInterviewReportContent;
  interviewId: string;
}) {
  return (
    <div className="space-y-3">
      {report.recommendedImprovements.length > 0 && (
        <CollapsibleSection icon={ListChecks} title="Recommended Improvements" defaultOpen>
          <div className="space-y-3">
            {report.recommendedImprovements.map((r, i) => (
              <div key={i}>
                <p className="text-sm font-medium text-[oklch(0.25_0.02_265)]">{r.area}</p>
                <p className="mt-0.5 text-xs text-[oklch(0.5_0.02_265)]">{r.why}</p>
                <p className="mt-0.5 text-sm text-[oklch(0.35_0.02_265)]">{r.how}</p>
              </div>
            ))}
          </div>
        </CollapsibleSection>
      )}

      {report.studyPlan.length > 0 && (
        <CollapsibleSection icon={BookOpen} title="Personalized Study Plan">
          <div className="space-y-3">
            {report.studyPlan.map((s, i) => (
              <div key={i}>
                <p className="text-sm font-medium text-[oklch(0.25_0.02_265)]">{s.topic}</p>
                <p className="mt-0.5 text-xs text-[oklch(0.5_0.02_265)]">{s.why}</p>
                {s.actions.length > 0 && (
                  <ul className="mt-1 space-y-0.5 text-sm text-[oklch(0.35_0.02_265)]">
                    {s.actions.map((a, j) => (
                      <li key={j}>• {a}</li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </CollapsibleSection>
      )}

      {report.recommendedTopics.length > 0 && (
        <DashCard>
          <p className="font-display text-sm font-semibold text-[oklch(0.2_0.02_265)]">
            Recommended Topics
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {report.recommendedTopics.map((t, i) => (
              <Chip key={i} tone="blue">
                {t}
              </Chip>
            ))}
          </div>
        </DashCard>
      )}

      {(report.nextMockInterview.recommendedFocus || report.nextMockInterview.rationale) && (
        <DashCard className="bg-gradient-to-br from-[#2563EB]/[0.04] to-[#7C3AED]/[0.06]">
          <p className="font-display text-sm font-semibold text-[oklch(0.2_0.02_265)]">
            Recommended Next Mock Interview
          </p>
          {report.nextMockInterview.recommendedInterviewerRole && (
            <p className="mt-1 text-sm text-[oklch(0.35_0.02_265)]">
              Try:{" "}
              <span className="font-medium">
                {report.nextMockInterview.recommendedInterviewerRole}
              </span>
            </p>
          )}
          {report.nextMockInterview.recommendedFocus && (
            <p className="mt-1 text-sm text-[oklch(0.35_0.02_265)]">
              {report.nextMockInterview.recommendedFocus}
            </p>
          )}
          {report.nextMockInterview.rationale && (
            <p className="mt-1 text-xs text-[oklch(0.5_0.02_265)]">
              {report.nextMockInterview.rationale}
            </p>
          )}
          <Link
            to="/dashboard/interviews/$interviewId/mock"
            params={{ interviewId }}
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-br from-[#2563EB] to-[#7C3AED] px-3 py-1.5 text-xs font-semibold text-white transition-transform hover:-translate-y-px"
          >
            Start another mock interview <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </DashCard>
      )}

      {report.closingNote && (
        <p className="px-1 text-sm italic text-[oklch(0.5_0.02_265)]">{report.closingNote}</p>
      )}
    </div>
  );
}
