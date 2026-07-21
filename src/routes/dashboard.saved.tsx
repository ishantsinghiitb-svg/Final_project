import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Bookmark,
  MapPin,
  ChevronLeft,
  ChevronRight,
  Loader2,
  AlertCircle,
  BookmarkCheck,
  ArrowUpRight,
  Archive,
  ArchiveRestore,
} from "lucide-react";
import {
  DashCard,
  PageHeader,
  Chip,
  CompanyMark,
  EmptyState,
  StickyPageHeader,
} from "@/components/dashboard/primitives";
import { DashButtonLink } from "@/components/dashboard/DashButton";
import {
  TrackApplicationModal,
  AlreadyTrackingModal,
  useTrackApplication,
} from "@/components/dashboard/applications/ApplyPromptDialog";
import {
  useSavedJobs,
  useArchivedSavedJobs,
  useSavedJobIds,
  useSaveJob,
  useUnsaveJob,
  useArchiveSavedJob,
  useUnarchiveSavedJob,
  useSavedArchiveEnabled,
} from "@/features/jobs/hooks";
import { toast } from "sonner";
import { useTrackedJobIds } from "@/features/applications/hooks";
import { AddToCollectionMenu } from "@/components/dashboard/collections/AddToCollectionMenu";
import { getJobBadges } from "@/features/jobs/utils";
import type { PaginationParams } from "@/types";
import { DEFAULT_PAGINATION } from "@/features/jobs/constants";
import type { GlobalJob } from "@/types";

