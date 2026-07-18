import type { SupportedSite } from "../site-detection/types";

export type WorkMode = "Remote" | "Hybrid" | "Onsite";
export type EmploymentType =
  "Full-Time" | "Part-Time" | "Contract" | "Internship" | "Temporary" | "Freelance";
export type SalaryPeriod = "Hourly" | "Daily" | "Weekly" | "Monthly" | "Yearly";

/** One member of a job's hiring team (recruiter, hiring manager, poster). Persisted as jsonb. */
export type HiringTeamMember = {
  name: string;
  profileUrl: string | null;
  role: string | null;
};

/**
 * The canonical, site-agnostic job model. Every parser — LinkedIn today, any
 * future board or the manual-URL importer — returns this exact shape, so the
 * downstream Normalizer → Validator → DuplicateResolver → persistence pipeline
 * never needs to know which source produced it.
 *
 * This is the application contract; `global_jobs` is only the persistence
 * layer. Several fields are stored under an existing column with an equivalent
 * meaning rather than a new one (see the mapping notes) — no duplicate semantic
 * columns are introduced. Genuinely-new fields get new columns in
 * `supabase/migrations/20260720000001_module4a_universal_job_model.sql`.
 *
 * Missing values are always `null` (or `[]` for lists) — parsers never fabricate.
 */
/**
 * Persistence label for a job's origin. A parser always emits a concrete
 * `SupportedSite`; the manual-URL importer emits `"Manual"` when the host isn't
 * a recognized board. Maps to the `global_jobs.source` column.
 */
export type JobSourceTag = SupportedSite | "Manual";

export type UniversalJob = {
  // ── Identity ──────────────────────────────────────────────────────────────
  source: JobSourceTag;
  /** External job-board ID (spec: `externalID`) → column `source_job_id`. Null if unavailable. */
  sourceJobId: string | null;
  /**
   * Fallback dedup key, computed by the pipeline (DuplicateResolver), not the
   * parser — always `null` on a freshly-parsed job.
   */
  fingerprint: string | null;
  /** Spec: `title` → column `role`. */
  title: string;
  /** Spec: `company` → column `company_name`. */
  companyName: string;
  /** Spec: `companyLogo` → column `company_logo_url`. */
  companyLogoUrl: string | null;
  /** The company's LinkedIn/profile page → column `company_url`. */
  companyUrl: string | null;
  /** The company's own careers/ATS page → new column `company_career_url`. */
  companyCareerUrl: string | null;

  // ── Location ──────────────────────────────────────────────────────────────
  location: string | null;
  city: string | null;
  /** New column `state` (only city/country existed before). */
  state: string | null;
  country: string | null;
  /** Derived from `workMode` by the Normalizer — parsers should leave it `false`. */
  remote: boolean;
  /** Spec: `workMode`/`remoteType` → column `work_mode` (+ derived `remote`). */
  workMode: WorkMode | null;

  // ── Employment ────────────────────────────────────────────────────────────
  employmentType: EmploymentType | null;
  /** Spec: `experience`/`seniority` → existing column `experience_level`. */
  experienceLevel: string | null;
  /** New column `department`. */
  department: string | null;
  jobFunction: string | null;

  // ── Compensation ──────────────────────────────────────────────────────────
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  /** New column `salary_period` (Hourly/…/Yearly). */
  salaryPeriod: SalaryPeriod | null;
  /**
   * Verbatim salary display string (e.g. "₹8–12 LPA", "Competitive") → new
   * column `salary_text`. Distinct from the parsed numeric range; the
   * Normalizer synthesizes it from the numeric fields when a source gives none.
   */
  salaryText: string | null;

  // ── Description ───────────────────────────────────────────────────────────
  /** Flattened plain text (spec: `descriptionText`) → column `description`. */
  description: string | null;
  /** Sanitized structural HTML (spec: `descriptionHTML`) → column `description_html`. */
  descriptionHtml: string | null;
  /** New column `responsibilities` (text[]). */
  responsibilities: string[];
  /** New column `requirements` (text[]). */
  requirements: string[];
  /** New column `preferred_qualifications` (text[]). */
  preferredQualifications: string[];
  benefits: string[];

  // ── Skills ────────────────────────────────────────────────────────────────
  skills: string[];
  /** New column `technologies` (text[]) — distinct from soft/general skills. */
  technologies: string[];
  /** New column `languages` (text[]) — spoken and/or programming languages. */
  languages: string[];

  // ── Metadata ──────────────────────────────────────────────────────────────
  /** Spec: `postedDate` → column `posted_at`. ISO 8601 or null. */
  postedAt: string | null;
  /** Human "time ago" string captured verbatim (e.g. "2 weeks ago"). */
  postedAgo: string | null;
  /** New column `expiry_date` (timestamptz). ISO 8601 or null. */
  expiryDate: string | null;
  /** Spec: `applicants` → column `applicant_count`. */
  applicantCount: number | null;
  /** New column `hiring_team` (jsonb). */
  hiringTeam: HiringTeamMember[];
  /** New column `recruiter_name`. */
  recruiterName: string | null;
  /** New column `recruiter_profile`. */
  recruiterProfile: string | null;
  /** New column `company_size` (e.g. "10,001+ employees"). */
  companySize: string | null;
  industry: string | null;
  /** Best-effort hirer highlights — often empty. */
  hiringInsights: string[];
  easyApply: boolean;
  promoted: boolean;
  reposted: boolean;
  /** True when applications route through an external ATS rather than the board's own inbox. */
  responsesManaged: boolean;

  // ── URLs / state ──────────────────────────────────────────────────────────
  applyUrl: string | null;
  sourceUrl: string;
  /** True when the page signals the posting is closed, expired, or removed. */
  isClosed: boolean;
  /**
   * True only for jobs created via the manual-URL importer, never by a live
   * parser. Drives the Global Jobs discovery feed's visibility filter (manual
   * imports stay in `global_jobs` but are hidden from that feed) — see
   * `JobRepository.findAll` and `upsert_global_job`'s promotion semantics
   * (once a real parser captures the same identity, this flips back to
   * `false` permanently).
   */
  isManualImport: boolean;

  // ── Parser metadata ───────────────────────────────────────────────────────
  /** Identifies which parser + version produced this job (e.g. "linkedin-1"). */
  parserVersion: string;
  /**
   * Extraction completeness in [0, 1], COMPUTED by the Normalizer from how many
   * important fields were populated — never hardcoded. A dedicated parser that
   * fills more fields naturally scores higher than generic/manual extraction.
   */
  parserConfidence: number;
  /** Non-fatal notes accumulated during extraction/normalization (e.g. "missing salary"). */
  extractionWarnings: string[];
};

