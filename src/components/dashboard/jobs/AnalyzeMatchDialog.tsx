import { Link } from "@tanstack/react-router";
import { Loader2, Sparkles, X } from "lucide-react";

// ── AnalyzeMatchDialog (Module 6B) ──
//
// Every credit-spending AI action (Analyze / Re-analyze) must show this
// confirmation before the request is sent — no auto-run, ever. Same
// fixed-overlay/gradient-strip convention as TrackApplicationModal (see
// components/dashboard/applications/ApplyPromptDialog.tsx) so the dashboard's
// modals feel like one system.

type Props = {
  open: boolean;
  reAnalyze: boolean;
  creditsRemaining: number;
  isPending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function AnalyzeMatchDialog({
  open,
  reAnalyze,
  creditsRemaining,
  isPending,
  onConfirm,
  onCancel,
}: Props) {
  if (!open) return null;

  const locked = creditsRemaining <= 0;
  const title = reAnalyze ? "Re-analyze Resume Match" : "Analyze Resume Match";
  const actionLabel = reAnalyze ? "Re-analyze" : "Analyze";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="analyze-match-title"
    >
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={isPending ? undefined : onCancel}
      />

      <div className="relative z-10 w-full max-w-sm overflow-hidden rounded-2xl border border-black/5 bg-white shadow-[0_24px_80px_-12px_rgba(0,0,0,0.25)] animate-in slide-in-from-bottom-4 duration-300">
        <div className="h-1.5 w-full bg-gradient-to-r from-[#2563EB] to-[#7C3AED]" />

        <div className="p-6">
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
            id="analyze-match-title"
            className="mt-4 font-display text-base font-semibold text-[oklch(0.2_0.02_265)]"
          >
            {title}
          </h2>

          {locked ? (
            <>
              <p className="mt-2 text-sm text-muted-foreground">
                You're out of AI credits, so this can't run right now.
              </p>
              <Link
                to="/pricing"
                className="mt-4 inline-flex w-full items-center justify-center rounded-xl border border-black/10 bg-white py-2.5 text-sm font-medium text-[oklch(0.25_0.02_265)] transition-colors hover:bg-black/[0.03]"
              >
                See upgrade options
              </Link>
            </>
          ) : (
            <>
              <p className="mt-2 text-sm text-muted-foreground">
                This will use AI and consume <span className="font-medium">1 AI Credit</span>.
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                You have <span className="font-medium">{creditsRemaining}</span> AI Credit
                {creditsRemaining === 1 ? "" : "s"} remaining.
              </p>

              <div className="mt-5 flex flex-col gap-2">
                <button
                  onClick={onConfirm}
                  disabled={isPending}
                  className="relative inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-[#2563EB] to-[#7C3AED] py-2.5 text-sm font-semibold text-white shadow-[0_4px_14px_-4px_rgba(37,99,235,0.6)] transition-all hover:-translate-y-px hover:shadow-[0_6px_20px_-4px_rgba(37,99,235,0.7)] disabled:opacity-70 disabled:cursor-not-allowed disabled:translate-y-0"
                >
                  {isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> Analyzing…
                    </>
                  ) : (
                    actionLabel
                  )}
                </button>
                <button
                  onClick={onCancel}
                  disabled={isPending}
                  className="inline-flex w-full items-center justify-center rounded-xl border border-black/5 bg-white py-2.5 text-sm font-medium text-[oklch(0.4_0.02_265)] transition-colors hover:bg-black/[0.03] disabled:opacity-50"
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
