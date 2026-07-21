import { useState, useEffect, useMemo, useCallback } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  Search,
  Loader2,
  AlertCircle,
  Pencil,
  Trash2,
  FolderMinus,
  FolderKanban,
  ListFilter as Filter,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  DashCard,
  PageHeader,
  EmptyState,
  MultiSelectDropdown,
  StickyPageHeader,
} from "@/components/dashboard/primitives";
import { JobCard } from "@/components/dashboard/jobs/JobCard";
import { AddToCollectionMenu } from "@/components/dashboard/collections/AddToCollectionMenu";
import { CollectionStats } from "@/components/dashboard/collections/CollectionStats";
import { CollectionFormDialog } from "@/components/dashboard/collections/CollectionFormDialog";
import {
  TrackApplicationModal,
  AlreadyTrackingModal,
  useTrackApplication,
} from "@/components/dashboard/applications/ApplyPromptDialog";
import {
  useCollection,
  useCollectionJobs,
  useUpdateCollection,
  useDeleteCollection,
  useRemoveJobFromCollection,
} from "@/features/collections/hooks";
import { useSavedJobIds, useSaveJob, useUnsaveJob } from "@/features/jobs/hooks";
import { normalizeFilters } from "@/features/jobs/filter-maps";
import {
  WORK_MODE_OPTIONS,
  EMPLOYMENT_TYPE_OPTIONS,
  EXPERIENCE_LEVEL_OPTIONS,
  SOURCE_OPTIONS,
  SORT_OPTIONS,
  DEFAULT_SORT_OPTION,
} from "@/features/jobs/constants";
import type { JobFilters, JobSortOption } from "@/features/jobs/types";
import type { CollectionColor, GlobalJob } from "@/types";
import { format, parseISO } from "date-fns";

export const Route = createFileRoute("/dashboard/collections/$collectionId")({
  head: () => ({
    meta: [{ title: "Collection — NextOffer" }, { name: "robots", content: "noindex" }],
  }),
  component: CollectionDetailPage,
});

// ── Client-side search + filter + sort ──────────────────────────────────────
// Reuses the SAME filter option vocabulary and MultiSelectDropdown component
// as the Jobs board's Advanced Filters, and the same JobSortOption/SORT_OPTIONS
// vocabulary as its Sort control — executed in-memory here because a
// collection's job list is already fully fetched (bounded, personal — the
// same precedent the Applications page already established for its own
// client-side filters). No new filtering system.

function matchesQuery(job: GlobalJob, q: string): boolean {
  if (!q) return true;
  const needle = q.toLowerCase();
  return [job.role, job.company_name, job.location, job.city, job.employment_type, job.description]
    .filter(Boolean)
    .some((field) => (field as string).toLowerCase().includes(needle));
}

function compareBy(a: GlobalJob, b: GlobalJob, sortOption: JobSortOption): number {
  const { field, direction } = SORT_OPTIONS[sortOption].sort;
  const dir = direction === "asc" ? 1 : -1;
  const av = a[field as keyof GlobalJob];
  const bv = b[field as keyof GlobalJob];

  if (av == null && bv == null) return 0;
  if (av == null) return 1; // nulls last regardless of direction
  if (bv == null) return -1;

  if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
  return String(av).localeCompare(String(bv)) * dir;
}

