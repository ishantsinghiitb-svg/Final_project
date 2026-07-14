import { useState } from "react";
import type { GlobalJob } from "@/types";
import {
  CheckCircle2,
  ArrowUpRight,
  X,
  Loader2,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import { CompanyMark } from "@/components/dashboard/primitives";
import { logoToneForCompany } from "@/features/jobs/utils";
import { cn } from "@/lib/utils";
import { useCreateApplication } from "@/features/applications/hooks";

// ── TrackApplicationModal ─────────────────────────────────────────────────────

type ModalProps = {
  job: GlobalJob;
  open: boolean;
  isPending: boolean;
  onTrackAndContinue: () => void;
  onContinueWithoutTracking: () => void;
  onCancel: () => void;
};

/**
 * TrackApplicationModal
 *
 * Shown immediately when user clicks "Apply Now" — before opening the external
 * job page. Deterministic: no browser events, no focus detection.
 *
 * Three actions:
 *   Track & Continue          → create application + open URL + close
 *   Continue Without Tracking → open URL + close
 *   Cancel                    → close only
 */
export function TrackApplicationModal({
  job,
  open,
  isPending,
  onTrackAndContinue,
  onContinueWithoutTracking,
  onCancel,
}: ModalProps) {
  const tone = logoToneForCompany(job.company_name);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="track-modal-title"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={onCancel}
      />

      {/* Panel */}
      <div className="relative z-10 w-full max-w-sm overflow-hidden rounded-2xl border border-black/5 bg-white shadow-[0_24px_80px_-12px_rgba(0,0,0,0.25)] animate-in slide-in-from-bottom-4 duration-300">
        {/* Gradient strip */}
        <div className="h-1.5 w-full bg-gradient-to-r from-[#2563EB] to-[#7C3AED]" />

        <div className="p-6">
          {/* Close button */}
          <button
            onClick={onCancel}
            disabled={isPending}
            aria-label="Close"
            className="absolute right-4 top-5 grid h-7 w-7 place-items-center rounded-lg text-[oklch(0.55_0.02_265)] hover:bg-black/[0.05] transition-colors disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>

          {/* Company info */}
          <div className="flex items-center gap-3">
            <CompanyMark company={job.company_name} tone={tone} size={44} />
            <div className="min-w-0">
              <p className="truncate font-display text-sm font-semibold text-[oklch(0.2_0.02_265)]">
                {job.role}
              </p>
              <p className="truncate text-xs text-[oklch(0.5_0.02_265)]">{job.company_name}</p>
            </div>
          </div>

          {/* Title + body */}
          <div className="mt-5">
            <h2
              id="track-modal-title"
              className="font-display text-base font-semibold text-[oklch(0.2_0.02_265)]"
            >
              Track this application in NextOffer?
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              We'll automatically add this job to your application tracker so you can:
            </p>

            <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
              <li>• Track interview progress</li>
              <li>• Keep notes and resumes together</li>
              <li>• Never lose this application</li>
              <li>• View it on your Kanban board</li>
            </ul>

            <p className="mt-4 text-sm font-medium">
              You'll still apply on the company's official website.
            </p>
          </div>

          {/* Actions */}
          <div className="mt-5 flex flex-col gap-2">
            {/* Primary: Track & Continue */}
            <button
              id="track-modal-track"
              onClick={onTrackAndContinue}
              disabled={isPending}
              className="relative inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-[#2563EB] to-[#7C3AED] py-3 text-sm font-semibold text-white shadow-[0_4px_14px_-4px_rgba(37,99,235,0.6)] transition-all hover:-translate-y-px hover:shadow-[0_6px_20px_-4px_rgba(37,99,235,0.7)] disabled:opacity-70 disabled:cursor-not-allowed disabled:translate-y-0"
            >
              {isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Creating application…
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  Track &amp; Continue
                  <ExternalLink className="ml-0.5 h-3.5 w-3.5 opacity-70" />
                </>
              )}
            </button>

            {/* Secondary: Continue without tracking */}
            <button
              id="track-modal-skip"
              onClick={onContinueWithoutTracking}
              disabled={isPending}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-black/5 bg-white py-3 text-sm font-medium text-[oklch(0.4_0.02_265)] transition-colors hover:bg-black/[0.03] disabled:opacity-50"
            >
              <ArrowUpRight className="h-4 w-4" />
              Continue Without Tracking
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── useTrackApplication ───────────────────────────────────────────────────────
// Self-contained hook. Manages modal state + application creation + URL opening.
// No browser events. Fully deterministic.

export function useTrackApplication(job: GlobalJob | null | undefined, onClose: () => void) {
  const [isOpen, setIsOpen] = useState(false);
  const createApplication = useCreateApplication();

  /** Called by both "Apply Now" buttons in the job detail page. */
  const handleApplyClick = () => {
    console.log("Apply clicked");
    console.log("Job:", job);

    if (!job?.url) {
      console.log("No URL found");
      return;
    }

    console.log("Opening modal");
    setIsOpen(true);
  };

  /** Create application first, then open URL. */
  const handleTrackAndContinue = () => {
    if (!job) return;
    createApplication.mutate(
      { job },
      {
        onSuccess: () => {
          toast.success(`Application tracked for ${job.role} at ${job.company_name}!`);

          setIsOpen(false);
          onClose();

          setTimeout(() => {
            window.open(job.url!, "_blank", "noopener,noreferrer");
          }, 100);
        },
        onError: (err) => {
          toast.error(
            err instanceof Error ? err.message : "Failed to create application. Please try again.",
          );
        },
      },
    );
  };

  /** Open URL without creating an application. */
  const handleContinueWithoutTracking = () => {
    setIsOpen(false);
    onClose();

    if (job?.url) {
      setTimeout(() => {
        window.open(job.url, "_blank", "noopener,noreferrer");
      }, 100);
    }
  };

  /** Close the modal without any side-effects. */
  const handleCancel = () => {
    setIsOpen(false);
    onClose();
  };

  return {
    isOpen,
    handleApplyClick,
    handleTrackAndContinue,
    handleContinueWithoutTracking,
    handleCancel,
    isPending: createApplication.isPending,
  };
}