export const Route = createFileRoute("/dashboard/saved")({
  head: () => ({
    meta: [
      { title: "Saved jobs — NextOffer" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SavedPage,
});

// ── Stable gradient palette ────────────────────────────────────────────────
const LOGO_GRADIENTS = [
  "from-[#5E6AD2] to-[#3B82F6]",
  "from-[#111827] to-[#374151]",
  "from-[#635BFF] to-[#7C3AED]",
  "from-[#E5E7EB] to-[#9CA3AF]",
  "from-[#FF6363] to-[#F59E0B]",
  "from-[#C97A5A] to-[#7C3AED]",
  "from-[#F24E1E] to-[#A259FF]",
  "from-[#000]    to-[#374151]",
  "from-[#F59E0B] to-[#EAB308]",
  "from-[#EC4899] to-[#8B5CF6]",
  "from-[#20B8CD] to-[#0EA5E9]",
  "from-[#3B82F6] to-[#6366F1]",
];

function logoToneForCompany(name: string): string {
  const idx = (name.charCodeAt(0) ?? 0) % LOGO_GRADIENTS.length;
  return LOGO_GRADIENTS[idx];
}

function formatSalary(job: GlobalJob): string {
  if (!job.salary_min && !job.salary_max) return "";
  const currency = job.salary_currency ?? "USD";
  const fmt = (n: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
      notation: "compact",
    }).format(n);
  if (job.salary_min && job.salary_max)
    return `${fmt(job.salary_min)}–${fmt(job.salary_max)}`;
  if (job.salary_min) return `${fmt(job.salary_min)}+`;
  return `Up to ${fmt(job.salary_max!)}`;
}

function SavedPage() {
  // Active vs. archived partition — "archive instead of delete" (decision #7).
  const [view, setView] = useState<"active" | "archived">("active");
  const [pagination, setPagination] =
    useState<PaginationParams>(DEFAULT_PAGINATION);

  const activeQuery = useSavedJobs(view === "active" ? pagination : DEFAULT_PAGINATION);
  const archivedQuery = useArchivedSavedJobs(
    view === "archived" ? pagination : DEFAULT_PAGINATION,
  );

  const { data: result, isLoading, isError, error, isFetching } =
    view === "active" ? activeQuery : archivedQuery;

  const { data: savedIds = [] } = useSavedJobIds();
  const { data: trackedIds = [] } = useTrackedJobIds();
  const { data: archiveEnabled = false } = useSavedArchiveEnabled();
  const unsaveJob = useUnsaveJob();
  const saveJob = useSaveJob();
  const archiveJob = useArchiveSavedJob();
  const unarchiveJob = useUnarchiveSavedJob();

  // Archive controls only render once the migration is applied; force the
  // active partition otherwise so the page behaves exactly as it did pre-archive.
  const isArchivedView = archiveEnabled && view === "archived";
  const jobs = result?.data ?? [];
  const total = result?.total ?? 0;
  const totalPages = result?.totalPages ?? 1;
  const activeTotal = activeQuery.data?.total ?? 0;
  const archivedTotal = archivedQuery.data?.total ?? 0;

  // Switching partition resets to page 1 so the shared pagination state never
  // lands the user on a page that doesn't exist in the other partition.
  const switchView = (next: "active" | "archived") => {
    if (next === view) return;
    setView(next);
    setPagination(DEFAULT_PAGINATION);
  };

  // Apply flow — same TrackApplicationModal/AlreadyTrackingModal used on the
  // Jobs board and Job Detail page, so "Apply" behaves identically everywhere.
  const [selectedJob, setSelectedJob] = useState<GlobalJob | null>(null);
  const {
    isOpen: trackModalOpen,
    handleApplyClick,
    handleTrackAndContinue,
    handleContinueWithoutTracking,
    handleCancel,
    isPending,
    alreadyTrackedApplication,
    handleViewApplication,
    handleOpenJobPage,
    handleRemoveTracking,
    handleCloseAlreadyTracking,
    isRemovingTracking,
  } = useTrackApplication(selectedJob, () => {
    setSelectedJob(null);
  });

  useEffect(() => {
    if (selectedJob) {
      handleApplyClick();
    }
  }, [selectedJob, handleApplyClick]);

  return (
    <>
      <StickyPageHeader>
      <PageHeader
        eyebrow="Saved"
        title="Everything you bookmarked, in one place."
        subtitle="Jobs you saved from the extension, LinkedIn, Wellfound, or added manually — organized by when you saved them."
        actions={
          <div className="flex items-center gap-2">
            {isFetching && (
              <Loader2 className="h-4 w-4 animate-spin text-[oklch(0.5_0.02_265)]" />
            )}
            {archiveEnabled && (
              <div className="inline-flex items-center rounded-lg border border-black/5 bg-white p-0.5 text-xs font-medium">
                <button
                  onClick={() => switchView("active")}
                  className={
                    view === "active"
                      ? "rounded-md bg-[oklch(0.95_0.02_265)] px-3 py-1.5 text-[#2563EB]"
                      : "rounded-md px-3 py-1.5 text-[oklch(0.45_0.02_265)] hover:bg-black/[0.03]"
                  }
                >
                  Active{activeTotal > 0 ? ` (${activeTotal})` : ""}
                </button>
                <button
                  onClick={() => switchView("archived")}
                  className={
                    view === "archived"
                      ? "rounded-md bg-[oklch(0.95_0.02_265)] px-3 py-1.5 text-[#2563EB]"
                      : "rounded-md px-3 py-1.5 text-[oklch(0.45_0.02_265)] hover:bg-black/[0.03]"
                  }
                >
                  Archived{archivedTotal > 0 ? ` (${archivedTotal})` : ""}
                </button>
              </div>
            )}
          </div>
        }
      />
      </StickyPageHeader>

      {isLoading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-[oklch(0.5_0.02_265)]">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading saved jobs…
        </div>
      ) : isError ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <AlertCircle className="h-8 w-8 text-rose-500" />
          <p className="font-display text-sm font-semibold">
            Failed to load saved jobs
          </p>
          <p className="max-w-xs text-xs text-[oklch(0.5_0.02_265)]">
            {error instanceof Error
              ? error.message
              : "An unexpected error occurred."}
          </p>
        </div>
      ) : jobs.length === 0 ? (
        isArchivedView ? (
          <EmptyState
            icon={Archive}
            title="No archived jobs"
            body="Jobs you archive from your saved list will be tucked away here — still saved, just out of the way."
          />
        ) : (
          <EmptyState
            icon={Bookmark}
            title="Nothing saved yet"
            body="Install the extension and hit the bookmark icon on any job posting to send it here."
            cta={<DashButtonLink to="/features">Get the extension</DashButtonLink>}
          />
        )
      ) : (
        <div className="space-y-6">
          {/* Saved jobs grid */}
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {jobs.map((job) => {
              const isSaved = savedIds.includes(job.id);
              const salary = formatSalary(job);
              const tone = logoToneForCompany(job.company_name);

              return (
                <DashCard
                  key={job.id}
                  className="hover:shadow-md hover:-translate-y-0.5 transition-[box-shadow,transform] duration-200"
                >
                  <div className="flex items-start justify-between gap-2">
                    <CompanyMark
                      company={job.company_name}
                      tone={tone}
                      size={38}
                      logoUrl={job.company_logo_url}
                    />
                    <div className="flex items-center gap-1.5">
                      <div className="flex flex-wrap items-center justify-end gap-1.5">
                        {job.work_mode && (
                          <Chip
                            tone={
                              job.work_mode === "Remote"
                                ? "green"
                                : job.work_mode === "Hybrid"
                                  ? "blue"
                                  : "default"
                            }
                          >
                            {job.work_mode}
                          </Chip>
                        )}
                        {job.experience_level && <Chip tone="purple">{job.experience_level}</Chip>}
                      </div>
                      {/* Add to Collection — a job doesn't need to be saved first,
                          but the Saved page is a natural place to organize what's
                          already saved. */}
                      <AddToCollectionMenu job={job} className="h-7 w-7" />
                      {/* Archive / Restore button — only once the migration lands */}
                      {archiveEnabled && (
                        <button
                          onClick={() => {
                            if (isArchivedView) {
                              unarchiveJob.mutate(
                                { jobId: job.id },
                                {
                                  onSuccess: () => toast.success("Restored to active."),
                                  onError: () => toast.error("Failed to restore job."),
                                },
                              );
                            } else {
                              archiveJob.mutate(
                                { jobId: job.id },
                                {
                                  onSuccess: () => toast.success("Job archived."),
                                  onError: () => toast.error("Failed to archive job."),
                                },
                              );
                            }
                          }}
                          aria-label={isArchivedView ? "Restore" : "Archive"}
                          title={isArchivedView ? "Restore to active" : "Archive"}
                          className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-black/5 bg-white text-[oklch(0.4_0.02_265)] transition-colors hover:bg-black/[0.03]"
                        >
                          {isArchivedView ? (
                            <ArchiveRestore className="h-3.5 w-3.5" />
                          ) : (
                            <Archive className="h-3.5 w-3.5" />
                          )}
                        </button>
                      )}
                      {/* Unsave button */}
                      <button
                        onClick={() => {
                          if (isSaved) {
                            unsaveJob.mutate({ jobId: job.id });
                          } else {
                            saveJob.mutate({ jobId: job.id });
                          }
                        }}
                        aria-label={isSaved ? "Unsave" : "Save"}
                        className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-black/5 bg-white text-[oklch(0.4_0.02_265)] transition-colors hover:bg-black/[0.03]"
                      >
                        {isSaved ? (
                          <BookmarkCheck className="h-3.5 w-3.5 text-[#2563EB]" />
                        ) : (
                          <Bookmark className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </div>
                  </div>

                  <Link
                    to="/dashboard/jobs/$jobId"
                    params={{ jobId: job.id }}
                    className="group mt-3 block"
                  >
                    <p className="font-display font-semibold transition-colors group-hover:text-[#2563EB]">
                      {job.role}
                    </p>
                    <p className="text-xs text-[oklch(0.5_0.02_265)]">{job.company_name}</p>
                  </Link>

                  {(getJobBadges(job).length > 0 || trackedIds.includes(job.id)) && (
                    <div className="mt-1.5 flex flex-wrap items-center gap-1">
                      {getJobBadges(job).map((badge) => (
                        <Chip key={badge.key} tone={badge.tone}>
                          {badge.label}
                        </Chip>
                      ))}
                      {trackedIds.includes(job.id) && <Chip tone="green">Tracked</Chip>}
                    </div>
                  )}

                  {(job.location || salary) && (
                    <p className="mt-2 flex items-center gap-1 text-xs text-[oklch(0.5_0.02_265)]">
                      {job.location && (
                        <>
                          <MapPin className="h-3 w-3" /> {job.location}
                        </>
                      )}
                      {job.location && salary && " · "}
                      {salary}
                    </p>
                  )}

                  {job.employment_type && (
                    <div className="mt-3 rounded-lg bg-[oklch(0.97_0.01_265)] px-3 py-2 text-xs">
                      <span className="font-medium capitalize">
                        {job.employment_type}
                      </span>
                    </div>
                  )}

                  {/* CTA row */}
                  <div className="mt-3 flex items-center gap-2 border-t border-black/5 pt-3">
                    {job.url && (
                      <button
                        onClick={() => setSelectedJob(job)}
                        className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg bg-gradient-to-br from-[#2563EB] to-[#7C3AED] px-3 py-1.5 text-xs font-medium text-white shadow-[0_2px_8px_-2px_rgba(37,99,235,0.5)] transition-transform hover:-translate-y-px"
                      >
                        Apply <ArrowUpRight className="h-3 w-3" />
                      </button>
                    )}
                    <Link
                      to="/dashboard/jobs/$jobId"
                      params={{ jobId: job.id }}
                      className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg border border-black/5 bg-white px-3 py-1.5 text-xs font-medium text-[oklch(0.35_0.02_265)] transition-colors hover:bg-black/[0.03]"
                    >
                      View Job
                    </Link>
                  </div>
                </DashCard>
              );
            })}
          </div>

          {/* ── Pagination ──────────────────────────────────────────────── */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-xs text-[oklch(0.5_0.02_265)]">
                Showing{" "}
                {(pagination.page - 1) * pagination.pageSize + 1}–
                {Math.min(pagination.page * pagination.pageSize, total)} of{" "}
                {total} saved jobs
              </p>
              <div className="flex items-center gap-1">
                <button
                  onClick={() =>
                    setPagination((p) => ({ ...p, page: p.page - 1 }))
                  }
                  disabled={pagination.page <= 1}
                  className="grid h-8 w-8 place-items-center rounded-lg border border-black/5 bg-white text-[oklch(0.4_0.02_265)] hover:bg-black/[0.03] disabled:opacity-40 disabled:cursor-not-allowed"
                  aria-label="Previous page"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="px-2 text-xs font-medium">
                  {pagination.page} / {totalPages}
                </span>
                <button
                  onClick={() =>
                    setPagination((p) => ({ ...p, page: p.page + 1 }))
                  }
                  disabled={pagination.page >= totalPages}
                  className="grid h-8 w-8 place-items-center rounded-lg border border-black/5 bg-white text-[oklch(0.4_0.02_265)] hover:bg-black/[0.03] disabled:opacity-40 disabled:cursor-not-allowed"
                  aria-label="Next page"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {selectedJob && (
        <TrackApplicationModal
          job={selectedJob}
          open={trackModalOpen}
          isPending={isPending}
          onTrackAndContinue={handleTrackAndContinue}
          onContinueWithoutTracking={handleContinueWithoutTracking}
          onCancel={handleCancel}
        />
      )}

      {alreadyTrackedApplication && (
        <AlreadyTrackingModal
          application={alreadyTrackedApplication}
          open={Boolean(alreadyTrackedApplication)}
          isPending={isRemovingTracking}
          onViewApplication={handleViewApplication}
          onOpenJobPage={handleOpenJobPage}
          onRemoveTracking={handleRemoveTracking}
          onClose={handleCloseAlreadyTracking}
        />
      )}
    </>
  );
}