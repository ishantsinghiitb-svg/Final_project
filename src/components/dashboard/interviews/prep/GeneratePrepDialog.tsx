import { Sparkles, X } from "lucide-react";
import { AIThinkingPanel } from "@/components/dashboard/ai/AIThinking";
import { AI_CAPABILITIES } from "@/features/ai/constants";
import { INTERVIEW_PREP_CREDIT_COST } from "@/features/interview-prep/constants";
import { useDialogA11y } from "@/hooks/useDialogA11y";
import { RegeneratePrepWarning } from "./RegeneratePrepWarning";
import { NeedMoreCreditsLink } from "../../ai/NeedMoreCredits";
import { DashButton } from "@/components/dashboard/DashButton";

// ── GeneratePrepDialog (Module 7B) ──
//
// Credit-spending confirmation for generating or regenerating the entire
// preparation — modeled on OptimizeConfirmDialog's fixed-overlay/gradient-
// strip convention (a new, independent file, not a shared import) so this
// still reads as part of the same dashboard, without coupling this feature to
// the Optimizer's code. Once confirmed, the dialog becomes the loading
// surface — generation takes real time (a 7-phase reasoning pass), so a
// motionless modal for that long would read as a hang.

type Props = {
  open: boolean;
  isRegenerate: boolean;
  answeredCount: number;
  creditsRemaining: number;
  isPending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function GeneratePrepDialog({
  open,
  isRegenerate,
  answeredCount,
  creditsRemaining,
  isPending,
  onConfirm,
  onCancel,
}: Props) {
  const dialogRef = useDialogA11y<HTMLDivElement>(open, () => {
    if (!isPending) onCancel();
  });

  if (!open) return null;

  // Not just "any credits at all" — this action costs 3, so 1 or 2 remaining
  // is just as unable to run as 0. Checking `<= 0` here would show the normal
  // confirm button right up until the server rejects the charge.
  const locked = creditsRemaining < INTERVIEW_PREP_CREDIT_COST;
  const title = isRegenerate ? "Regenerate Entire Preparation" : "Generate your preparation";
  const actionLabel = isRegenerate ? "Regenerate" : "Generate";

  return (
    <div
      ref={dialogRef}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="generate-prep-title"
    >
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={isPending ? undefined : onCancel}
      />

      <div className="relative z-10 w-full max-w-sm overflow-hidden rounded-2xl border border-black/5 bg-white shadow-[0_24px_80px_-12px_rgba(0,0,0,0.25)] animate-in slide-in-from-bottom-4 duration-300">
        <div className="h-1.5 w-full bg-gradient-to-r from-[#2563EB] to-[#7C3AED]" />

        <div className="p-5">
          <button
            onClick={onCancel}
            disabled={isPending}
            aria-label="Close"
            className="absolute right-3.5 top-4 grid h-7 w-7 place-items-center rounded-lg text-[oklch(0.55_0.02_265)] hover:bg-black/[0.05] transition-colors disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>

          <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-[#2563EB]/10 to-[#7C3AED]/15 text-[#7C3AED]">
            <Sparkles className="h-4 w-4" />
          </div>

          <h2
            id="generate-prep-title"
            className="mt-3 font-display text-sm font-semibold text-[oklch(0.2_0.02_265)]"
          >
            {title}
          </h2>

          {isPending ? (
            <>
              <AIThinkingPanel
                capability={AI_CAPABILITIES.INTERVIEW_PREP}
                className="mt-3 border-0 bg-transparent p-0"
              />
              <p className="mt-3 text-xs text-[oklch(0.5_0.02_265)]">
                This takes a little while — we're working through the job, your resume, and what
                this round is likely to test.
              </p>
            </>
          ) : locked ? (
            <>
              <p className="mt-2 text-xs text-muted-foreground">
                This needs {INTERVIEW_PREP_CREDIT_COST} AI Credits, and you have{" "}
                <span className="font-medium">{creditsRemaining}</span> remaining — so this can't
                run right now.
              </p>
              <NeedMoreCreditsLink
                variant="secondary"
                context="interview preparation"
                className="mt-3"
              />
            </>
          ) : (
            <>
              <p className="mt-2 text-xs text-muted-foreground">
                This will use AI and consume <span className="font-medium">3 AI Credits</span>. Once
                it's ready, reading, navigating and generating answers for every question is
                unlimited.
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                You have <span className="font-medium">{creditsRemaining}</span> AI Credit
                {creditsRemaining === 1 ? "" : "s"} remaining.
              </p>

              {isRegenerate && <RegeneratePrepWarning answeredCount={answeredCount} />}

              <div className="mt-4 flex flex-col gap-2">
                <DashButton onClick={onConfirm}>{actionLabel}</DashButton>
                <DashButton variant="outline" onClick={onCancel}>
                  Cancel
                </DashButton>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
