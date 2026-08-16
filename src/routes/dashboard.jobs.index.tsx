import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  TrackApplicationModal,
  AlreadyTrackingModal,
  useTrackApplication,
} from "@/components/dashboard/applications/ApplyPromptDialog";
import {
  ListFilter as Filter,
  Search,
  SlidersHorizontal,
  ChevronLeft,
  ChevronRight,
  Loader2,
  AlertCircle,
  X,
} from "lucide-react";
import {
  DashCard,
  PageHeader,
  EmptyState,
  MultiSelectDropdown,
  StickyPageHeader,
} from "@/components/dashboard/primitives";
import { DashButton } from "@/components/dashboard/DashButton";
import { JobCard } from "@/components/dashboard/jobs/JobCard";
import { AddToCollectionMenu } from "@/components/dashboard/collections/AddToCollectionMenu";
import {
  useJobs,
  useSavedJobIds,
  useSaveJob,
  useUnsaveJob,
  useRecentlyViewedJobs,
  useSidebarCounts,
} from "@/features/jobs/hooks";
import type {
  JobFilters,
  JobSort,
  JobSortOption,
  JobsSearchParams,
  JobsView,
} from "@/features/jobs/types";
import type { PaginationParams, GlobalJob } from "@/types";
import {
  DEFAULT_PAGINATION,
  JOB_PAGE_SIZE_OPTIONS,
  SORT_OPTIONS,
  DEFAULT_SORT_OPTION,
  WORK_MODE_OPTIONS,
  EMPLOYMENT_TYPE_OPTIONS,
  EXPERIENCE_LEVEL_OPTIONS,
  SOURCE_OPTIONS,
  POSTED_AFTER_OPTIONS,
  postedAfterToIso,
  ROLE_CATEGORY_LABELS,
  ROLE_CATEGORY_OPTIONS,
} from "@/features/jobs/constants";
import { jobMatchesFilters, compareJobsBy } from "@/features/jobs/utils";
import { groupExactDuplicatePostings } from "@/features/jobs/duplicatePostings";

// Multi-select filters store their selected values as a comma-joined string
// in the URL (e.g. "remote,hybrid") rather than relying on the router's
// array search-param serialization, so the URL stays simple and predictable.
// Returns undefined (not []) when empty — an empty array would make the
// repository's `.in(column, [])` match zero rows instead of "no filter".
function parseMulti(value: string | undefined): string[] | undefined {
  const parts = value ? value.split(",").filter(Boolean) : [];
  return parts.length > 0 ? parts : undefined;
}

/** Same as parseMulti but always returns an array — for controlled UI selection state. */
function parseMultiOrEmpty(value: string | undefined): string[] {
  return parseMulti(value) ?? [];
}

// ── Route definition with URL search param validation ────────────────────────
export const Route = createFileRoute("/dashboard/jobs/")({
  head: () => ({
    meta: [{ title: "Jobs — OfferLyst" }, { name: "robots", content: "noindex" }],
  }),
  validateSearch: (search: Record<string, unknown>): JobsSearchParams => ({
    q: typeof search.q === "string" ? search.q : undefined,
    company: typeof search.company === "string" ? search.company : undefined,
    location: typeof search.location === "string" ? search.location : undefined,
    remote: search.remote === true || search.remote === "true" ? true : undefined,
    workMode: typeof search.workMode === "string" ? search.workMode : undefined,
    employmentType: typeof search.employmentType === "string" ? search.employmentType : undefined,
    experienceLevel:
      typeof search.experienceLevel === "string" ? search.experienceLevel : undefined,
    roleCategory: typeof search.roleCategory === "string" ? search.roleCategory : undefined,
    source: typeof search.source === "string" ? search.source : undefined,
    salaryMin: typeof search.salaryMin === "number" ? search.salaryMin : undefined,
    salaryMax: typeof search.salaryMax === "number" ? search.salaryMax : undefined,
    // postedAfter stored as relative-day string ("1", "7", "30") for stability
    postedAfter: typeof search.postedAfter === "string" ? search.postedAfter : undefined,
    sort: typeof search.sort === "string" ? (search.sort as JobSortOption) : undefined,
    page: typeof search.page === "number" && search.page > 0 ? Math.floor(search.page) : undefined,
    pageSize: typeof search.pageSize === "number" ? Math.floor(search.pageSize) : undefined,
    view: search.view === "recent" ? "recent" : undefined,
  }),
  component: JobsPage,
});

