import { Sparkles, X } from "lucide-react";
import { AIThinkingPanel } from "@/components/dashboard/ai/AIThinking";
import { AI_CAPABILITIES } from "@/features/ai/constants";
import { MOCK_INTERVIEW_CREDIT_COST } from "@/features/mock-interview/constants";
import { useDialogA11y } from "@/hooks/useDialogA11y";
import { NeedMoreCreditsLink } from "../../ai/NeedMoreCredits";

// ── StartMockInterviewDialog (Module 7C) ──
//
// Credit-spending confirmation for starting a mock interview session —
// modeled directly on GeneratePrepDialog's fixed-overlay/gradient-strip
// convention. Unlike Interview Preparation there is no "regenerate" variant:
// every Start is a brand-new, independently-priced session, so the copy is
// always the same shape. Once confirmed, the dialog becomes the loading
// surface for the planning call (10-25s) before the studio takes over.

type Props = {
  open: boolean;
  creditsRemaining: number;
  isPending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function StartMockInterviewDialog({
  open,
  creditsRemaining,
  isPending,
  onConfirm,
  onCancel,
}: Props) {
  // Mirrors the backdrop-click/X-button guard below — Escape shouldn't close
  // the dialog out from under an in-flight charge.
  const dialogRef = useDialogA11y<HTMLDivElement>(open, () => {
    if (!isPending) onCancel();
  });

  if (!open) return null;

  const locked = creditsRemaining < MOCK_INTERVIEW_CREDIT_COST;

  return (
    <div
      ref={dialogRef}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="start-mock-interview-title"
    >
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={isPending ? undefined : onCancel}
      />

      <div className="relative z-10 w-full max-w-sm overflow-hidden rounded-2xl border border-black/5 bg-white shadow-[0_24px_80px_-12px_rgba(0,0,0,0.25)] animate-in slide-in-from-bottom-4 duration-300">
        <div className="h-1.5 w-full bg-gradient-to-r from-[#2563EB] to-[#7C3AED]" />

        <div className="relative p-6">
          <button
            onClick={onCancel}
            disabled={isPending}
            aria-label="Close"
            className="absolute right-4 top-5 grid h-7 w-7 place-items-center rounded-lg text-[oklch(0.55_0.02_265)] hover:bg-black/[0.05] transition-colors disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>

          <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-[#2563EB]/10 to-[#7C3AED]/15 text-[#7C3AED]">
            <Sparkles className="h-5 w-5" />
          </div>

          <h2
            id="start-mock-interview-title"
            className="mt-4 font-display text-base font-semibold text-[oklch(0.2_0.02_265)]"
          >
            Start Mock Interview
          </h2>

          {isPending ? (
            <>
              <AIThinkingPanel
                capability={AI_CAPABILITIES.MOCK_INTERVIEW}
                className="mt-3 border-0 bg-transparent p-0"
              />
              <p className="mt-4 text-xs text-[oklch(0.5_0.02_265)]">
                We're building your interviewer's strategy from your resume, this job, and
                everything else you've prepared so far.
              </p>
            </>
          ) : locked ? (
            <>
              <p className="mt-2 text-sm text-muted-foreground">
                This needs {MOCK_INTERVIEW_CREDIT_COST} AI Credits, and you have{" "}
                <span className="font-medium">{creditsRemaining}</span> remaining — so this can't
                start right now.
              </p>
              <NeedMoreCreditsLink
                variant="secondary"
                context="a mock interview"
                className="mt-4"
              />
            </>
          ) : (
            <>
              <p className="mt-2 text-sm text-muted-foreground">
                Starting this mock interview uses{" "}
                <span className="font-medium">{MOCK_INTERVIEW_CREDIT_COST} AI Credits</span>. Once
                it starts, every question, follow-up, voice, typing, and the final report are
                unlimited — only starting a brand-new mock interview costs credits again.
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                You have <span className="font-medium">{creditsRemaining}</span> AI Credit
                {creditsRemaining === 1 ? "" : "s"} remaining.
              </p>

              <div className="mt-5 flex flex-col gap-2">
                <button
                  onClick={onConfirm}
                  className="relative inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-[#2563EB] to-[#7C3AED] py-2.5 text-sm font-semibold text-white shadow-[0_4px_14px_-4px_rgba(37,99,235,0.6)] transition-all hover:-translate-y-px hover:shadow-[0_6px_20px_-4px_rgba(37,99,235,0.7)]"
                >
                  Start Mock Interview
                </button>
                <button
                  onClick={onCancel}
                  className="inline-flex w-full items-center justify-center rounded-xl border border-black/5 bg-white py-2.5 text-sm font-medium text-[oklch(0.4_0.02_265)] transition-colors hover:bg-black/[0.03]"
                >
                  Cancel
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