function CollectionDetailPage() {
  const { collectionId } = Route.useParams();
  const navigate = useNavigate();

  const { data: collection, isLoading: collectionLoading, isError: collectionError } =
    useCollection(collectionId);
  const { data: jobs = [], isLoading: jobsLoading, isError: jobsError, error: jobsErrorObj } =
    useCollectionJobs(collectionId);

  const updateCollection = useUpdateCollection();
  const deleteCollection = useDeleteCollection();
  const removeJob = useRemoveJobFromCollection();

  const { data: savedIds = [] } = useSavedJobIds();
  const saveJob = useSaveJob();
  const unsaveJob = useUnsaveJob();

  const [editOpen, setEditOpen] = useState(false);
  const [q, setQ] = useState("");
  const [workMode, setWorkMode] = useState<string[]>([]);
  const [employmentType, setEmploymentType] = useState<string[]>([]);
  const [experienceLevel, setExperienceLevel] = useState<string[]>([]);
  const [source, setSource] = useState<string[]>([]);
  const [sortOption, setSortOption] = useState<JobSortOption>(DEFAULT_SORT_OPTION);

  const isFiltered =
    Boolean(q) ||
    workMode.length > 0 ||
    employmentType.length > 0 ||
    experienceLevel.length > 0 ||
    source.length > 0;

  const activeFilterCount = [
    workMode.length > 0,
    employmentType.length > 0,
    experienceLevel.length > 0,
    source.length > 0,
  ].filter(Boolean).length;

  const visibleJobs = useMemo(() => {
    // The filter dropdowns store lowercase URL-style slugs ("remote",
    // "full-time"), but global_jobs stores Title-Case values ("Remote",
    // "Full-Time") — comparing the raw slug against job.work_mode always
    // returned zero rows. normalizeFilters() is the SAME utility JobService
    // already runs before every Jobs-page query for this exact reason; reusing
    // it here (instead of comparing raw slugs) is the fix — no new mapping.
    const normalized = normalizeFilters({
      workMode: workMode.length > 0 ? (workMode as JobFilters["workMode"]) : undefined,
      employmentType: employmentType.length > 0 ? (employmentType as JobFilters["employmentType"]) : undefined,
      experienceLevel: experienceLevel.length > 0 ? (experienceLevel as JobFilters["experienceLevel"]) : undefined,
    });
    const normWorkMode = (normalized.workMode as string[] | undefined) ?? [];
    const normEmploymentType = (normalized.employmentType as string[] | undefined) ?? [];
    const normExperienceLevel = (normalized.experienceLevel as string[] | undefined) ?? [];

    let list = jobs.filter((j) => matchesQuery(j, q));
    if (normWorkMode.length > 0) list = list.filter((j) => j.work_mode && normWorkMode.includes(j.work_mode));
    if (normEmploymentType.length > 0)
      list = list.filter((j) => j.employment_type && normEmploymentType.includes(j.employment_type));
    if (normExperienceLevel.length > 0)
      list = list.filter((j) => j.experience_level && normExperienceLevel.includes(j.experience_level));
    // Source values already match global_jobs.source exactly (see
    // SOURCE_OPTIONS's comment in features/jobs/constants) — no normalization needed.
    if (source.length > 0) list = list.filter((j) => source.includes(j.source));

    return [...list].sort((a, b) => compareBy(a, b, sortOption));
  }, [jobs, q, workMode, employmentType, experienceLevel, source, sortOption]);

  const resetFilters = useCallback(() => {
    setQ("");
    setWorkMode([]);
    setEmploymentType([]);
    setExperienceLevel([]);
    setSource([]);
  }, []);

  // Apply flow — same TrackApplicationModal/AlreadyTrackingModal used on
  // Jobs, Saved, and Job Detail.
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
  } = useTrackApplication(selectedJob, () => setSelectedJob(null));

  useEffect(() => {
    if (selectedJob) handleApplyClick();
  }, [selectedJob, handleApplyClick]);

  const handleEditSubmit = (fields: { name: string; description?: string; color: CollectionColor }) => {
    updateCollection.mutate(
      { id: collectionId, ...fields },
      {
        onSuccess: () => {
          toast.success("Collection updated.");
          setEditOpen(false);
        },
        onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to update collection."),
      },
    );
  };

  const handleDelete = () => {
    if (!collection) return;
    if (
      !confirm(`Delete "${collection.name}"? This removes the collection only — its jobs stay in Jobs/Saved.`)
    ) {
      return;
    }
    deleteCollection.mutate(
      { id: collectionId },
      {
        onSuccess: () => {
          toast.success(`Deleted "${collection.name}".`);
          void navigate({ to: "/dashboard/collections" });
        },
        onError: () => toast.error("Failed to delete collection."),
      },
    );
  };

  const handleRemoveJob = (jobId: string) => {
    removeJob.mutate(
      { collectionId, jobId },
      {
        onSuccess: () => toast.success("Removed from collection."),
        onError: () => toast.error("Failed to remove job."),
      },
    );
  };

  // ── Loading / error / not found ──────────────────────────────────────────
  if (collectionLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-24 text-sm text-[oklch(0.5_0.02_265)]">
        <Loader2 className="h-5 w-5 animate-spin" />
        Loading collection…
      </div>
    );
  }

  if (collectionError || !collection) {
    return (
      <div className="flex flex-col items-center gap-3 py-24 text-center">
        <AlertCircle className="h-8 w-8 text-rose-500" />
        <p className="font-display text-sm font-semibold">Collection not found</p>
        <Link to="/dashboard/collections" className="mt-2 text-xs text-[#2563EB] hover:underline">
          ← Back to Collections
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <Link
        to="/dashboard/collections"
        className="inline-flex items-center gap-1.5 text-sm text-[oklch(0.5_0.02_265)] transition-colors hover:text-[oklch(0.2_0.02_265)]"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Collections
      </Link>

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <DashCard>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-display text-xl font-semibold tracking-tight text-[oklch(0.2_0.02_265)]">
              {collection.name}
            </h1>
            {collection.description && (
              <p className="mt-1 max-w-2xl text-sm text-[oklch(0.5_0.02_265)]">{collection.description}</p>
            )}
            <p className="mt-2 text-xs text-[oklch(0.55_0.02_265)]">
              {jobs.length} {jobs.length === 1 ? "job" : "jobs"} · Updated{" "}
              {format(parseISO(collection.updated_at), "MMM d, yyyy")}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setEditOpen(true)}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-black/5 bg-white px-3 text-sm font-medium text-[oklch(0.4_0.02_265)] transition-colors hover:bg-black/[0.03]"
            >
              <Pencil className="h-4 w-4" /> Edit
            </button>
            <button
              onClick={handleDelete}
              disabled={deleteCollection.isPending}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-black/5 bg-white px-3 text-sm font-medium text-rose-600 transition-colors hover:bg-rose-50 disabled:opacity-60"
            >
              <Trash2 className="h-4 w-4" /> Delete
            </button>
          </div>
        </div>
      </DashCard>

      {/* ── Statistics ─────────────────────────────────────────────────── */}
      {jobs.length > 0 && <CollectionStats jobs={jobs} />}

      {/* ── Search + filters + sort ────────────────────────────────────── */}
      <StickyPageHeader>
        <DashCard padded={false}>
          <div className="flex flex-wrap items-center gap-2 p-3">
            <div className="flex h-9 flex-1 min-w-[200px] items-center gap-2 rounded-lg border border-black/5 bg-white px-3 text-sm">
              <Search className="h-4 w-4 shrink-0 text-[oklch(0.5_0.02_265)]" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search this collection…"
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-[oklch(0.55_0.02_265)]"
              />
            </div>

            <select
              value={sortOption}
              onChange={(e) => setSortOption(e.target.value as JobSortOption)}
              className="h-9 rounded-lg border border-black/5 bg-white px-3 text-sm"
            >
              {(Object.keys(SORT_OPTIONS) as JobSortOption[]).map((key) => (
                <option key={key} value={key}>
                  {SORT_OPTIONS[key].label}
                </option>
              ))}
            </select>

            <MultiSelectDropdown label="Work mode" options={WORK_MODE_OPTIONS} selected={workMode} onChange={setWorkMode} />
            <MultiSelectDropdown
              label="Employment type"
              options={EMPLOYMENT_TYPE_OPTIONS}
              selected={employmentType}
              onChange={setEmploymentType}
            />
            <MultiSelectDropdown
              label="Experience level"
              options={EXPERIENCE_LEVEL_OPTIONS}
              selected={experienceLevel}
              onChange={setExperienceLevel}
            />
            <MultiSelectDropdown label="Source" options={SOURCE_OPTIONS} selected={source} onChange={setSource} />

            {isFiltered && (
              <button
                onClick={resetFilters}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-black/5 bg-white px-3 text-xs font-medium text-[oklch(0.4_0.02_265)] transition-colors hover:bg-black/[0.03]"
              >
                <X className="h-3.5 w-3.5" />
                Reset
                {activeFilterCount > 0 && (
                  <span className="rounded-full bg-[#2563EB]/10 px-1.5 py-0.5 text-[10px] font-semibold text-[#2563EB]">
                    {activeFilterCount}
                  </span>
                )}
              </button>
            )}
          </div>
        </DashCard>
      </StickyPageHeader>

      {/* ── Jobs ───────────────────────────────────────────────────────── */}
      <DashCard padded={false}>
        {jobsLoading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-[oklch(0.5_0.02_265)]">
            <Loader2 className="h-5 w-5 animate-spin" />
            Loading jobs…
          </div>
        ) : jobsError ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <AlertCircle className="h-8 w-8 text-rose-500" />
            <p className="font-display text-sm font-semibold">Failed to load jobs</p>
            <p className="max-w-xs text-xs text-[oklch(0.5_0.02_265)]">
              {jobsErrorObj instanceof Error ? jobsErrorObj.message : "An unexpected error occurred."}
            </p>
          </div>
        ) : jobs.length === 0 ? (
          <div className="p-5">
            <EmptyState
              icon={FolderKanban}
              title="This collection is empty"
              body="Add jobs from the Jobs board, Saved Jobs, or a job's detail page using the Add to Collection button."
            />
          </div>
        ) : visibleJobs.length === 0 ? (
          <div className="p-5">
            <EmptyState
              icon={Filter}
              title="No jobs match your filters"
              body="Try broadening your search or clearing the active filters."
            />
          </div>
        ) : (
          <ul className="divide-y divide-black/5">
            {visibleJobs.map((job) => (
              <JobCard
                key={job.id}
                job={job}
                isSaved={savedIds.includes(job.id)}
                onSave={() => saveJob.mutate({ jobId: job.id })}
                onUnsave={() => unsaveJob.mutate({ jobId: job.id })}
                onApply={(j) => setSelectedJob(j)}
                extraAction={
                  <>
                    <AddToCollectionMenu job={job} />
                    <button
                      onClick={() => handleRemoveJob(job.id)}
                      aria-label="Remove from this collection"
                      title="Remove from this collection"
                      className="grid h-8 w-8 place-items-center rounded-lg border border-black/5 bg-white text-[oklch(0.4_0.02_265)] transition-colors hover:bg-rose-50 hover:text-rose-600"
                    >
                      <FolderMinus className="h-4 w-4" />
                    </button>
                  </>
                }
              />
            ))}
          </ul>
        )}
      </DashCard>

      <CollectionFormDialog
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title="Edit Collection"
        submitLabel="Save Changes"
        initialName={collection.name}
        initialDescription={collection.description}
        initialColor={collection.color}
        isPending={updateCollection.isPending}
        onSubmit={handleEditSubmit}
      />

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
    </div>
  );
}
