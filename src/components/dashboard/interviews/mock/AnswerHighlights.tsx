import { Lightbulb, ThumbsDown, ThumbsUp, Wand2 } from "lucide-react";
import type { MockInterviewReportContent } from "@/features/mock-interview/types";
import { CollapsibleSection } from "./CollapsibleSection";

function CiteButton({ turnIndex, onCite }: { turnIndex: number; onCite: (t: number) => void }) {
  return (
    <button
      onClick={() => onCite(turnIndex)}
      className="shrink-0 rounded-full bg-black/[0.04] px-1.5 py-0.5 text-[10px] font-medium text-[oklch(0.45_0.02_265)] hover:bg-black/[0.08]"
    >
      Question {turnIndex + 1}
    </button>
  );
}

// ── AnswerHighlights (Module 7C) ──
//
// Best/weak answers, missed opportunities, and suggested better answers —
// every item carries a "Question N" citation that scrolls to the real
// exchange in ReportTranscript, so nothing here reads as an unverifiable
// claim (this is the grounding guard's UI counterpart — the server already
// dropped any citation that didn't point at a real turn).

export function AnswerHighlights({
  report,
  onCite,
}: {
  report: MockInterviewReportContent;
  onCite: (turnIndex: number) => void;
}) {
  const hasAny =
    report.bestAnswers.length > 0 ||
    report.weakAnswers.length > 0 ||
    report.missedOpportunities.length > 0 ||
    report.suggestedBetterAnswers.length > 0;
  if (!hasAny) return null;

  return (
    <div className="space-y-3">
      {report.bestAnswers.length > 0 && (
        <CollapsibleSection
          icon={ThumbsUp}
          title="Best Answers"
          meta={`${report.bestAnswers.length}`}
        >
          <div className="space-y-3">
            {report.bestAnswers.map((a, i) => (
              <div key={i} className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-medium text-[oklch(0.25_0.02_265)]">{a.question}</p>
                  <p className="mt-0.5 text-xs text-[oklch(0.5_0.02_265)]">{a.why}</p>
                </div>
                <CiteButton turnIndex={a.turnIndex} onCite={onCite} />
              </div>
            ))}
          </div>
        </CollapsibleSection>
      )}

      {report.weakAnswers.length > 0 && (
        <CollapsibleSection
          icon={ThumbsDown}
          title="Weak Answers"
          meta={`${report.weakAnswers.length}`}
        >
          <div className="space-y-3">
            {report.weakAnswers.map((a, i) => (
              <div key={i} className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-medium text-[oklch(0.25_0.02_265)]">{a.question}</p>
                  <p className="mt-0.5 text-xs text-[oklch(0.5_0.02_265)]">{a.why}</p>
                </div>
                <CiteButton turnIndex={a.turnIndex} onCite={onCite} />
              </div>
            ))}
          </div>
        </CollapsibleSection>
      )}

      {report.missedOpportunities.length > 0 && (
        <CollapsibleSection
          icon={Lightbulb}
          title="Missed Opportunities"
          meta={`${report.missedOpportunities.length}`}
        >
          <div className="space-y-3">
            {report.missedOpportunities.map((m, i) => (
              <div key={i} className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm text-[oklch(0.35_0.02_265)]">{m.whatWasMissed}</p>
                  <p className="mt-0.5 text-xs text-[oklch(0.5_0.02_265)]">
                    Could have said: {m.whatToSayInstead}
                  </p>
                </div>
                <CiteButton turnIndex={m.turnIndex} onCite={onCite} />
              </div>
            ))}
          </div>
        </CollapsibleSection>
      )}

      {report.suggestedBetterAnswers.length > 0 && (
        <CollapsibleSection
          icon={Wand2}
          title="Suggested Better Answers"
          meta={`${report.suggestedBetterAnswers.length}`}
        >
          <div className="space-y-4">
            {report.suggestedBetterAnswers.map((s, i) => (
              <div key={i}>
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium text-[oklch(0.25_0.02_265)]">{s.question}</p>
                  <CiteButton turnIndex={s.turnIndex} onCite={onCite} />
                </div>
                <p className="mt-1 text-sm leading-relaxed text-[oklch(0.35_0.02_265)]">
                  {s.suggestedAnswer}
                </p>
                {s.groundedIn && (
                  <p className="mt-1 text-xs italic text-[oklch(0.55_0.02_265)]">
                    Grounded in: {s.groundedIn}
                  </p>
                )}
              </div>
            ))}
          </div>
        </CollapsibleSection>
      )}
    </div>
  );
}
