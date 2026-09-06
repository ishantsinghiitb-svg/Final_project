import { Sparkles, X } from "lucide-react";
import { AIThinkingPanel } from "@/components/dashboard/ai/AIThinking";
import { AI_CAPABILITIES } from "@/features/ai/constants";
import { NeedMoreCreditsLink } from "../ai/NeedMoreCredits";
import { DashButton } from "@/components/dashboard/DashButton";

// ── OptimizeConfirmDialog (Module 6D) ──
//
// Credit-spending confirmation for a resume optimization — no auto-run, ever.
// Deliberately the same fixed-overlay/gradient-strip convention as the frozen
// Module 6B/6C analyze dialogs (a parallel copy, not a shared edit) so the
// dashboard's modals keep feeling like one system.
//
// Module 6G: once confirmed, the dialog BECOMES the loading surface rather than
// dimming a button behind a spinner. Optimization is the longest wait in the
// product (an exhaustive audit plus a gap-fill pass), and a motionless modal
// for that long reads as a hang — so the wait narrates itself instead.

type Props = {
  open: boolean;
  reOptimize: boolean;
  creditsRemaining: number;
  isPending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function OptimizeConfirmDialog({
  open,
  reOptimize,
  creditsRemaining,
  isPending,
  onConfirm,
  onCancel,
}: Props) {
  if (!open) return null;

  const locked = creditsRemaining <= 0;
  const title = reOptimize ? "Re-optimize resume" : "Optimize resume";
  const actionLabel = reOptimize ? "Re-optimize" : "Optimize";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="optimize-confirm-title"
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
            id="optimize-confirm-title"
            className="mt-3 font-display text-sm font-semibold text-[oklch(0.2_0.02_265)]"
          >
            {title}
          </h2>

          {isPending ? (
            <>
              <AIThinkingPanel
                capability={AI_CAPABILITIES.RESUME_OPTIMIZER}
                className="mt-3 border-0 bg-transparent p-0"
              />
              <p className="mt-3 text-xs text-[oklch(0.5_0.02_265)]">
                This takes about a minute. You'll review every suggestion before anything is saved.
              </p>
            </>
          ) : locked ? (
            <>
              <p className="mt-2 text-xs text-muted-foreground">
                You're out of AI credits, so this can't run right now.
              </p>
              <NeedMoreCreditsLink
                variant="secondary"
                context="the resume optimizer"
                className="mt-3"
              />
            </>
          ) : (
            <>
              <p className="mt-2 text-xs text-muted-foreground">
                This will use AI and consume <span className="font-medium">1 AI Credit</span>. You
                review every change before anything is saved.
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                You have <span className="font-medium">{creditsRemaining}</span> AI Credit
                {creditsRemaining === 1 ? "" : "s"} remaining.
              </p>

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
