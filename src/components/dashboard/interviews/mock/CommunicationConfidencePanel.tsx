import { Mic2, ShieldCheck, Star } from "lucide-react";
import type { MockInterviewReportContent } from "@/features/mock-interview/types";
import { CollapsibleSection } from "./CollapsibleSection";

// ── CommunicationConfidencePanel (Module 7C) ──
//
// Folds Communication Analysis, Confidence Analysis, and the STAR Method
// evaluation into one section — all three are short prose-plus-bullets
// summaries of HOW the candidate communicated, distinct from the WHAT
// (competency scores) and the specific evidence (AnswerHighlights).

export function CommunicationConfidencePanel({ report }: { report: MockInterviewReportContent }) {
  return (
    <div className="space-y-3">
      <CollapsibleSection icon={Mic2} title="Communication">
        <p className="text-sm text-[oklch(0.35_0.02_265)]">
          {report.communicationAnalysis.summary}
        </p>
        {report.communicationAnalysis.strengths.length > 0 && (
          <div>
            <p className="text-xs font-medium text-[oklch(0.45_0.02_265)]">What worked</p>
            <ul className="mt-1 space-y-1 text-sm text-[oklch(0.35_0.02_265)]">
              {report.communicationAnalysis.strengths.map((s, i) => (
                <li key={i}>• {s}</li>
              ))}
            </ul>
          </div>
        )}
        {report.communicationAnalysis.improvements.length > 0 && (
          <div>
            <p className="text-xs font-medium text-[oklch(0.45_0.02_265)]">Room to improve</p>
            <ul className="mt-1 space-y-1 text-sm text-[oklch(0.35_0.02_265)]">
              {report.communicationAnalysis.improvements.map((s, i) => (
                <li key={i}>• {s}</li>
              ))}
            </ul>
          </div>
        )}
      </CollapsibleSection>

      <CollapsibleSection icon={ShieldCheck} title="Confidence">
        <p className="text-sm text-[oklch(0.35_0.02_265)]">{report.confidenceAnalysis.summary}</p>
        {report.confidenceAnalysis.signals.length > 0 && (
          <ul className="mt-1 space-y-1 text-sm text-[oklch(0.35_0.02_265)]">
            {report.confidenceAnalysis.signals.map((s, i) => (
              <li key={i}>• {s}</li>
            ))}
          </ul>
        )}
      </CollapsibleSection>

      <CollapsibleSection icon={Star} title="STAR Method">
        <p className="text-sm text-[oklch(0.35_0.02_265)]">
          {report.starEvaluation.usedStarMethod
            ? "The candidate structured behavioral answers using the STAR method."
            : "The candidate did not consistently structure behavioral answers using the STAR method."}
        </p>
        {report.starEvaluation.summary && (
          <p className="mt-1 text-sm text-[oklch(0.35_0.02_265)]">
            {report.starEvaluation.summary}
          </p>
        )}
      </CollapsibleSection>
    </div>
  );
}
