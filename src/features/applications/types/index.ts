import type { ApplicationStatus } from "@/types";

// ── Application filter shape ─────────────────────────────────────────────────

export type ApplicationFilters = {
  /** Free-text keyword — matched against company_name, role, notes */
  q?: string;
  /** One or more statuses */
  status?: ApplicationStatus | ApplicationStatus[];
  /** Partial company name */
  company?: string;
  /** ISO date string — only include applications on or after this date */
  appliedAfter?: string;
  /** ISO date string — only include applications on or before this date */
  appliedBefore?: string;
  /** Job source (LinkedIn, Greenhouse, etc.) */
  source?: string;
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
