// ── Module 10A: Job Intelligence Foundation — unified Job schema ──
//
// Every platform adapter's parser produces a `ParsedJobPosting`. This is
// deliberately the SAME field set `upsert_global_job` already accepts (see
// supabase/migrations/20260720000001_module4a_universal_job_model.sql and
// later) — `global_jobs` is already this project's "Universal Job Model", so
// this module reuses it as the canonical store instead of inventing a
// parallel schema. `ParsedJobPosting` is just that same shape in camelCase,
// decoupled from the DB row so parsers never import Supabase types.
//
// `source` is a plain `string` here (not the closed `JobSource` union the
// existing Jobs UI/filters use) — a new platform adapter must be pluggable
// without editing a shared enum. `global_jobs.source` has no CHECK
// constraint, so this is safe at the DB layer too.

export type WorkModeValue = "Remote" | "Hybrid" | "Onsite";
export type EmploymentTypeValue =
  "Full-Time" | "Part-Time" | "Contract" | "Internship" | "Temporary" | "Freelance";
export type ExperienceLevelValue =
  | "Entry-Level"
  | "Mid-Level"
  | "Senior-Level"
  | "Intern"
  | "Junior"
  | "Lead"
  | "Staff"
  | "Principal";

/** One member of a job's hiring team — mirrors `global_jobs.hiring_team`. */
export type HiringTeamMember = {
  name: string;
  profileUrl: string | null;
  role: string | null;
};

/**
 * Platform-agnostic parsed job posting — the output of a `JobParser` and the
 * input to normalization. Field names mirror `global_jobs` columns
 * (camelCase) so the Database stage can map 1:1 without a lossy translation
 * layer.
 */
export type ParsedJobPosting = {
  // ── Identity ──
  source: string;
  /** External job-board id (e.g. a LinkedIn/Greenhouse job id) — tier-1 dedup key. */
  sourceJobId?: string | null;
  /** Canonical job-posting page URL, distinct from `url` (the apply-action link). */
  sourceUrl?: string | null;
  url?: string | null;

  // ── Core fields (required) ──
  companyName: string;
  role: string;

  // ── Location ──
  location?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  remote?: boolean;
  workMode?: WorkModeValue | null;

  // ── Classification ──
  employmentType?: EmploymentTypeValue | null;
  experienceLevel?: ExperienceLevelValue | null;
  department?: string | null;
  jobFunction?: string | null;
  industry?: string | null;

  // ── Compensation ──
  salaryMin?: number | null;
  salaryMax?: number | null;
  salaryCurrency?: string | null;
  salaryPeriod?: string | null;
  salaryText?: string | null;

  // ── Content ──
  description?: string | null;
  descriptionHtml?: string | null;
  responsibilities?: string[] | null;
  requirements?: string[] | null;
  preferredQualifications?: string[] | null;
  benefits?: string[] | null;
  skills?: string[] | null;
  technologies?: string[] | null;
  languages?: string[] | null;
  /** Free-form platform tags (e.g. "urgent-hiring", "visa-sponsorship"). */
  tags?: string[] | null;

  // ── Company ──
  companyUrl?: string | null;
  companyCareerUrl?: string | null;
  companyLogoUrl?: string | null;
  companySize?: string | null;

  // ── Posting lifecycle ──
  postedAt?: string | null;
  postedAgo?: string | null;
  expiryDate?: string | null;
  isClosed?: boolean;

  // ── Hiring signals ──
  applicantCount?: number | null;
  hiringInsights?: string[] | null;
  hiringTeam?: HiringTeamMember[] | null;
  recruiterName?: string | null;
  recruiterProfile?: string | null;
  easyApply?: boolean;
  promoted?: boolean;
  reposted?: boolean;
  responsesManaged?: boolean;

  // ── Parser provenance ──
  parserVersion: string;
  parserConfidence?: number | null;
  extractionWarnings?: string[];
};

/**
 * `ParsedJobPosting` plus the derived fields the Normalizer stage attaches.
 * `original*` are preserved verbatim (never overwritten) alongside the
 * normalized forms — see normalize/company.ts and normalize/role.ts.
 */
export type NormalizedJobPosting = ParsedJobPosting & {
  normalizedCompany: string;
  normalizedRole: string;
  normalizedLocation: string | null;
  /** SHA-256 fallback dedup key — see fingerprint.ts. Present whenever company+role are non-empty. */
  fingerprint: string;
};

/** A single platform's contribution to a canonical job — see the `job_sources` table. */
export type JobSourceRecord = {
  jobId: string;
  source: string;
  sourceJobId: string | null;
  sourceUrl: string | null;
  url: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
};
