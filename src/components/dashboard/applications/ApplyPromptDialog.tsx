import { useEffect, useRef, useState } from "react";
import type { GlobalJob } from "@/types";
import { CheckCircle2, XCircle, Loader2, ExternalLink } from "lucide-react";
import { CompanyMark } from "@/components/dashboard/primitives";
import { logoToneForCompany } from "@/features/jobs/utils";

type Props = {
  job: GlobalJob;
  open: boolean;
  onConfirm: () => void;
  onDismiss: () => void;
  isPending: boolean;
};

/**
 * ApplyPromptDialog
 *
 * Shown when the user returns focus to the tab after clicking "Apply Now"
 * on an external job listing. Asks: "Did you apply?" and creates an
 * application record on YES.
 *
 * This is a custom lightweight dialog (no Radix) to avoid import complexity
 * and stay consistent with the dashboard's existing inline UI patterns.
 */
export function ApplyPromptDialog({ job, open, onConfirm, onDismiss, isPending }: Props) {
  const tone = logoToneForCompany(job.company_name);
  const overlayRef = useRef<HTMLDivElement>(null);

  // Trap focus inside the dialog
  useEffect(() => {
    if (open) {
      overlayRef.current?.focus();
    }
  }, [open]);

  if (!open) return null;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="apply-prompt-title"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={onDismiss}
      />

      {/* Panel */}
      <div className="relative z-10 w-full max-w-sm overflow-hidden rounded-2xl border border-black/5 bg-white shadow-[0_24px_80px_-12px_rgba(0,0,0,0.25)] animate-in slide-in-from-bottom-4 duration-300">
        {/* Gradient header strip */}
        <div className="h-1.5 w-full bg-gradient-to-r from-[#2563EB] to-[#7C3AED]" />

        <div className="p-6">
          {/* Company mark + info */}
          <div className="flex items-center gap-3">
            <CompanyMark company={job.company_name} tone={tone} size={44} />
            <div className="min-w-0">
              <p className="truncate font-display text-sm font-semibold text-[oklch(0.2_0.02_265)]">
                {job.role}
              </p>
              <p className="truncate text-xs text-[oklch(0.5_0.02_265)]">
                {job.company_name}
              </p>
            </div>
          </div>

          {/* Question */}
          <div className="mt-5">
            <p
              id="apply-prompt-title"
              className="font-display text-base font-semibold text-[oklch(0.2_0.02_265)]"
            >
              Did you apply?
            </p>
            <p className="mt-1 text-sm text-[oklch(0.5_0.02_265)] leading-relaxed">
              We'll track this application and help you stay on top of every
              next step.
            </p>
          </div>

          {/* CTA buttons */}
          <div className="mt-5 flex flex-col gap-2">
            <button
              id="apply-prompt-yes"
              onClick={onConfirm}
              disabled={isPending}
              className="relative inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-[#2563EB] to-[#7C3AED] py-3 text-sm font-semibold text-white shadow-[0_4px_14px_-4px_rgba(37,99,235,0.6)] transition-all hover:-translate-y-px hover:shadow-[0_6px_20px_-4px_rgba(37,99,235,0.7)] disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Tracking…
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  Yes, I applied!
                </>
              )}
            </button>

            <button
              id="apply-prompt-no"
              onClick={onDismiss}
              disabled={isPending}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-black/5 bg-white py-3 text-sm font-medium text-[oklch(0.4_0.02_265)] transition-colors hover:bg-black/[0.03] disabled:opacity-50"
            >
              <XCircle className="h-4 w-4" />
              No, just browsing
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── useApplyPrompt ────────────────────────────────────────────────────────────
// Hook that manages the "Did you apply?" flow:
//   1. Opens the job URL in a new tab
//   2. Listens for the window to regain focus
//   3. Shows the prompt dialog

export function useApplyPrompt(job: GlobalJob | null | undefined) {
  const [showPrompt, setShowPrompt] = useState(false);
  const hasOpenedRef = useRef(false);

  const handleApplyClick = () => {
    if (!job?.url) return;

    // Open the external job page
    window.open(job.url, "_blank", "noopener,noreferrer");
    hasOpenedRef.current = true;
  };

  useEffect(() => {
    if (!hasOpenedRef.current) return;

    const onFocus = () => {
      if (hasOpenedRef.current) {
        setShowPrompt(true);
        hasOpenedRef.current = false;
      }
    };

    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  const dismissPrompt = () => {
    setShowPrompt(false);
    hasOpenedRef.current = false;
  };

  return { showPrompt, handleApplyClick, dismissPrompt };
}
