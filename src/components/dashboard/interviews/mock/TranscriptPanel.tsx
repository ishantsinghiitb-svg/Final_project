import { useState } from "react";
import { ChevronDown, MessageSquare } from "lucide-react";
import type { MockInterviewTurn } from "@/features/mock-interview/types";
import { cn } from "@/lib/utils";

// ── TranscriptPanel (Module 7C) ──
//
// Collapsed by default — this is NOT a chat interface, it's a reference the
// candidate can check, not the primary surface. Only answered exchanges are
// shown; the current unanswered question is already on stage above.

export function TranscriptPanel({ turns }: { turns: MockInterviewTurn[] }) {
  const [open, setOpen] = useState(false);
  const answered = turns.filter((t) => t.candidate_answer != null || t.action === "close");
  if (answered.length === 0) return null;

  return (
    <div className="mx-auto w-full max-w-4xl px-4 md:px-6">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 py-2 text-xs font-medium text-white/40 transition-colors hover:text-white/70"
      >
        <MessageSquare className="h-3.5 w-3.5" />
        Transcript ({answered.length} exchange{answered.length === 1 ? "" : "s"})
        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="max-h-64 space-y-3 overflow-y-auto rounded-xl border border-white/10 bg-white/[0.03] p-4">
          {answered.map((t) => (
            <div key={t.id} className="space-y-1 text-sm">
              <p className="text-white/70">
                <span className="text-white/40">Interviewer:</span> {t.interviewer_message}
              </p>
              {t.candidate_answer && (
                <p className="text-white/50">
                  <span className="text-white/30">You:</span> {t.candidate_answer}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
