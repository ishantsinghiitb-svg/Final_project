import type {
  WorkMode,
  EmploymentType,
  ExperienceLevel,
  JobSource,
} from "@/types";

// ── Role category ────────────────────────────────────────────────────────────
// Matched against a job's free-text `role` field — see
// features/jobs/utils.ts#roleMatchesCategory. Not stored in the DB. Shared
// with the Applications feature (applications inherit their role text from a job).

export type RoleCategory =
  | "product"
  | "frontend"
  | "backend"
  | "full_stack"
  | "mobile"
  | "data"
  | "ml_ai"
  | "devops"
  | "design"
  | "marketing"
  | "sales"
  | "finance"
  | "operations"
  | "other";

// ── Filter shape ─────────────────────────────────────────────────────────────

export type JobFilters = {
  /** Free-text keyword — matched against role, company_name, description */
  q?: string;
  /** Exact or partial company name */
  company?: string;
  /** Partial role string match */
  role?: string;
  /** One or more role categories, derived from the free-text role field */
  roleCategory?: RoleCategory | RoleCategory[];
  /** Partial location string match */
  location?: string;
  /** Remote-only toggle */
  remote?: boolean;
  /** One or more work modes */
  workMode?: WorkMode | WorkMode[];
  /** One or more employment types */
  employmentType?: EmploymentType | EmploymentType[];
  /** One or more experience levels */
  experienceLevel?: ExperienceLevel | ExperienceLevel[];
  /** One or more job sources */
  source?: JobSource | JobSource[];
  /** Minimum salary (salary_min column) */
  salaryMin?: number;
  /** Maximum salary (salary_max column) */
  salaryMax?: number;
  /** Only include jobs posted at or after this ISO date string */
  postedAfter?: string;
};

// ── Sort shape ───────────────────────────────────────────────────────────────

export type JobSortField =
  | "posted_at"
  | "created_at"
  | "salary_min"
  | "salary_max"
  | "company_name";

export type SortDirection = "asc" | "desc";

export type JobSort = {
  field: JobSortField;
  direction: SortDirection;
};

/**
 * Named sort option keys used in the UI sort selector.
 * Each maps to a concrete JobSort object via SORT_OPTIONS in constants.
 */
export type JobSortOption =
  | "newest"
  | "oldest"
  | "salary_high"
  | "salary_low"
  | "company_az"
  | "company_za";

// ── URL Search params shape ──────────────────────────────────────────────────
// Used by TanStack Router's validateSearch to type the URL search params.

export type JobsSearchParams = {
  q?: string;
  company?: string;
  location?: string;
  remote?: boolean;
  workMode?: string;
  employmentType?: string;
  experienceLevel?: string;
  roleCategory?: string;
  source?: string;
  salaryMin?: number;
  salaryMax?: number;
  postedAfter?: string;
  sort?: JobSortOption;
  page?: number;
  pageSize?: number;
};
