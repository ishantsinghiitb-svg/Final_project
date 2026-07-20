import { useState, useEffect, useCallback, useRef, useMemo, memo } from "react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import {
  TrackApplicationModal,
  AlreadyTrackingModal,
  useTrackApplication,
} from "@/components/dashboard/applications/ApplyPromptDialog";
import {
  ListFilter as Filter,
  MapPin,
  Search,
  SlidersHorizontal,
  Bookmark,
  BookmarkCheck,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Loader2,
  AlertCircle,
  X,
  Briefcase,
  Clock,
  Banknote,
} from "lucide-react";
import {
  DashCard,
  PageHeader,
  Chip,
  CompanyMark,
  EmptyState,
  MultiSelectDropdown,
  StickyPageHeader,
} from "@/components/dashboard/primitives";
import { DashButton } from "@/components/dashboard/DashButton";
import { useJobs, useSavedJobIds, useSaveJob, useUnsaveJob } from "@/features/jobs/hooks";
import type { JobFilters, JobSort, JobSortOption, JobsSearchParams } from "@/features/jobs/types";
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
import { formatSalary, formatPostedTime, formatSourceLabel, logoToneForCompany } from "@/features/jobs/utils";

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
    meta: [{ title: "Jobs — NextOffer" }, { name: "robots", content: "noindex" }],
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
  }),
  component: JobsPage,
});

// ── Job Card ─────────────────────────────────────────────────────────────────
interface JobCardProps {
  job: GlobalJob;
  isSaved: boolean;
  onSave: () => void;
  onUnsave: () => void;
  onApply: (job: GlobalJob) => void;
}

