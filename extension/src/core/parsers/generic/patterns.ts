import type { EmploymentType, SalaryPeriod, WorkMode } from "../types";

/**
 * schema.org `JobPosting.employmentType` uses a fixed enumeration. Only the
 * values with an unambiguous match in our own `EmploymentType` are mapped —
 * schema.org's `VOLUNTEER`/`PER_DIEM`/`OTHER` have no honest equivalent here,
 * so they're deliberately left unmapped (falls through to the regex ladder,
 * then to `null`) rather than guessed.
 */
export const SCHEMA_EMPLOYMENT_TYPE_MAP: Record<string, EmploymentType> = {
  FULL_TIME: "Full-Time",
  PART_TIME: "Part-Time",
  CONTRACTOR: "Contract",
  TEMPORARY: "Temporary",
  INTERN: "Internship",
  INTERNSHIP: "Internship",
};

export const EMPLOYMENT_TYPE_PATTERNS: Array<[RegExp, EmploymentType]> = [
  [/full[\s-]?time/i, "Full-Time"],
  [/part[\s-]?time/i, "Part-Time"],
  [/temporary|temp\b/i, "Temporary"],
  [/freelance/i, "Freelance"],
  [/contract/i, "Contract"],
  [/intern/i, "Internship"],
];

export const WORK_MODE_KEYWORDS: Array<[RegExp, WorkMode]> = [
  [/remote|work[\s-]from[\s-]home|telecommute/i, "Remote"],
  [/hybrid/i, "Hybrid"],
  [/on-?site|in-?office/i, "Onsite"],
];

/** schema.org `QuantitativeValue.unitText` for `baseSalary` — a fixed enumeration. */
export const SALARY_UNIT_MAP: Record<string, SalaryPeriod> = {
  HOUR: "Hourly",
  DAY: "Daily",
  WEEK: "Weekly",
  MONTH: "Monthly",
  YEAR: "Yearly",
};
