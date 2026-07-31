import { MessageSquare } from "lucide-react";
import type { MockInterviewTurn } from "@/features/mock-interview/types";
import { CollapsibleSection } from "./CollapsibleSection";

// ── ReportTranscript (Module 7C) ──
//
// The full conversation, anchored per turn so every "Question N" citation
// elsewhere in the report can scroll straight to the real exchange it's
// grounded in — the report never asks the candidate to trust an unverifiable
// claim.
//
// Renders EVERY turn that was actually asked, not just answered ones. A
// session ended by the candidate mid-question leaves one trailing turn with
// no answer — the report is allowed to cite that gap as evidence a
// competency wasn't reached (a true, grounded statement), so that citation
// needs a real anchor to scroll to here too. Filtering it out (as an earlier
// version of this component did) left such a citation pointing at nothing.

export function transcriptAnchorId(turnIndex: number): string {
  return `mock-interview-turn-${turnIndex}`;
}

export function ReportTranscript({ turns }: { turns: MockInterviewTurn[] }) {
  const asked = turns.filter((t) => t.interviewer_message.trim().length > 0);
  if (asked.length === 0) return null;
  const answeredCount = asked.filter((t) => t.candidate_answer != null).length;

  return (
    <CollapsibleSection
      icon={MessageSquare}
      title="Full Transcript"
      meta={`${answeredCount} of ${asked.length} answered`}
    >
      <div className="space-y-4">
        {asked.map((t) => (
          <div key={t.id} id={transcriptAnchorId(t.turn_index)} className="scroll-mt-24 space-y-1">
            <p className="text-xs font-medium text-[oklch(0.5_0.02_265)]">
              Question {t.turn_index + 1}
            </p>
            <p className="text-sm text-[oklch(0.3_0.02_265)]">{t.interviewer_message}</p>
            {t.candidate_answer ? (
              <p className="text-sm text-[oklch(0.45_0.02_265)]">
                <span className="text-[oklch(0.55_0.02_265)]">You: </span>
                {t.candidate_answer}
              </p>
            ) : (
              <p className="text-sm italic text-[oklch(0.55_0.02_265)]">
                Not answered — the interview ended here.
              </p>
            )}
          </div>
        ))}
      </div>
    </CollapsibleSection>
  );
}
