import { useState } from "react";
import type { GlobalJob } from "@/types";
import { useNavigate } from "@tanstack/react-router";
import { CheckCircle2, ArrowUpRight, X, Loader2, ExternalLink, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { CompanyMark } from "@/components/dashboard/primitives";
import { StatusBadge } from "@/components/dashboard/applications/ApplicationCard";
import { logoToneForCompany } from "@/features/jobs/utils";
import { cn } from "@/lib/utils";
import {
  useCreateApplication,
  useApplicationForJob,
  useDeleteApplication,
} from "@/features/applications/hooks";
import type { Application } from "@/types";

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
 *   Apply & Track          → create application + open URL + close
 *   Apply Without Tracking → open URL + close
 *   Cancel                 → close only
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
              Ready to apply?
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Track this application in NextOffer so you can:
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
            {/* Primary: Apply & Track */}
            <button
              id="track-modal-track"
              onClick={onTrackAndContinue}
              disabled={isPending}
              className="relative inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-[#2563EB] to-[#7C3AED] py-3 text-sm font-semibold text-white shadow-[0_4px_14px_-4px_rgba(37,99,235,0.6)] transition-all hover:-translate-y-px hover:shadow-[0_6px_20px_-4px_rgba(37,99,235,0.7)] disabled:opacity-70 disabled:cursor-not-allowed disabled:translate-y-0"
            >
              {isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Applying…
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  Apply &amp; Track
                  <ExternalLink className="ml-0.5 h-3.5 w-3.5 opacity-70" />
                </>
              )}
            </button>

            {/* Secondary: Apply without tracking */}
            <button
              id="track-modal-skip"
              onClick={onContinueWithoutTracking}
              disabled={isPending}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-black/5 bg-white py-3 text-sm font-medium text-[oklch(0.4_0.02_265)] transition-colors hover:bg-black/[0.03] disabled:opacity-50"
            >
              <ArrowUpRight className="h-4 w-4" />
              Apply Without Tracking
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── AlreadyTrackingModal ──────────────────────────────────────────────────────

type AlreadyTrackingModalProps = {
  application: Application;
  open: boolean;
  isPending: boolean;
  onViewApplication: () => void;
  onOpenJobPage: () => void;
  onRemoveTracking: () => void;
  onClose: () => void;
};

/**
 * AlreadyTrackingModal
 *
 * Shown when the user tries to track a job that already has an application
 * on file. Same panel/backdrop/gradient-strip styling as TrackApplicationModal.
 *
 * Three actions:
 *   View Application → navigate to the application detail page
 *   Open Job Page    → open the stored job URL in a new tab
 *   Remove Tracking   → delete the existing application, then re-open the
 *                        original Track dialog
 *
 * Closes only via the X icon — no Cancel button.
 */