// ── Pagination ────────────────────────────────────────────────────────────────
interface PaginationBarProps {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  onPageChange: (p: number) => void;
  onPageSizeChange: (s: number) => void;
}

function PaginationBar({
  page,
  totalPages,
  total,
  pageSize,
  onPageChange,
  onPageSizeChange,
}: PaginationBarProps) {
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-black/5 px-4 py-3">
      <p className="text-xs text-[oklch(0.5_0.02_265)]">
        Showing{" "}
        <span className="font-medium">
          {from}–{to}
        </span>{" "}
        of <span className="font-medium">{total}</span> jobs
      </p>

      <div className="flex items-center gap-2">
        <label className="flex items-center gap-1.5 rounded-lg border border-black/5 bg-white px-2.5 py-1.5 text-xs">
          <SlidersHorizontal className="h-3 w-3 text-[oklch(0.5_0.02_265)]" />
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            className="bg-transparent outline-none text-xs font-medium"
          >
            {JOB_PAGE_SIZE_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n} / page
              </option>
            ))}
          </select>
        </label>

        <div className="flex items-center gap-1">
          <button
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
            className="grid h-8 w-8 place-items-center rounded-lg border border-black/5 bg-white text-[oklch(0.4_0.02_265)] hover:bg-black/[0.03] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            aria-label="Previous page"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="px-2 text-xs font-medium text-[oklch(0.35_0.02_265)]">
            {page} / {totalPages}
          </span>
          <button
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages}
            className="grid h-8 w-8 place-items-center rounded-lg border border-black/5 bg-white text-[oklch(0.4_0.02_265)] hover:bg-black/[0.03] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            aria-label="Next page"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
