import type { JobSort, JobSortOption } from "@/features/jobs/types";
import type { PaginationParams } from "@/types";

// ── Defaults used by JobService and React Query hooks ────────────────────────

export const DEFAULT_JOB_SORT: JobSort = {
  field: "posted_at",
  direction: "desc",
};

export const DEFAULT_PAGINATION: PaginationParams = {
  page: 1,
  pageSize: 20,
};

export const JOB_PAGE_SIZE_OPTIONS = [10, 20, 50] as const;

// ── Sort options for the UI selector ────────────────────────────────────────

export const SORT_OPTIONS: Record<JobSortOption, { label: string; sort: JobSort }> = {
  newest: { label: "Newest first", sort: { field: "posted_at", direction: "desc" } },
  oldest: { label: "Oldest first", sort: { field: "posted_at", direction: "asc" } },
  salary_high: { label: "Salary: High → Low", sort: { field: "salary_max", direction: "desc" } },
  salary_low: { label: "Salary: Low → High", sort: { field: "salary_min", direction: "asc" } },
  company_az: { label: "Company: A → Z", sort: { field: "company_name", direction: "asc" } },
  company_za: { label: "Company: Z → A", sort: { field: "company_name", direction: "desc" } },
};

export const DEFAULT_SORT_OPTION: JobSortOption = "newest";

// ── Filter option arrays for dropdowns ──────────────────────────────────────

export const WORK_MODE_OPTIONS = [
  { value: "remote", label: "Remote" },
  { value: "hybrid", label: "Hybrid" },
  { value: "onsite", label: "On-site" },
] as const;

export const EMPLOYMENT_TYPE_OPTIONS = [
  { value: "full-time", label: "Full-time" },
  { value: "part-time", label: "Part-time" },
  { value: "contract", label: "Contract" },
  { value: "internship", label: "Internship" },
] as const;

export const EXPERIENCE_LEVEL_OPTIONS = [
  { value: "entry", label: "Entry" },
  { value: "junior", label: "Junior" },
  { value: "mid", label: "Mid" },
  { value: "senior", label: "Senior" },
  { value: "lead", label: "Lead" },
  { value: "staff", label: "Staff" },
  { value: "principal", label: "Principal" },
] as const;

export const SOURCE_OPTIONS = [
  { value: "LinkedIn", label: "LinkedIn" },
  { value: "Wellfound", label: "Wellfound" },
  { value: "Greenhouse", label: "Greenhouse" },
  { value: "Lever", label: "Lever" },
  { value: "Ashby", label: "Ashby" },
  { value: "Careers", label: "Careers" },
  { value: "Manual", label: "Manual" },
] as const;

export const POSTED_AFTER_OPTIONS = [
  { value: "", label: "Any time" },
  {
    value: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    label: "Past 24 hours",
  },
  {
    value: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    label: "Past week",
  },
  {
    value: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
    label: "Past month",
  },
] as const;