export function AlreadyTrackingModal({
  application,
  open,
  isPending,
  onViewApplication,
  onOpenJobPage,
  onRemoveTracking,
  onClose,
}: AlreadyTrackingModalProps) {
  const tone = logoToneForCompany(application.company_name);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="already-tracking-modal-title"
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200" />

      {/* Panel */}
      <div className="relative z-10 w-full max-w-sm overflow-hidden rounded-2xl border border-black/5 bg-white shadow-[0_24px_80px_-12px_rgba(0,0,0,0.25)] animate-in slide-in-from-bottom-4 duration-300">
        {/* Gradient strip */}
        <div className="h-1.5 w-full bg-gradient-to-r from-[#2563EB] to-[#7C3AED]" />

        <div className="p-6">
          {/* Close button */}
          <button
            onClick={onClose}
            disabled={isPending}
            aria-label="Close"
            className="absolute right-4 top-5 grid h-7 w-7 place-items-center rounded-lg text-[oklch(0.55_0.02_265)] hover:bg-black/[0.05] transition-colors disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>

          {/* Company info */}
          <div className="flex items-center gap-3">
            <CompanyMark company={application.company_name} tone={tone} size={44} />
            <div className="min-w-0">
              <p className="truncate font-display text-sm font-semibold text-[oklch(0.2_0.02_265)]">
                {application.role}
              </p>
              <p className="truncate text-xs text-[oklch(0.5_0.02_265)]">
                {application.company_name}
              </p>
            </div>
          </div>

          {/* Title + body */}
          <div className="mt-5">
            <h2
              id="already-tracking-modal-title"
              className="font-display text-base font-semibold text-[oklch(0.2_0.02_265)]"
            >
              Already Tracking This Job
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              You're already tracking this application:
            </p>

            <div className="mt-3 space-y-1.5 rounded-xl border border-black/5 bg-[oklch(0.97_0.01_265)] p-3">
              <p className="text-sm font-medium text-[oklch(0.2_0.02_265)]">{application.role}</p>
              <p className="text-xs text-[oklch(0.5_0.02_265)]">{application.company_name}</p>
              <div className="pt-1">
                <StatusBadge status={application.status} />
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="mt-5 flex flex-col gap-2">
            <button
              id="already-tracking-view-application"
              onClick={onViewApplication}
              disabled={isPending}
              className="relative inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-[#2563EB] to-[#7C3AED] py-3 text-sm font-semibold text-white shadow-[0_4px_14px_-4px_rgba(37,99,235,0.6)] transition-all hover:-translate-y-px hover:shadow-[0_6px_20px_-4px_rgba(37,99,235,0.7)] disabled:opacity-70 disabled:cursor-not-allowed disabled:translate-y-0"
            >
              <ExternalLink className="h-4 w-4" />
              View Application
            </button>

            <button
              id="already-tracking-open-job-page"
              onClick={onOpenJobPage}
              disabled={isPending}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-black/5 bg-white py-3 text-sm font-medium text-[oklch(0.4_0.02_265)] transition-colors hover:bg-black/[0.03] disabled:opacity-50"
            >
              <ArrowUpRight className="h-4 w-4" />
              Open Job Page
            </button>

            <button
              id="already-tracking-remove"
              onClick={onRemoveTracking}
              disabled={isPending}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-black/5 bg-white py-3 text-sm font-medium text-rose-600 transition-colors hover:bg-rose-50 disabled:opacity-50"
            >
              {isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              Remove Tracking
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

export function useTrackApplication(job: GlobalJob | null | undefined, onClose?: () => void) {
  const [isOpen, setIsOpen] = useState(false);
  const [alreadyTrackedApplication, setAlreadyTrackedApplication] = useState<Application | null>(
    null,
  );
  const navigate = useNavigate();
  const createApplication = useCreateApplication();
  const deleteApplication = useDeleteApplication();
  const { data: existingApplication } = useApplicationForJob(job?.id);

  /** Called by both "Apply Now" buttons in the job detail page. */
  const handleApplyClick = () => {
    if (!job?.url) return;
    setIsOpen(true);
  };

  /** Create application first, then open URL — skips creation if already tracked. */
  const handleTrackAndContinue = () => {
    if (!job) return;

    if (existingApplication) {
      // Already tracked — do not insert again. Surface state for a future
      // "Already Tracking" dialog to consume; no dialog is built here.
      setAlreadyTrackedApplication(existingApplication);
      setIsOpen(false);
      onClose?.();
      return;
    }

    createApplication.mutate(
      { job },
      {
        onSuccess: () => {
          toast.success(`Application tracked for ${job.role} at ${job.company_name}!`);

          setIsOpen(false);
          onClose?.();

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
    onClose?.();

    if (job?.url) {
      setTimeout(() => {
        window.open(job.url, "_blank", "noopener,noreferrer");
      }, 100);
    }
  };

  /** Close the modal without any side-effects. */
  const handleCancel = () => {
    setIsOpen(false);
    onClose?.();
  };

  /** Navigate to the existing application's detail page. */
  const handleViewApplication = () => {
    if (!alreadyTrackedApplication) return;
    void navigate({
      to: "/dashboard/applications/$applicationId",
      params: { applicationId: alreadyTrackedApplication.id },
    });
    setAlreadyTrackedApplication(null);
  };

  /** Open the stored job URL from the existing application, then close. */
  const handleOpenJobPage = () => {
    if (!alreadyTrackedApplication?.url) {
      setAlreadyTrackedApplication(null);
      return;
    }
    window.open(alreadyTrackedApplication.url, "_blank", "noopener,noreferrer");
    setAlreadyTrackedApplication(null);
  };

  /** Delete the existing application, then re-open the Track dialog. */
  const handleRemoveTracking = () => {
    if (!alreadyTrackedApplication) return;
    deleteApplication.mutate(
      { id: alreadyTrackedApplication.id },
      {
        onSuccess: () => {
          toast.success("Tracking removed.");
          setAlreadyTrackedApplication(null);
          setIsOpen(true);
        },
        onError: () => {
          toast.error("Failed to remove tracking. Please try again.");
        },
      },
    );
  };

  /** X button — dismiss the Already Tracking dialog with no further action. */
  const handleCloseAlreadyTracking = () => {
    setAlreadyTrackedApplication(null);
  };

  return {
    isOpen,
    handleApplyClick,
    handleTrackAndContinue,
    handleContinueWithoutTracking,
    handleCancel,
    isPending: createApplication.isPending,
    alreadyTrackedApplication,
    handleViewApplication,
    handleOpenJobPage,
    handleRemoveTracking,
    handleCloseAlreadyTracking,
    isRemovingTracking: deleteApplication.isPending,
  };
}
