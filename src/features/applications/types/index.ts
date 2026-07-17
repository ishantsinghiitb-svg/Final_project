import type { ApplicationStatus } from "@/types";
import type { RoleCategory } from "@/features/jobs/types";

export type { RoleCategory };

// ── Applied-date filter preset ───────────────────────────────────────────────

export type AppliedDatePreset =
  | "today"
  | "last_7_days"
  | "last_30_days"
  | "last_90_days"
  | "this_year"
  | "custom";

// ── Application filter shape ─────────────────────────────────────────────────

export type ApplicationFilters = {
  /** Free-text keyword — matched against company_name, role, notes */
  q?: string;
  /** One or more statuses */
  status?: ApplicationStatus | ApplicationStatus[];
  /** Partial company name */
  company?: string;
  /** One or more role categories, derived from the free-text role field */
  role?: RoleCategory | RoleCategory[];
  /** ISO date string — only include applications on or after this date */
  appliedAfter?: string;
  /** ISO date string — only include applications on or before this date */
  appliedBefore?: string;
  /** UI-only: which preset produced appliedAfter/appliedBefore (drives the filter bar's selected option) */
  appliedDatePreset?: AppliedDatePreset;
  /** Job source (LinkedIn, Greenhouse, etc.) */
  source?: string;
  /** false (default) = active board only, true = archived only */
  archived?: boolean;
};

// ── Sort shape ───────────────────────────────────────────────────────────────

export type ApplicationSortField =
  | "updated_at"
  | "applied_at"
  | "company_name"
  | "status"
  | "created_at";

export type SortDirection = "asc" | "desc";

export type ApplicationSort = {
  field: ApplicationSortField;
  direction: SortDirection;
};

export type ApplicationSortOption =
  | "recently_updated"
  | "recently_applied"
  | "company_az"
  | "company_za"
  | "status";

// ── URL search params shape ──────────────────────────────────────────────────

export type ApplicationsSearchParams = {
  q?: string;
  status?: string;
  company?: string;
  source?: string;
  appliedAfter?: string;
  appliedBefore?: string;
  sort?: ApplicationSortOption;
  view?: "board" | "list";
};

// ── Manual application creation ──────────────────────────────────────────────

export type ManualApplicationInput = {
  company_name: string;
  role: string;
  status: ApplicationStatus;
  location?: string;
  url?: string;
  /** Single optional figure — stored as salary_min; salary_max is left unset. */
  salary?: number;
  notes?: string;
};
