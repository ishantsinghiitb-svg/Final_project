import type { SupportedSite } from "../site-detection/types";

export type WorkMode = "Remote" | "Hybrid" | "Onsite";
export type EmploymentType =
  "Full-Time" | "Part-Time" | "Contract" | "Internship" | "Temporary" | "Freelance";

/**
 * Site-agnostic job shape every parser normalizes into. Mirrors the subset of
 * `global_jobs` columns the extension can populate — see
 * `supabase/migrations/20260716150000_expand_global_job_metadata.sql`.
 */
export type NormalizedJob = {
  source: SupportedSite;
  /** External job-board ID (e.g. LinkedIn's numeric job id). Null if unavailable. */
  sourceJobId: string | null;
  /**
   * Dedup fallback key, populated by the content-script pipeline (not the
   * parser) via `FingerprintGenerator` when `sourceJobId` is null. Always
   * `null` on the object a parser returns.
   */
  fingerprint: string | null;
  title: string;
  companyName: string;
  companyLogoUrl: string | null;
  companyUrl: string | null;
  location: string | null;
  city: string | null;
  country: string | null;
  remote: boolean;
  workMode: WorkMode | null;
  employmentType: EmploymentType | null;
  experienceLevel: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  skills: string[];
  /** ISO 8601 timestamp, or null if not parseable. */
  postedAt: string | null;
  /** Human "time ago" string captured verbatim from the source (e.g. "2 weeks ago"). */
  postedAgo: string | null;
  applicantCount: number | null;
  /** Best-effort, often empty — LinkedIn doesn't always surface these. */
  hiringInsights: string[];
  easyApply: boolean;
  promoted: boolean;
  reposted: boolean;
  /** True when applications route through an external ATS rather than LinkedIn's own inbox. */
  responsesManaged: boolean;
  industry: string | null;
  jobFunction: string | null;
  /** Best-effort, often empty. */
  benefits: string[];
  /** Flattened plain text — used for search/preview and as the fallback when no HTML is available. */
  description: string | null;
  /** Sanitized HTML (structural tags only, no attributes) for rich rendering. */
  descriptionHtml: string | null;
  applyUrl: string | null;
  sourceUrl: string;
  /** True when the page itself signals the posting is closed, expired, or removed. */
  isClosed: boolean;
};

export type ParserContext = {
  document: Document;
  url: string;
};

export interface JobParser {
  /**
   * Attempts to extract a job from the current page. Returns `null` when no
   * valid job-details DOM is present (search results with nothing selected,
   * home feed, messaging, profile, company page, etc.) — the content script
   * takes no action at all in that case.
   */
  tryParse(context: ParserContext): NormalizedJob | null;
}