/**
 * Backwards-compatible alias. `UniversalJob` is the primary model going
 * forward; existing imports of `NormalizedJob` keep working during the
 * transition.
 */
export type NormalizedJob = UniversalJob;

export type ParserContext = {
  document: Document;
  url: string;
};

export interface JobParser {
  /**
   * Extraction ONLY. Returns a `UniversalJob` populated with whatever the page
   * exposes (unknown fields left at their `null`/`[]` defaults), or `null` when
   * there is no valid job-details DOM present. A parser must never normalize,
   * validate, deduplicate, persist, or call any API — those are later pipeline
   * stages. See `createUniversalJob` for the shared default shape.
   */
  tryParse(context: ParserContext): UniversalJob | null;
}

/** Required identity a parser must supply; everything else defaults. */
export type UniversalJobSeed = Partial<UniversalJob> & {
  source: JobSourceTag;
  title: string;
  companyName: string;
  sourceUrl: string;
  parserVersion: string;
};

/**
 * Builds a fully-populated `UniversalJob` from a parser's extracted subset,
 * defaulting every unspecified field. Guarantees every parser emits the exact
 * same structure without repeating the (long) default list in each one.
 */
export function createUniversalJob(seed: UniversalJobSeed): UniversalJob {
  return {
    sourceJobId: null,
    fingerprint: null,
    companyLogoUrl: null,
    companyUrl: null,
    companyCareerUrl: null,
    location: null,
    city: null,
    state: null,
    country: null,
    remote: false,
    workMode: null,
    employmentType: null,
    experienceLevel: null,
    department: null,
    jobFunction: null,
    salaryMin: null,
    salaryMax: null,
    salaryCurrency: null,
    salaryPeriod: null,
    salaryText: null,
    description: null,
    descriptionHtml: null,
    responsibilities: [],
    requirements: [],
    preferredQualifications: [],
    benefits: [],
    skills: [],
    technologies: [],
    languages: [],
    postedAt: null,
    postedAgo: null,
    expiryDate: null,
    applicantCount: null,
    hiringTeam: [],
    recruiterName: null,
    recruiterProfile: null,
    companySize: null,
    industry: null,
    hiringInsights: [],
    easyApply: false,
    promoted: false,
    reposted: false,
    responsesManaged: false,
    applyUrl: null,
    isClosed: false,
    isManualImport: false,
    parserConfidence: 0,
    extractionWarnings: [],
    ...seed,
  };
}
