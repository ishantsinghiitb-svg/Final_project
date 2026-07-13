import type {
  WorkMode,
  EmploymentType,
  ExperienceLevel,
  JobSource,
} from "@/types";

// ── Filter shape ─────────────────────────────────────────────────────────────
// Add more filter fields here as Sprint 2+ requirements emerge.
// The repository's buildFilteredQuery helper will pick them up automatically.

export type JobFilters = {
  /** Free-text keyword — matched against role, company_name, description */
  q?: string;
  /** Exact or partial company name */
  company?: string;
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
  | "salary_max";

export type SortDirection = "asc" | "desc";

export type JobSort = {
  field: JobSortField;
  direction: SortDirection;
};
