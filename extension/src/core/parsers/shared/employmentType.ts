import type { EmploymentType } from "../types";

/**
 * Site-agnostic free-text → `EmploymentType` classification. Naukri keeps its
 * own inline copy of this pattern set (untouched here); Foundit and Wellfound
 * both need the identical mapping for their own "Full time"/"Full Time"/
 * "Part-Time" style labels, so it lives here once rather than being retyped
 * per board.
 */
const EMPLOYMENT_TYPE_PATTERNS: Array<[RegExp, EmploymentType]> = [
  [/full[\s-]?time/i, "Full-Time"],
  [/part[\s-]?time/i, "Part-Time"],
  [/temporary|temp\b/i, "Temporary"],
  [/freelance/i, "Freelance"],
  [/contract/i, "Contract"],
  [/intern/i, "Internship"],
];

/** Maps a free-text employment-type label to the `UniversalJob` enum, or `null` if unrecognized. Never guesses. */
export function classifyEmploymentTypeText(raw: string | null | undefined): EmploymentType | null {
  if (!raw) return null;
  for (const [pattern, mapped] of EMPLOYMENT_TYPE_PATTERNS) {
    if (pattern.test(raw)) return mapped;
  }
  return null;
}
