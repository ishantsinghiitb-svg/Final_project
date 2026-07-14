/**
 * filter-maps.ts
 *
 * Single source of truth for the mapping between URL search-param slug values
 * (what TanStack Router stores in the URL) and the exact string values stored
 * in the database columns.
 *
 * WHY THIS EXISTS
 * ───────────────
 * The URL uses lowercase hyphenated slugs because they are stable, shareable,
 * and human-readable (e.g. ?employmentType=full-time).
 * The database stores title-case values (e.g. "Full-Time").
 * Without this mapping, the Supabase `.in("employment_type", ["full-time"])`
 * query returns zero rows — a case-sensitive exact-match failure.
 *
 * USAGE
 * ─────
 * Never import these maps directly in route files or hooks.
 * Call `normalizeFilters(filters)` in JobService.getJobs() before passing
 * filters to the repository.  The repository always receives DB values.
 *
 * SOURCE FILTER
 * ─────────────
 * Source values ("LinkedIn", "Wellfound", …) are already stored in the DB
 * with the same casing as the URL param — no mapping needed.
 */

import type { JobFilters } from "@/features/jobs/types";
import type { WorkMode, EmploymentType, ExperienceLevel } from "@/types";

// ── Employment Type ──────────────────────────────────────────────────────────
const EMPLOYMENT_TYPE_MAP: Record<string, EmploymentType> = {
  "full-time":  "Full-Time",
  "part-time":  "Part-Time",
  "contract":   "Contract",
  "internship": "Internship",
  // Pass-through for callers that already send DB values
  "Full-Time":  "Full-Time",
  "Part-Time":  "Part-Time",
  "Contract":   "Contract",
  "Internship": "Internship",
};

// ── Work Mode ────────────────────────────────────────────────────────────────
const WORK_MODE_MAP: Record<string, WorkMode> = {
  "remote": "Remote",
  "hybrid": "Hybrid",
  "onsite": "Onsite",
  // Pass-through
  "Remote": "Remote",
  "Hybrid": "Hybrid",
  "Onsite": "Onsite",
};

// ── Experience Level ─────────────────────────────────────────────────────────
const EXPERIENCE_LEVEL_MAP: Record<string, ExperienceLevel> = {
  // User-specified slug → DB value mappings
  "entry-level":  "Entry-Level",
  "mid-level":    "Mid-Level",
  "senior-level": "Senior-Level",
  "intern":       "Intern",
  // Common alternative slugs
  "junior":    "Junior",
  "lead":      "Lead",
  "staff":     "Staff",
  "principal": "Principal",
  // Legacy slugs from old constants (safety net)
  "entry":  "Entry-Level",
  "mid":    "Mid-Level",
  "senior": "Senior-Level",
  // Pass-through for callers that already send DB values
  "Entry-Level":  "Entry-Level",
  "Mid-Level":    "Mid-Level",
  "Senior-Level": "Senior-Level",
  "Intern":       "Intern",
  "Junior":       "Junior",
  "Lead":         "Lead",
  "Staff":        "Staff",
  "Principal":    "Principal",
};

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Map a single slug to its DB value, falling through unchanged if unknown. */
function mapOne<T extends string>(value: string, map: Record<string, T>): T {
  return map[value] ?? (value as T);
}

/** Map a single value or array of values through a lookup map. */
function mapFilterField<T extends string>(
  value: T | T[] | undefined,
  map: Record<string, T>,
): T | T[] | undefined {
  if (value === undefined) return undefined;
  if (Array.isArray(value)) return value.map((v) => mapOne(v, map));
  return mapOne(value, map);
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Converts all slug-valued filter fields to the exact values stored in the DB.
 * Must be called in JobService.getJobs() before passing filters to the repository.
 *
 * Fields normalised:   workMode, employmentType, experienceLevel
 * Fields passed through unchanged: q, company, role, location, remote,
 *                                  source, salaryMin, salaryMax, postedAfter
 */
export function normalizeFilters(filters: JobFilters): JobFilters {
  return {
    ...filters,
    workMode: mapFilterField(
      filters.workMode as WorkMode | WorkMode[] | undefined,
      WORK_MODE_MAP,
    ),
    employmentType: mapFilterField(
      filters.employmentType as EmploymentType | EmploymentType[] | undefined,
      EMPLOYMENT_TYPE_MAP,
    ),
    experienceLevel: mapFilterField(
      filters.experienceLevel as ExperienceLevel | ExperienceLevel[] | undefined,
      EXPERIENCE_LEVEL_MAP,
    ),
  };
}
