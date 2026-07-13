import type { JobSort } from "@/features/jobs/types";
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
