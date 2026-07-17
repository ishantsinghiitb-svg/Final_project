import type { EmploymentType, WorkMode } from "../types";

/**
 * Shared classification patterns for LinkedIn's "insight pill" and criteria
 * text, used both by `structuredFields.ts` (segment classification) and
 * `LinkedInParser.ts` (blob-regex fallback). Centralized here so the two
 * layers never drift out of sync with each other.
 */

export const WORK_MODE_KEYWORDS: Array<[RegExp, WorkMode]> = [
  [/remote/i, "Remote"],
  [/hybrid/i, "Hybrid"],
  [/on-?site/i, "Onsite"],
];

export const EMPLOYMENT_TYPE_PATTERNS: Array<[RegExp, EmploymentType]> = [
  [/full-?time/i, "Full-Time"],
  [/part-?time/i, "Part-Time"],
  [/temporary/i, "Temporary"],
  [/freelance/i, "Freelance"],
  [/contract/i, "Contract"],
  [/intern/i, "Internship"],
];

/** Ordered most-senior-first isn't required — first match wins, so order by specificity instead. */
export const SENIORITY_PATTERNS: Array<[RegExp, string]> = [
  [/internship/i, "Internship"],
  [/entry level/i, "Entry Level"],
  [/associate/i, "Associate"],
  [/mid-senior level/i, "Mid-Senior Level"],
  [/director/i, "Director"],
  [/executive/i, "Executive"],
  [/senior/i, "Senior"],
];
