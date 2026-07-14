import { useState, useCallback, useRef } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  ListFilter as Filter,
  MapPin,
  Plus,
  Search,
  SlidersHorizontal,
  Bookmark,
  BookmarkCheck,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Loader2,
  AlertCircle,
} from "lucide-react";
import {
  DashCard,
  PageHeader,
  Chip,
  CompanyMark,
  EmptyState,
} from "@/components/dashboard/primitives";
import { DashButton, DashButtonLink } from "@/components/dashboard/DashButton";
import {
  useJobs,
  useSavedJobIds,
  useSaveJob,
  useUnsaveJob,
} from "@/features/jobs/hooks";
import type { JobFilters, JobSort } from "@/features/jobs/types";
import type { PaginationParams } from "@/types";
import { DEFAULT_PAGINATION, JOB_PAGE_SIZE_OPTIONS } from "@/features/jobs/constants";
import type { GlobalJob } from "@/types";

export const Route = createFileRoute("/dashboard/jobs")({
  head: () => ({
    meta: [
      { title: "Jobs — NextOffer" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: JobsPage,
});

// ── Stable gradient palette for company initials ───────────────────────────
// Deterministic from the first character of the company name so the colour
// never changes between renders or pages.
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

/** Format a salary range into a human-readable string. */
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

/** Format a posted_at date string relative to now. */
function formatPostedAt(iso: string | null | undefined): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const hours = Math.floor(diff / 3_600_000);
  if (hours < 1) return "Just now";
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

const SOURCES = [
  "All sources",
  "LinkedIn",
  "Wellfound",
  "Greenhouse",
  "Lever",
  "Ashby",
  "Careers",
] as const;

type SourceFilter = (typeof SOURCES)[number];

function JobsPage() {
  // ── Local filter / sort / pagination state ───────────────────────────────
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [source, setSource] = useState<SourceFilter>("All sources");
  const [remoteOnly, setRemoteOnly] = useState(false);
  const [pagination, setPagination] =
    useState<PaginationParams>(DEFAULT_PAGINATION);

  // Debounce the text search so we don't hammer Supabase on every keystroke
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const handleSearchChange = useCallback((value: string) => {
    setQ(value);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedQ(value);
      setPagination((p) => ({ ...p, page: 1 }));
    }, 350);
  }, []);


  // Build the filter object sent to React Query / JobService
  const filters: JobFilters = {
    q: debouncedQ || undefined,
    remote: remoteOnly || undefined,
    source:
      source !== "All sources"
        ? (source as Exclude<SourceFilter, "All sources">)
        : undefined,
  };

  const sort: JobSort = { field: "posted_at", direction: "desc" };

  // ── Data ────────────────────────────────────────────────────────────────
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

  const jobs = result?.data ?? [];
  const totalPages = result?.totalPages ?? 1;
  const total = result?.total ?? 0;

  // ── Helpers ──────────────────────────────────────────────────────────────
  function resetFilters() {
    setQ("");
    setDebouncedQ("");
    setSource("All sources");
    setRemoteOnly(false);
    setPagination(DEFAULT_PAGINATION);
  }

  function handleFilterChange(updater: () => void) {
    updater();
    setPagination((p) => ({ ...p, page: 1 }));
  }

  const isFiltered =
    debouncedQ !== "" || source !== "All sources" || remoteOnly;

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <>
      <PageHeader
        eyebrow="Jobs"
        title="Discover roles worth your time."
        subtitle="Every job you save from the extension or add manually shows up here — ranked by how well it matches you."
        actions={
          <DashButton>
            <Plus className="h-4 w-4" /> Add job
          </DashButton>
        }
      />

      <DashCard padded={false}>
        {/* ── Filter bar ─────────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-2 border-b border-black/5 p-3">
          <div className="flex flex-1 min-w-[220px] items-center gap-2 rounded-lg border border-black/5 bg-white px-3 py-2 text-sm">
            <Search className="h-4 w-4 shrink-0 text-[oklch(0.5_0.02_265)]" />
            <input
              value={q}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Search company, role, location…"
              className="flex-1 bg-transparent outline-none placeholder:text-[oklch(0.55_0.02_265)]"
            />
            {isFetching && (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-[oklch(0.5_0.02_265)]" />
            )}
          </div>

          <select
            value={source}
            onChange={(e) =>
              handleFilterChange(() =>
                setSource(e.target.value as SourceFilter),
              )
            }
            className="rounded-lg border border-black/5 bg-white px-3 py-2 text-sm"
          >
            {SOURCES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>

          <label className="inline-flex items-center gap-2 rounded-lg border border-black/5 bg-white px-3 py-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={remoteOnly}
              onChange={(e) =>
                handleFilterChange(() => setRemoteOnly(e.target.checked))
              }
            />
            Remote only
          </label>

          {/* Page-size picker */}
          <label className="inline-flex items-center gap-2 rounded-lg border border-black/5 bg-white px-3 py-2 text-sm">
            <SlidersHorizontal className="h-3.5 w-3.5" />
            Show
            <select
              value={pagination.pageSize}
              onChange={(e) =>
                setPagination({ page: 1, pageSize: Number(e.target.value) })
              }
              className="bg-transparent outline-none text-sm font-medium"
            >
              {JOB_PAGE_SIZE_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        </div>

        {/* ── Body ──────────────────────────────────────────────────────── */}
        {isLoading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-[oklch(0.5_0.02_265)]">
            <Loader2 className="h-5 w-5 animate-spin" />
            Loading jobs…
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <AlertCircle className="h-8 w-8 text-rose-500" />
            <p className="font-display text-sm font-semibold">
              Failed to load jobs
            </p>
            <p className="max-w-xs text-xs text-[oklch(0.5_0.02_265)]">
              {error instanceof Error ? error.message : "An unexpected error occurred."}
            </p>
          </div>
        ) : jobs.length === 0 ? (
          <div className="p-5">
            <EmptyState
              icon={Filter}
              title={
                isFiltered ? "No jobs match those filters" : "No jobs yet"
              }
              body={
                isFiltered
                  ? "Try adjusting your search or clearing the filters."
                  : "Jobs posted to the global board will appear here."
              }
              cta={
                isFiltered ? (
                  <DashButton variant="ghost" size="sm" onClick={resetFilters}>
                    Reset filters
                  </DashButton>
                ) : undefined
              }
            />
          </div>
        ) : (
          <>
            <ul className="divide-y divide-black/5">
              {jobs.map((job) => {
                const isSaved = savedIds.includes(job.id);
                const salary = formatSalary(job);
                const posted = formatPostedAt(job.posted_at);
                const tone = logoToneForCompany(job.company_name);

                return (
                  <li
                    key={job.id}
                    className="group flex items-center gap-4 px-4 py-3 hover:bg-[oklch(0.98_0.005_265)]"
                  >
                    <CompanyMark
                      company={job.company_name}
                      tone={tone}
                      size={40}
                    />

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate font-display text-sm font-semibold">
                          {job.role}
                        </p>
                        {job.experience_level && (
                          <Chip tone="default">{job.experience_level}</Chip>
                        )}
                        {job.work_mode && (
                          <Chip
                            tone={
                              job.work_mode === "remote"
                                ? "green"
                                : job.work_mode === "hybrid"
                                  ? "blue"
                                  : "default"
                            }
                          >
                            {job.work_mode}
                          </Chip>
                        )}
                      </div>
                      <p className="mt-0.5 truncate text-xs text-[oklch(0.5_0.02_265)]">
                        {job.company_name}
                        {job.location && (
                          <>
                            {" · "}
                            <MapPin className="inline h-3 w-3" />{" "}
                            {job.location}
                          </>
                        )}
                        {salary && ` · ${salary}`}
                      </p>
                    </div>

                    <span className="hidden text-[11px] text-[oklch(0.55_0.02_265)] md:inline">
                      {job.source}
                    </span>
                    <span className="hidden w-16 text-right text-[11px] text-[oklch(0.55_0.02_265)] md:inline">
                      {posted}
                    </span>

                    {/* Save / unsave toggle */}
                    <button
                      onClick={() => {
                        if (isSaved) {
                          unsaveJob.mutate({ jobId: job.id });
                        } else {
                          saveJob.mutate({ jobId: job.id });
                        }
                      }}
                      aria-label={isSaved ? "Unsave" : "Save"}
                      className="grid h-8 w-8 place-items-center rounded-lg border border-black/5 bg-white text-[oklch(0.4_0.02_265)] hover:bg-black/[0.03]"
                    >
                      {isSaved ? (
                        <BookmarkCheck className="h-4 w-4 text-[#2563EB]" />
                      ) : (
                        <Bookmark className="h-4 w-4" />
                      )}
                    </button>

                    <DashButtonLink
                      to="/dashboard/applications"
                      size="sm"
                      className="hidden md:inline-flex"
                    >
                      Apply <ArrowUpRight className="h-3 w-3" />
                    </DashButtonLink>
                  </li>
                );
              })}
            </ul>

            {/* ── Pagination ─────────────────────────────────────────────── */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between border-t border-black/5 px-4 py-3">
                <p className="text-xs text-[oklch(0.5_0.02_265)]">
                  Showing{" "}
                  {(pagination.page - 1) * pagination.pageSize + 1}–
                  {Math.min(pagination.page * pagination.pageSize, total)} of{" "}
                  {total} jobs
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
          </>
        )}
      </DashCard>
    </>
  );
}