const JobCard = memo(function JobCard({ job, isSaved, onSave, onUnsave, onApply }: JobCardProps) {
  const salary = formatSalary(job);
  const posted = formatPostedTime(job);
  const tone = logoToneForCompany(job.company_name);

  return (
    <li className="group flex items-center gap-4 px-4 py-4 hover:bg-[oklch(0.98_0.005_265)] transition-colors">
      {/*
       * The entire left region is a <Link> so clicking anywhere on the card
       * navigates to the detail page. The Save and Apply buttons outside the
       * <Link> call stopPropagation only on their own events.
       */}
      <Link
        to="/dashboard/jobs/$jobId"
        params={{ jobId: job.id }}
        className="flex flex-1 min-w-0 items-center gap-4"
      >
        <CompanyMark company={job.company_name} tone={tone} size={46} logoUrl={job.company_logo_url} />

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="truncate font-display text-[15px] font-semibold">{job.role}</p>
            {job.remote && (
              <Chip tone="green" className="shrink-0">
                Remote
              </Chip>
            )}
            {job.work_mode && !job.remote && (
              <Chip
                tone={
                  job.work_mode === "Remote"
                    ? "green"
                    : job.work_mode === "Hybrid"
                      ? "blue"
                      : "default"
                }
                className="shrink-0"
              >
                {job.work_mode}
              </Chip>
            )}
            {job.experience_level && (
              <Chip tone="default" className="shrink-0">
                {job.experience_level}
              </Chip>
            )}
          </div>

          <div className="mt-1 flex items-center gap-2 flex-wrap">
            <p className="text-[13px] text-[oklch(0.5_0.02_265)]">
              {job.company_name}
              {job.location && (
                <>
                  {" · "}
                  <MapPin className="inline h-3 w-3" /> {job.location}
                </>
              )}
            </p>
            {job.employment_type && (
              <span className="flex items-center gap-0.5 text-[13px] text-[oklch(0.5_0.02_265)]">
                <Briefcase className="h-3 w-3" /> {job.employment_type}
              </span>
            )}
            {/*
             * Salary already contains the currency symbol (e.g. "₹18L–₹30L"
             * or "$120K–$150K"). Use Banknote icon — never a DollarSign icon
             * which would produce "$ ₹18L" double-currency.
             */}
            {salary && (
              <span className="flex items-center gap-0.5 text-[13px] text-[oklch(0.5_0.02_265)]">
                <Banknote className="h-3 w-3" /> {salary}
              </span>
            )}
          </div>
        </div>

        {/* Source + time — desktop only */}
        <div className="hidden flex-col items-end gap-0.5 md:flex min-w-[80px]">
          <span className="text-xs text-[oklch(0.55_0.02_265)]">{formatSourceLabel(job.source)}</span>
          {posted && (
            <span className="flex items-center gap-1 text-xs text-[oklch(0.55_0.02_265)]">
              <Clock className="h-3 w-3" /> {posted}
            </span>
          )}
        </div>
      </Link>

      {/* Action buttons — outside the <Link>, stopPropagation not needed as
          they are siblings, not ancestors, of the <Link> element. */}
      <div className="flex items-center gap-1.5 shrink-0">
        <button
          onClick={() => {
            if (isSaved) onUnsave();
            else onSave();
          }}
          aria-label={isSaved ? "Unsave job" : "Save job"}
          className="grid h-8 w-8 place-items-center rounded-lg border border-black/5 bg-white text-[oklch(0.4_0.02_265)] hover:bg-black/[0.03] transition-colors"
        >
          {isSaved ? (
            <BookmarkCheck className="h-4 w-4 text-[#2563EB]" />
          ) : (
            <Bookmark className="h-4 w-4" />
          )}
        </button>

        {job.url && (
          <button
            onClick={() => onApply(job)}
            className="hidden md:inline-flex items-center gap-1 rounded-lg border border-black/5 bg-white px-2.5 py-1.5 text-xs font-medium text-[oklch(0.25_0.02_265)] hover:bg-black/[0.03] transition-colors"
          >
            Apply
            <ArrowUpRight className="h-3 w-3" />
          </button>
        )}
      </div>
    </li>
  );
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
        search: (prev) => ({ ...prev, [key]: values.length > 0 ? values.join(",") : undefined, page: 1 }),
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
      />

      <DashCard padded={false}>
        {/* ── Filter bar ──────────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-2 p-3">
          {/* Keyword search */}
          <div className="flex h-9 flex-1 min-w-[220px] items-center gap-2 rounded-lg border border-black/5 bg-white px-3 text-sm">
            <Search className="h-4 w-4 shrink-0 text-[oklch(0.5_0.02_265)]" />
            <input
              ref={searchInputRef}
              defaultValue={q}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Search role, company, location, type, skills…"
              className="flex-1 bg-transparent outline-none placeholder:text-[oklch(0.55_0.02_265)] text-sm"
            />
            {isFetching && (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-[oklch(0.5_0.02_265)]" />
            )}
          </div>

          {/* Sort */}
          <select
            value={sortKey}
            onChange={(e) => setFilter("sort", e.target.value)}
            className="h-9 rounded-lg border border-black/5 bg-white px-3 text-sm"
          >
            {(Object.keys(SORT_OPTIONS) as JobSortOption[]).map((key) => (
              <option key={key} value={key}>
                {SORT_OPTIONS[key].label}
              </option>
            ))}
          </select>

          {/* Work mode */}
          <MultiSelectDropdown
            label="Work mode"
            options={WORK_MODE_OPTIONS}
            selected={parseMultiOrEmpty(search.workMode)}
            onChange={(v) => setMultiFilter("workMode", v)}
          />

          {/* Employment type */}
          <MultiSelectDropdown
            label="Employment type"
            options={EMPLOYMENT_TYPE_OPTIONS}
            selected={parseMultiOrEmpty(search.employmentType)}
            onChange={(v) => setMultiFilter("employmentType", v)}
          />

          {/* Experience level */}
          <MultiSelectDropdown
            label="Experience level"
            options={EXPERIENCE_LEVEL_OPTIONS}
            selected={parseMultiOrEmpty(search.experienceLevel)}
            onChange={(v) => setMultiFilter("experienceLevel", v)}
          />

          {/* Role category */}
          <MultiSelectDropdown
            label="Role"
            options={ROLE_CATEGORY_OPTIONS.map((r) => ({ value: r, label: ROLE_CATEGORY_LABELS[r] }))}
            selected={parseMultiOrEmpty(search.roleCategory)}
            onChange={(v) => setMultiFilter("roleCategory", v)}
          />

          {/* Source */}
          <MultiSelectDropdown
            label="Source"
            options={SOURCE_OPTIONS}
            selected={parseMultiOrEmpty(search.source)}
            onChange={(v) => setMultiFilter("source", v)}
          />

          {/* Posted date — stores relative-day string in URL */}
          <select
            value={search.postedAfter ?? ""}
            onChange={(e) => setFilter("postedAfter", e.target.value)}
            className="h-9 rounded-lg border border-black/5 bg-white px-3 text-sm"
          >
            {POSTED_AFTER_OPTIONS.map((o) => (
              <option key={o.label} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>

          {/* Remote toggle */}
          <label className="inline-flex h-9 items-center gap-2 rounded-lg border border-black/5 bg-white px-3 text-sm cursor-pointer select-none">
            <input
              type="checkbox"
              checked={Boolean(search.remote)}
              onChange={(e) => setFilter("remote", e.target.checked ? true : undefined)}
            />
            Remote only
          </label>

          {/* Reset */}
          {(isFiltered || activeFilterCount > 0) && (
            <button
              onClick={resetFilters}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-black/5 bg-white px-3 text-xs font-medium text-[oklch(0.4_0.02_265)] hover:bg-black/[0.03] transition-colors"
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

      <DashCard padded={false}>
        {/* ── Body ──────────────────────────────────────────────────────────── */}
        {isLoading ? (
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
              {jobs.map((job) => (
                <JobCard
                  key={job.id}
                  job={job}
                  isSaved={savedIds.includes(job.id)}
                  onSave={() => saveJob.mutate({ jobId: job.id })}
                  onUnsave={() => unsaveJob.mutate({ jobId: job.id })}
                  onApply={(job) => {
                    setSelectedJob(job);
                  }}
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
    </>
  );
}
