import { HelpCircle } from "lucide-react";
import { COMPETENCY_LABELS } from "@/features/mock-interview/constants";
import type { MockInterviewReportContent } from "@/features/mock-interview/types";
import { Chip } from "@/components/dashboard/primitives";
import { CollapsibleSection } from "./CollapsibleSection";

// ── AdditionalQuestionsPanel (Module 7C) ──
//
// "What else should I be ready for?" — the questions this role commonly gets
// that this particular interview didn't reach. Deliberately separate from
// Recommended Topics: those are areas to study, these are literal questions to
// rehearse, which is the more actionable of the two.
//
// Open by default. Unlike the diagnostic sections, this is forward-looking
// homework, and burying it behind a click is how it goes unread.

export function AdditionalQuestionsPanel({ report }: { report: MockInterviewReportContent }) {
  // Reports generated before this section existed simply have no array — the
  // stored jsonb is read as a cast, not re-validated, so guard at runtime.
  const questions = report.additionalQuestionsToPrepare ?? [];
  if (questions.length === 0) return null;

  return (
    <CollapsibleSection
      icon={HelpCircle}
      title="Additional Questions You Should Prepare"
      meta={`${questions.length} not covered today`}
      defaultOpen
    >
      <p className="text-xs text-[oklch(0.5_0.02_265)]">
        These weren't asked in this session, but they come up often for this kind of role. They're
        common industry questions, not this company's actual process.
      </p>
      <ol className="mt-1 space-y-3">
        {questions.map((q, i) => (
          <li key={i} className="flex gap-2.5">
            <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-black/[0.05] text-[11px] font-medium text-[oklch(0.45_0.02_265)]">
              {i + 1}
            </span>
            <div className="min-w-0">
              <p className="text-sm font-medium text-[oklch(0.25_0.02_265)]">{q.question}</p>
              {q.why && <p className="mt-0.5 text-xs text-[oklch(0.5_0.02_265)]">{q.why}</p>}
              {q.competencyId && (
                <Chip tone="default" className="mt-1.5">
                  {COMPETENCY_LABELS[q.competencyId] ?? q.competencyId}
                </Chip>
              )}
            </div>
          </li>
        ))}
      </ol>
    </CollapsibleSection>
  );
}