function JobsPage() {
  const navigate = useNavigate({ from: "/dashboard/jobs/" });
  const search = Route.useSearch();

  // Derive values from URL params (defaults applied inline)
  const q = search.q ?? "";
  const sortKey = search.sort ?? DEFAULT_SORT_OPTION;
  const page = search.page ?? 1;
  const pageSize = search.pageSize ?? DEFAULT_PAGINATION.pageSize;
  const view: JobsView = search.view ?? "all";

  const pagination: PaginationParams = { page, pageSize };
  const sort: JobSort = SORT_OPTIONS[sortKey]?.sort ?? SORT_OPTIONS[DEFAULT_SORT_OPTION].sort;

  // Build filter object for React Query / repository
  // postedAfterToIso converts the relative-day URL param ("7") to an ISO date
  const filters: JobFilters = useMemo(
    () => ({
      q: q || undefined,
      company: search.company || undefined,
      location: search.location || undefined,
      remote: search.remote ? true : undefined,
      workMode: parseMulti(search.workMode) as JobFilters["workMode"],
      employmentType: parseMulti(search.employmentType) as JobFilters["employmentType"],
      experienceLevel: parseMulti(search.experienceLevel) as JobFilters["experienceLevel"],
      roleCategory: parseMulti(search.roleCategory) as JobFilters["roleCategory"],
      source: parseMulti(search.source) as JobFilters["source"],
      salaryMin: search.salaryMin,
      salaryMax: search.salaryMax,
      // Convert "7" → ISO cutoff date; undefined if "" or absent
      postedAfter: postedAfterToIso(search.postedAfter),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [search],
  );

  // ── Data ─────────────────────────────────────────────────────────────────
  // "All Jobs" stays exactly as before — the full server-side paginated query.
  // "Recently Viewed" is a second, small (≤10) dataset fetched independently;
  // which one is actually RENDERED is decided purely by `view` below, so
  // switching tabs never refetches — both queries are already cached.
  const {
    data: result,
    isLoading,
    isError,
    error,
    isFetching,
  } = useJobs(filters, sort, pagination);
  const { data: savedIds = [] } = useSavedJobIds();
  const saveJob = useSaveJob();
  const unsaveJob = useUnsaveJob();
  const {
    data: recentlyViewed = [],
    isLoading: recentlyViewedLoading,
    isError: recentlyViewedError,
    error: recentlyViewedErrorObj,
    isFetching: recentlyViewedFetching,
  } = useRecentlyViewedJobs();
  const { jobs: allJobsCount } = useSidebarCounts();
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

  const jobs = result?.data ?? [];
  const totalPages = result?.totalPages ?? 1;
  const total = result?.total ?? 0;

  // ── Module 11C-2: presentation-only exact-duplicate collapse ─────────────
  // Applied to the CURRENT PAGE's rows only — this never touches the query,
  // pagination, sort, or `total` (all of which still count every underlying
  // row, unchanged). If a duplicate pair happens to straddle a page boundary
  // it simply renders as two ordinary cards on their respective pages; that
  // is an accepted limit of a display-only fix, not a correctness bug — no
  // global_jobs row, source_job_id, or URL is ever affected by this.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const jobGroups = useMemo(() => groupExactDuplicatePostings(jobs), [result?.data]);

  // ── Recently Viewed as a dataset, not a second filtering system ──────────
  // Reuses the SAME `filters` object the server-side "All Jobs" query already
  // builds — jobMatchesFilters/compareJobsBy (features/jobs/utils) apply that
  // exact field set and sort vocabulary client-side, since this dataset is
  // already small and fully fetched (no server round trip needed). When the
  // Sort control is still at its default, the list keeps the server's natural
  // viewed-at-descending order rather than being silently re-sorted by
  // posted_at — the "newest first" here means most-recently-VIEWED, matching
  // what findRecentlyViewed already returns.
  const visibleRecentlyViewed = useMemo(() => {
    const filtered = recentlyViewed.filter((job) => jobMatchesFilters(job, filters));
    if (sortKey === DEFAULT_SORT_OPTION) return filtered;
    return [...filtered].sort((a, b) => compareJobsBy(a, b, sortKey));
  }, [recentlyViewed, filters, sortKey]);

  const setView = useCallback(
    (next: JobsView) => {
      void navigate({
        search: (prev) => ({ ...prev, view: next === "all" ? undefined : next }),
        replace: true,
      });
    },
    [navigate],
  );

  // ── Debounced keyword search ──────────────────────────────────────────────
  // The input stays uncontrolled (never remounted) so typing never loses
  // focus; this effect only pushes `q` into the DOM when it changes from
  // outside the input itself (Reset button, browser back/forward). When the
  // input's own debounced `onChange` is what caused `q` to change, the DOM
  // value already matches `q` by the time this runs, so the guard skips it.
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (searchInputRef.current && searchInputRef.current.value !== q) {
      searchInputRef.current.value = q;
    }
  }, [q]);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const handleSearchChange = useCallback(
    (value: string) => {
      clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        void navigate({
          search: (prev) => ({ ...prev, q: value || undefined, page: 1 }),
          replace: true,
        });
      }, 350);
    },
    [navigate],
  );

  // ── URL param helpers ─────────────────────────────────────────────────────
  const setFilter = useCallback(
    (key: keyof JobsSearchParams, value: string | boolean | number | undefined) => {
      // Use undefined (not "") so empty values are dropped from the URL
      const next = value === "" || value === false ? undefined : value;
      void navigate({
        search: (prev) => ({ ...prev, [key]: next, page: 1 }),
        replace: true,
      });
    },
    [navigate],
  );

  const setMultiFilter = useCallback(
    (key: keyof JobsSearchParams, values: string[]) => {
      void navigate({
        search: (prev) => ({
          ...prev,
          [key]: values.length > 0 ? values.join(",") : undefined,
          page: 1,
        }),
        replace: true,
      });
    },
    [navigate],
  );

  const setPage = useCallback(
    (newPage: number) => {
      void navigate({
        search: (prev) => ({ ...prev, page: newPage }),
        replace: true,
      });
    },
    [navigate],
  );

  const setPageSize = useCallback(
    (newSize: number) => {
      void navigate({
        search: (prev) => ({ ...prev, pageSize: newSize, page: 1 }),
        replace: true,
      });
    },
    [navigate],
  );

  const resetFilters = useCallback(() => {
    void navigate({ search: {}, replace: true });
  }, [navigate]);

  // Active filter detection
  const isFiltered = Boolean(
    search.q ||
    search.company ||
    search.location ||
    search.remote ||
    search.workMode ||
    search.employmentType ||
    search.experienceLevel ||
    search.roleCategory ||
    search.source ||
    search.salaryMin ||
    search.salaryMax ||
    search.postedAfter,
  );

  const activeFilterCount = [
    search.remote,
    search.workMode,
    search.employmentType,
    search.experienceLevel,
    search.roleCategory,
    search.source,
    search.postedAfter,
    search.company,
    search.location,
  ].filter(Boolean).length;

  // One definition of the filter controls, mounted inline on desktop and
  // inside the mobile drawer. Defined as an element (not a second component)
  // so it closes over the existing handlers with no prop plumbing.
  const filterControls = (
    <>
      <select
        value={sortKey}
        onChange={(e) => setFilter("sort", e.target.value)}
        aria-label="Sort jobs"
        className="h-9 rounded-lg border border-black/5 bg-white px-3 text-sm"
      >
        {(Object.keys(SORT_OPTIONS) as JobSortOption[]).map((key) => (
          <option key={key} value={key}>
            {SORT_OPTIONS[key].label}
          </option>
        ))}
      </select>

      <MultiSelectDropdown
        label="Work mode"
        options={WORK_MODE_OPTIONS}
        selected={parseMultiOrEmpty(search.workMode)}
        onChange={(v) => setMultiFilter("workMode", v)}
      />

      <MultiSelectDropdown
        label="Employment type"
        options={EMPLOYMENT_TYPE_OPTIONS}
        selected={parseMultiOrEmpty(search.employmentType)}
        onChange={(v) => setMultiFilter("employmentType", v)}
      />

      <MultiSelectDropdown
        label="Experience level"
        options={EXPERIENCE_LEVEL_OPTIONS}
        selected={parseMultiOrEmpty(search.experienceLevel)}
        onChange={(v) => setMultiFilter("experienceLevel", v)}
      />

      <MultiSelectDropdown
        label="Role"
        options={ROLE_CATEGORY_OPTIONS.map((r) => ({
          value: r,
          label: ROLE_CATEGORY_LABELS[r],
        }))}
        selected={parseMultiOrEmpty(search.roleCategory)}
        onChange={(v) => setMultiFilter("roleCategory", v)}
      />

      <MultiSelectDropdown
        label="Source"
        options={SOURCE_OPTIONS}
        selected={parseMultiOrEmpty(search.source)}
        onChange={(v) => setMultiFilter("source", v)}
      />

      <select
        value={search.postedAfter ?? ""}
        onChange={(e) => setFilter("postedAfter", e.target.value)}
        aria-label="Posted date"
        className="h-9 rounded-lg border border-black/5 bg-white px-3 text-sm"
      >
        {POSTED_AFTER_OPTIONS.map((o) => (
          <option key={o.label} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>

      <label className="inline-flex h-9 cursor-pointer select-none items-center gap-2 rounded-lg border border-black/5 bg-white px-3 text-sm">
        <input
          type="checkbox"
          checked={Boolean(search.remote)}
          onChange={(e) => setFilter("remote", e.target.checked ? true : undefined)}
        />
        Remote only
      </label>

      {(isFiltered || activeFilterCount > 0) && (
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
    </>
  );

  const [filtersOpen, setFiltersOpen] = useState(false);

  useEffect(() => {
    if (!filtersOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFiltersOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [filtersOpen]);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      <StickyPageHeader>
        {/*
        No "Import job" button here for now — the manual-URL import feature
        (ManualImportService, JobRepository.upsertGlobalJob, the RPC, and the
        ImportJobDialog component) stays intact but disconnected from the UI
        per QA sign-off; it may be re-wired later.
      */}
        <PageHeader
          eyebrow="Jobs"
          title="Discover roles worth your time."
          subtitle="Browse every job in the global board. Use filters to narrow down by role, location, salary and more."
          actions={
            <div className="inline-flex items-center rounded-lg border border-black/5 bg-white p-0.5 text-xs font-medium">
              <button
                onClick={() => setView("all")}
                className={
                  view === "all"
                    ? "rounded-md bg-[oklch(0.95_0.02_265)] px-3 py-1.5 text-[#2563EB]"
                    : "rounded-md px-3 py-1.5 text-[oklch(0.45_0.02_265)] hover:bg-black/[0.03]"
                }
              >
                All Jobs{allJobsCount > 0 ? ` (${allJobsCount})` : ""}
              </button>
              <button
                onClick={() => setView("recent")}
                className={
                  view === "recent"
                    ? "rounded-md bg-[oklch(0.95_0.02_265)] px-3 py-1.5 text-[#2563EB]"
                    : "rounded-md px-3 py-1.5 text-[oklch(0.45_0.02_265)] hover:bg-black/[0.03]"
                }
              >
                Recently Viewed{recentlyViewed.length > 0 ? ` (${recentlyViewed.length})` : ""}
              </button>
            </div>
          }
        />

        <DashCard padded={false}>
          {/* ── Filter bar ────────────────────────────────────────────────────
              Search stays visible at every width. The remaining controls are
              inline from md up (desktop unchanged) and collapse behind a
              "Filters" button with an active count on phones, where fitting
              eight controls into the header meant either a wall of wrapped
              rows or unusably small targets. Both mount points render the SAME
              `FilterControls` element, so there is one implementation. */}
          <div className="flex flex-wrap items-center gap-2 p-3">
            {/* Keyword search */}
            <div className="flex h-9 min-w-[180px] flex-1 items-center gap-2 rounded-lg border border-black/5 bg-white px-3 text-sm">
              <Search className="h-4 w-4 shrink-0 text-[oklch(0.5_0.02_265)]" />
              <input
                ref={searchInputRef}
                defaultValue={q}
                onChange={(e) => handleSearchChange(e.target.value)}
                placeholder="Search role, company, location…"
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-[oklch(0.55_0.02_265)]"
              />
              {(view === "all" ? isFetching : recentlyViewedFetching) && (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-[oklch(0.5_0.02_265)]" />
              )}
            </div>

            {/* Mobile entry point into the same controls */}
            <button
              onClick={() => setFiltersOpen(true)}
              aria-haspopup="dialog"
              className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-black/5 bg-white px-3 text-sm font-medium text-[oklch(0.35_0.02_265)] transition-colors hover:bg-black/[0.03] md:hidden"
            >
              <SlidersHorizontal className="h-4 w-4" />
              Filters
              {activeFilterCount > 0 && (
                <span className="rounded-full bg-[#2563EB]/10 px-1.5 py-0.5 text-[10px] font-semibold text-[#2563EB]">
                  {activeFilterCount}
                </span>
              )}
            </button>

            <div className="hidden flex-wrap items-center gap-2 md:flex">{filterControls}</div>
          </div>
        </DashCard>
      </StickyPageHeader>

      <DashCard padded={false}>
        {/* ── Body ──────────────────────────────────────────────────────────── */}
        {/* view === "all": exactly the existing server-paginated Jobs list —
            unchanged. view === "recent": the same JobCard/filters/sort applied
            to the small, already-fetched Recently Viewed dataset instead —
            see visibleRecentlyViewed above. Never both at once, so a job can
            no longer appear twice on the page. */}
        {view === "all" ? (
          isLoading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-[oklch(0.5_0.02_265)]">
              <Loader2 className="h-5 w-5 animate-spin" />
              Loading jobs…
            </div>
          ) : isError ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <AlertCircle className="h-8 w-8 text-rose-500" />
              <p className="font-display text-sm font-semibold">Failed to load jobs</p>
              <p className="max-w-xs text-xs text-[oklch(0.5_0.02_265)]">
                {error instanceof Error ? error.message : "An unexpected error occurred."}
              </p>
            </div>
          ) : jobs.length === 0 ? (
            <div className="p-5">
              <EmptyState
                icon={Filter}
                title={isFiltered ? "No jobs match your filters" : "No jobs yet"}
                body={
                  isFiltered
                    ? "Try broadening your search or clearing the active filters."
                    : "Jobs from the global board will appear here once available."
                }
                cta={
                  isFiltered ? (
                    <DashButton variant="ghost" size="sm" onClick={resetFilters}>
                      Clear filters
                    </DashButton>
                  ) : undefined
                }
              />
            </div>
          ) : (
            <>
              <ul className="divide-y divide-black/5">
                {jobGroups.map(({ primary: job, duplicates }) => (
                  <JobCard
                    key={job.id}
                    job={job}
                    duplicateCount={duplicates.length}
                    isSaved={savedIds.includes(job.id)}
                    onSave={() => saveJob.mutate({ jobId: job.id })}
                    onUnsave={() => unsaveJob.mutate({ jobId: job.id })}
                    onApply={(job) => {
                      setSelectedJob(job);
                    }}
                    extraAction={<AddToCollectionMenu job={job} />}
                  />
                ))}
              </ul>
              <PaginationBar
                page={page}
                totalPages={totalPages}
                total={total}
                pageSize={pageSize}
                onPageChange={setPage}
                onPageSizeChange={setPageSize}
              />
            </>
          )
        ) : recentlyViewedLoading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-[oklch(0.5_0.02_265)]">
            <Loader2 className="h-5 w-5 animate-spin" />
            Loading recently viewed jobs…
          </div>
        ) : recentlyViewedError ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <AlertCircle className="h-8 w-8 text-rose-500" />
            <p className="font-display text-sm font-semibold">
              Failed to load recently viewed jobs
            </p>
            <p className="max-w-xs text-xs text-[oklch(0.5_0.02_265)]">
              {recentlyViewedErrorObj instanceof Error
                ? recentlyViewedErrorObj.message
                : "An unexpected error occurred."}
            </p>
          </div>
        ) : recentlyViewed.length === 0 ? (
          <div className="p-5">
            <EmptyState
              icon={Filter}
              title="No recently viewed jobs"
              body="Open a job's detail page and it will show up here, up to your 10 most recent."
            />
          </div>
        ) : visibleRecentlyViewed.length === 0 ? (
          <div className="p-5">
            <EmptyState
              icon={Filter}
              title="No jobs match your filters"
              body="Try broadening your search or clearing the active filters."
              cta={
                <DashButton variant="ghost" size="sm" onClick={resetFilters}>
                  Clear filters
                </DashButton>
              }
            />
          </div>
        ) : (
          <ul className="divide-y divide-black/5">
            {visibleRecentlyViewed.map((job) => (
              <JobCard
                key={job.id}
                job={job}
                isSaved={savedIds.includes(job.id)}
                onSave={() => saveJob.mutate({ jobId: job.id })}
                onUnsave={() => unsaveJob.mutate({ jobId: job.id })}
                onApply={(job) => {
                  setSelectedJob(job);
                }}
                extraAction={<AddToCollectionMenu job={job} />}
              />
            ))}
          </ul>
        )}
      </DashCard>

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
      {/* Mobile filter sheet. Slides up from the bottom, dismissed by the
          backdrop, the Done button or Escape. Renders the same
          `filterControls` element as the desktop bar, so filter behaviour and
          state are identical on both. */}
      {filtersOpen && (
        <div
          className="fixed inset-0 z-50 md:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Filters"
        >
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setFiltersOpen(false)}
          />
          <div className="absolute inset-x-0 bottom-0 max-h-[80vh] overflow-y-auto rounded-t-2xl border-t border-black/5 bg-white p-4 shadow-[0_-20px_60px_-20px_rgba(0,0,0,0.35)]">
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-black/10" />
            <div className="mb-3 flex items-center justify-between">
              <p className="font-display text-sm font-semibold">Filters</p>
              {activeFilterCount > 0 && (
                <span className="text-xs text-[oklch(0.5_0.02_265)]">
                  {activeFilterCount} active
                </span>
              )}
            </div>
            <div className="flex flex-col gap-2 [&>*]:w-full">{filterControls}</div>
            <button
              onClick={() => setFiltersOpen(false)}
              className="mt-4 w-full rounded-xl bg-gradient-to-br from-[#2563EB] to-[#7C3AED] py-2.5 text-sm font-medium text-white"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </>
  );
}
