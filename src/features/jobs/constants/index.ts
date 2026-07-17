import type { JobSort, JobSortOption, RoleCategory } from "@/features/jobs/types";
import type { PaginationParams } from "@/types";

// ── Defaults ─────────────────────────────────────────────────────────────────

export const DEFAULT_JOB_SORT: JobSort = {
  field: "posted_at",
  direction: "desc",
};

export const DEFAULT_PAGINATION: PaginationParams = {
  page: 1,
  pageSize: 20,
};

export const JOB_PAGE_SIZE_OPTIONS = [10, 20, 50] as const;

// ── Sort options ─────────────────────────────────────────────────────────────

export const SORT_OPTIONS: Record<JobSortOption, { label: string; sort: JobSort }> = {
  newest:     { label: "Newest first",       sort: { field: "posted_at",    direction: "desc" } },
  oldest:     { label: "Oldest first",       sort: { field: "posted_at",    direction: "asc"  } },
  salary_high:{ label: "Salary: High → Low", sort: { field: "salary_max",   direction: "desc" } },
  salary_low: { label: "Salary: Low → High", sort: { field: "salary_min",   direction: "asc"  } },
  company_az: { label: "Company: A → Z",     sort: { field: "company_name", direction: "asc"  } },
  company_za: { label: "Company: Z → A",     sort: { field: "company_name", direction: "desc" } },
};

export const DEFAULT_SORT_OPTION: JobSortOption = "newest";

// ── Filter option arrays ─────────────────────────────────────────────────────

export const WORK_MODE_OPTIONS = [
  { value: "remote", label: "Remote"  },
  { value: "hybrid", label: "Hybrid"  },
  { value: "onsite", label: "Onsite"  },
] as const;

export const EMPLOYMENT_TYPE_OPTIONS = [
  { value: "full-time",  label: "Full-Time"  },
  { value: "part-time",  label: "Part-Time"  },
  { value: "contract",   label: "Contract"   },
  { value: "internship", label: "Internship" },
] as const;

// Experience level URL slugs are mapped to DB values by normalizeFilters().
// Slug  →  DB value (see filter-maps.ts)
// entry-level  →  Entry-Level
// mid-level    →  Mid-Level
// senior-level →  Senior-Level
// intern       →  Intern
export const EXPERIENCE_LEVEL_OPTIONS = [
  { value: "intern",       label: "Intern"       },
  { value: "entry-level",  label: "Entry-Level"  },
  { value: "junior",       label: "Junior"       },
  { value: "mid-level",    label: "Mid-Level"    },
  { value: "senior-level", label: "Senior-Level" },
  { value: "lead",         label: "Lead"         },
  { value: "staff",        label: "Staff"        },
  { value: "principal",    label: "Principal"    },
] as const;

export const SOURCE_OPTIONS = [
  { value: "LinkedIn",   label: "LinkedIn"   },
  { value: "Wellfound",  label: "Wellfound"  },
  { value: "Greenhouse", label: "Greenhouse" },
  { value: "Lever",      label: "Lever"      },
  { value: "Ashby",      label: "Ashby"      },
  { value: "Careers",    label: "Careers"    },
  { value: "Manual",     label: "Manual"     },
] as const;

/**
 * Posted-after dropdown options.
 *
 * Values are stable relative-day strings ("1" = past 24h, "7" = past week,
 * "30" = past month, "" = any time).  The route converts these to absolute
 * ISO cutoff dates via `postedAfterToIso()` before passing them to the
 * repository, so the dropdown selection always matches the URL param exactly.
 *
 * Previously these were pre-computed ISO timestamps (at module-load time),
 * which caused the <select> value to never match the stored URL param because
 * the millisecond timestamp had already advanced since the module was loaded.
 */
export const POSTED_AFTER_OPTIONS = [
  { value: "",   label: "Any time"     },
  { value: "1",  label: "Past 24 hours"},
  { value: "7",  label: "Past week"    },
  { value: "30", label: "Past month"   },
] as const;

/**
 * Convert a relative-day URL param ("1", "7", "30") to an absolute ISO
 * cutoff string suitable for a Supabase `gte("posted_at", …)` filter.
 * Returns undefined when the value is empty (= any time).
 */
export function postedAfterToIso(days: string | undefined): string | undefined {
  if (!days) return undefined;
  const n = Number(days);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return new Date(Date.now() - n * 24 * 60 * 60 * 1_000).toISOString();
}

// ── Role category filter ─────────────────────────────────────────────────────
// Shared with the Applications feature — see features/jobs/utils.ts#categorizeRole.

export const ROLE_CATEGORY_LABELS: Record<RoleCategory, string> = {
  product: "Product",
  frontend: "Frontend",
  backend: "Backend",
  full_stack: "Full Stack",
  mobile: "Mobile",
  data: "Data",
  ml_ai: "ML / AI",
  devops: "DevOps",
  design: "Design",
  marketing: "Marketing",
  sales: "Sales",
  finance: "Finance",
  operations: "Operations",
  other: "Other",
};

export const ROLE_CATEGORY_OPTIONS: RoleCategory[] = [
  "product",
  "frontend",
  "backend",
  "full_stack",
  "mobile",
  "data",
  "ml_ai",
  "devops",
  "design",
  "marketing",
  "sales",
  "finance",
  "operations",
  "other",
];
