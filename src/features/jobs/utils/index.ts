import type { GlobalJob } from "@/types";
import type { JobFilters, JobSortOption, RoleCategory } from "@/features/jobs/types";
import { normalizeFilters } from "@/features/jobs/filter-maps";
import { SORT_OPTIONS } from "@/features/jobs/constants";

// ── Stable gradient palette for company initials ──────────────────────────
// Deterministic from the first character of the company name so the colour
// never changes between renders or pages.
export const LOGO_GRADIENTS = [
  "from-[#5E6AD2] to-[#3B82F6]",
  "from-[#111827] to-[#374151]",
  "from-[#635BFF] to-[#7C3AED]",
  "from-[#E5E7EB] to-[#9CA3AF]",
  "from-[#FF6363] to-[#F59E0B]",
  "from-[#C97A5A] to-[#7C3AED]",
  "from-[#F24E1E] to-[#A259FF]",
  "from-[#000]    to-[#374151]",
  "from-[#F59E0B] to-[#EAB308]",
  "from-[#EC4899] to-[#8B5CF6]",
  "from-[#20B8CD] to-[#0EA5E9]",
  "from-[#3B82F6] to-[#6366F1]",
] as const;

/** Returns a deterministic Tailwind gradient class based on the first character. */
export function logoToneForCompany(name: string): string {
  const idx = (name.charCodeAt(0) ?? 0) % LOGO_GRADIENTS.length;
  return LOGO_GRADIENTS[idx];
}

/**
 * Format a single salary number with a currency-specific symbol and scale.
 *
 * INR → Indian lakh/crore shorthand (₹18L, ₹1.5Cr)
 * Others → Intl compact currency (e.g. $120K, €2M)
 *
 * The returned string already contains the correct currency symbol —
 * callers must NOT prepend a generic "$" icon.
 */
function formatAmount(n: number, currency: string): string {
  const c = currency.toUpperCase();

  if (c === "INR") {
    if (n >= 1_00_00_000) {
      const cr = n / 1_00_00_000;
      return `₹${cr % 1 === 0 ? cr.toString() : cr.toFixed(1)}Cr`;
    }
    if (n >= 1_00_000) {
      const l = n / 1_00_000;
      return `₹${l % 1 === 0 ? l.toString() : l.toFixed(1)}L`;
    }
    return `₹${new Intl.NumberFormat("en-IN").format(n)}`;
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: c,
    maximumFractionDigits: 0,
    notation: "compact",
  }).format(n);
}

/**
 * Format a salary range into a human-readable string.
 * Returns "" when no salary data is present.
 * The string already contains the correct currency symbol — never combine
 * with a DollarSign icon or any other generic currency glyph.
 */
export function formatSalary(job: GlobalJob): string {
  if (!job.salary_min && !job.salary_max) return "";
  const currency = job.salary_currency ?? "USD";

  if (job.salary_min && job.salary_max) {
    return `${formatAmount(job.salary_min, currency)}–${formatAmount(job.salary_max, currency)}`;
  }
  if (job.salary_min) return `${formatAmount(job.salary_min, currency)}+`;
  return `Up to ${formatAmount(job.salary_max!, currency)}`;
}

/**
 * Relative time computed from the parsed `posted_at` ISO timestamp.
 * INTERNAL fallback only — used by `formatPostedTime()` when a job has no
 * verbatim captured string (e.g. a manually-imported job). Every UI surface
 * must call `formatPostedTime()`, never this directly.
 */
function computeRelativePostedTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const hours = Math.floor(diff / 3_600_000);
  if (hours < 1) return "Just now";
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * THE single canonical "posted X ago" display for a job. Every surface
 * (Jobs List, Job Detail, Saved Jobs, Applications, and any future one) must
 * call this — never independently recompute a relative-time string from
 * `posted_at`.
 *
 * Prefers `posted_ago`, the verbatim string captured ONCE at extraction time
 * (e.g. LinkedIn's own "4 weeks ago"). That capture is the only value
 * guaranteed to match what the source platform itself displayed —
 * `posted_at` (the separately-parsed ISO date) can legitimately disagree
 * with it (a reposted/bumped LinkedIn listing's structured `datePosted`
 * sometimes reflects a different moment than its own visible "time ago"
 * text). Recomputing from `posted_at` independently on every page is exactly
 * what previously showed two different numbers for the same job depending on
 * which page you were on. Falls back to computing from `posted_at` only when
 * no verbatim string was ever captured.
 */
export function formatPostedTime(
  job: Pick<GlobalJob, "posted_ago" | "posted_at">,
): string {
  return job.posted_ago || computeRelativePostedTime(job.posted_at);
}

// ── Source label formatting ──────────────────────────────────────────────────
// `global_jobs.source` / `applications.source` stay lowercase board tags
// ("linkedin", "greenhouse", …) or "Manual" — see
// features/jobs/source-detection.ts and SOURCE_OPTIONS in
// features/jobs/constants, which filters MUST keep using verbatim. This is a
// presentation-only helper — never use its output to build a filter value or
// write back to the database.

const SOURCE_LABELS: Record<string, string> = {
  linkedin: "LinkedIn",
  internshala: "Internshala",
  naukri: "Naukri",
  indeed: "Indeed",
  unstop: "Unstop",
  greenhouse: "Greenhouse",
  lever: "Lever",
  ashby: "Ashby",
  wellfound: "Wellfound",
  workday: "Workday",
  careers: "Careers",
  manual: "Manual",
};

/** Display label for a stored `source` value, e.g. "linkedin" → "LinkedIn". Presentation only. */
export function formatSourceLabel(source: string | null | undefined): string {
  if (!source) return "";
  const known = SOURCE_LABELS[source.toLowerCase()];
  if (known) return known;
  // Unrecognized/future source not yet in the map — best-effort capitalize
  // rather than showing nothing or a broken label.
  return source.charAt(0).toUpperCase() + source.slice(1);
}

// ── Status badges (Imported / Expired / Closed) ─────────────────────────────
// Mirrors the EXACT rule JobRepository.applyDiscoveryVisibility uses to hide
// expired jobs from the Global Jobs discovery feed, so a job hidden from that
// feed shows the exact same badge wherever it still appears (Applications,
// Saved Jobs, direct job-detail links). Do not duplicate/fork this logic
// elsewhere — extend it here and in JobRepository together.

/**
 * A job is expired ONLY when it carries an explicit `expiry_date` that has
 * already passed. `posted_at` age is deliberately NOT used: LinkedIn's
 * structured `posted_at` (JSON-LD `datePosted`) is the ORIGINAL post date, so
 * a freshly captured, still-open *reposted* job can legitimately be months old
 * — treating that as "expired" wrongly hid valid jobs from the feed. A closed
 * posting is surfaced separately via `is_closed` (see getJobBadges).
 */
export function isJobExpired(job: Pick<GlobalJob, "expiry_date">): boolean {
  return Boolean(job.expiry_date && new Date(job.expiry_date).getTime() < Date.now());
}

export type JobStatusBadge = {
  key: "closed" | "expired" | "imported";
  label: string;
  tone: "rose" | "amber" | "default";
};

/**
 * Small, non-dominant status chips for a job that may be hidden from the
 * Global Jobs discovery feed. "Closed" (an explicit source signal) takes
 * precedence over "Expired" (an explicit `expiry_date`) — showing both would
 * be redundant. "Imported" is independent and can appear alongside either.
 */
export function getJobBadges(
  job: Pick<GlobalJob, "is_closed" | "expiry_date" | "is_manual_import">,
): JobStatusBadge[] {
  const badges: JobStatusBadge[] = [];

  if (job.is_closed) {
    badges.push({ key: "closed", label: "Closed", tone: "rose" });
  } else if (isJobExpired(job)) {
    badges.push({ key: "expired", label: "Expired", tone: "amber" });
  }

  if (job.is_manual_import) {
    badges.push({ key: "imported", label: "Imported", tone: "default" });
  }

  return badges;
}

// ── Role categorization ──────────────────────────────────────────────────────
// A job/application's `role` is free text (e.g. "Senior Frontend Engineer").
// The Role filter (Jobs + Applications) matches it against a category the
// same way the free-text Search box matches a query — "does this keyword
// appear anywhere in the role text" — rather than trying to classify each
// role into exactly one bucket. That exclusivity was the bug: a role like
// "Product Analyst" or "Product Lead" was tested against a narrow phrase
// ("product manager" | "product owner" | standalone "pm") and, on missing
// it, fell through to every later category too, landing in "other". A role
// can legitimately match more than one category (e.g. "Product Designer"
// matches both Product and Design) — that's correct, not a bug, since a
// multi-select filter is an OR over categories, exactly like Search is an
// OR-free single substring match.
//
// This is the single source of truth for the mapping; both the Jobs and
// Applications Role filters import it rather than re-implementing matching.

const CATEGORY_KEYWORDS: Record<RoleCategory, string[]> = {
  product: ["product"],
  frontend: ["frontend", "front end", "front-end", "react developer", "ui engineer"],
  backend: ["backend", "back end", "back-end", "server-side", "server side"],
  full_stack: ["full stack", "full-stack", "fullstack"],
  mobile: ["mobile", "ios", "android", "flutter", "react native"],
  data: ["data", "analytics", "business intelligence"],
  ml_ai: ["machine learning", "artificial intelligence", "deep learning", "computer vision", "nlp", "llm", "ai", "ml"],
  devops: ["devops", "site reliability", "infrastructure", "platform engineer", "cloud engineer", "sre"],
  design: ["design", "ux", "ui/ux"],
  marketing: ["marketing", "growth", "seo", "content strategist"],
  sales: ["sales", "account executive", "business development", "bdr", "sdr"],
  finance: ["finance", "accounting", "financial analyst"],
  operations: ["operations", "program manager", "project manager", "people ops", "hr", "human resources", "ops"],
  other: [],
};

const REAL_CATEGORIES = (Object.keys(CATEGORY_KEYWORDS) as RoleCategory[]).filter(
  (c) => c !== "other",
);

// Short, ambiguous keywords need a word-boundary check — a plain substring
// test would false-positive "ai" inside "Maintenance" or "ops" inside "Shops".
const WORD_BOUNDARY_KEYWORDS = new Set([
  "ai", "ml", "ux", "hr", "sre", "seo", "bdr", "sdr", "ops", "nlp", "llm",
]);

function keywordInRole(role: string, keyword: string): boolean {
  if (WORD_BOUNDARY_KEYWORDS.has(keyword)) {
    return new RegExp(`\\b${keyword}\\b`, "i").test(role);
  }
  return role.toLowerCase().includes(keyword);
}

/** Does this role belong to the given category? A role can match more than one. */
export function roleMatchesCategory(role: string | null | undefined, category: RoleCategory): boolean {
  if (!role) return category === "other";
  if (category === "other") {
    return !REAL_CATEGORIES.some((c) => roleMatchesCategory(role, c));
  }
  return CATEGORY_KEYWORDS[category].some((kw) => keywordInRole(role, kw));
}

/** Does this role match ANY of the given categories (OR — for multi-select filters)? */
export function roleMatchesAnyCategory(
  role: string | null | undefined,
  categories: RoleCategory[],
): boolean {
  return categories.some((c) => roleMatchesCategory(role, c));
}

// ── Role keyword extraction (Similar Jobs) ────────────────────────────────────
// Seniority / generic modifiers are dropped so the CORE role words dominate,
// letting "Product Manager", "Senior Product Manager" and "Associate Product
// Manager" all share the same signal ("product", "manager").
const ROLE_STOPWORDS = new Set([
  "and", "the", "for", "of", "to", "in", "at", "with", "or", "a", "an",
  "senior", "junior", "lead", "staff", "principal", "sr", "jr",
  "associate", "entry", "mid", "level", "intern", "internship", "trainee",
]);

/**
 * Significant, de-duplicated lowercase keywords from a role/title (≥3 chars,
 * stopwords removed). "Associate Product Manager" → ["product", "manager"].
 */
export function extractRoleKeywords(role: string | null | undefined): string[] {
  if (!role) return [];
  const seen = new Set<string>();
  for (const raw of role.toLowerCase().split(/[^a-z0-9]+/)) {
    if (raw.length >= 3 && !ROLE_STOPWORDS.has(raw)) seen.add(raw);
  }
  return [...seen];
}

/**
 * The single most representative keyword of a role — used to seed the
 * "View More Similar Jobs" search. Prefers the longest significant word
 * (usually the domain noun, e.g. "product") over shorter generic ones.
 */
export function primaryRoleKeyword(role: string | null | undefined): string | undefined {
  const words = extractRoleKeywords(role);
  if (words.length === 0) return undefined;
  return words.reduce((a, b) => (b.length > a.length ? b : a));
}

// ── Client-side filter/sort (Recently Viewed tab) ────────────────────────────
// The Jobs board's normal "All Jobs" search/filter/sort runs server-side
// (JobRepository.findAll / findAllRanked) against the full, paginated global
// catalog — that stays untouched. The "Recently Viewed" tab is a small (≤10),
// already-fully-fetched dataset, so its search/filter/sort applies the SAME
// filter fields and sort vocabulary in memory instead of round-tripping to
// the server. Reuses the same normalizeFilters()/roleMatchesAnyCategory()
// primitives the server-side path is built on, so "the exact same filters"
// holds even though execution differs — no separate/divergent filtering rules.

/** Does this job match every active filter field, mirroring JobRepository.findAll's semantics one field at a time. */
export function jobMatchesFilters(job: GlobalJob, filters: JobFilters): boolean {
  if (filters.q?.trim()) {
    const needle = filters.q.trim().toLowerCase();
    const haystack = [
      job.role,
      job.company_name,
      job.location,
      job.city,
      job.employment_type,
      job.description,
      job.job_function,
      job.industry,
    ]
      .filter(Boolean)
      .join(" \n ")
      .toLowerCase();
    if (!haystack.includes(needle)) return false;
  }

  if (filters.company && !job.company_name?.toLowerCase().includes(filters.company.toLowerCase())) {
    return false;
  }

  if (filters.location && !job.location?.toLowerCase().includes(filters.location.toLowerCase())) {
    return false;
  }

  if (filters.remote !== undefined && Boolean(job.remote) !== filters.remote) {
    return false;
  }

  // workMode/employmentType/experienceLevel arrive as lowercase URL slugs —
  // normalizeFilters() maps them to the Title-Case values global_jobs stores,
  // same as the server-side path.
  const normalized = normalizeFilters(filters);

  if (normalized.workMode) {
    const modes = Array.isArray(normalized.workMode) ? normalized.workMode : [normalized.workMode];
    if (!job.work_mode || !modes.includes(job.work_mode)) return false;
  }

  if (normalized.employmentType) {
    const types = Array.isArray(normalized.employmentType) ? normalized.employmentType : [normalized.employmentType];
    if (!job.employment_type || !types.includes(job.employment_type)) return false;
  }

  if (normalized.experienceLevel) {
    const levels = Array.isArray(normalized.experienceLevel) ? normalized.experienceLevel : [normalized.experienceLevel];
    if (!job.experience_level || !levels.includes(job.experience_level)) return false;
  }

  if (filters.roleCategory) {
    const categories = Array.isArray(filters.roleCategory) ? filters.roleCategory : [filters.roleCategory];
    if (!roleMatchesAnyCategory(job.role, categories)) return false;
  }

  if (filters.source) {
    const sources = Array.isArray(filters.source) ? filters.source : [filters.source];
    if (!sources.includes(job.source)) return false;
  }

  if (filters.salaryMin !== undefined && (job.salary_min == null || job.salary_min < filters.salaryMin)) {
    return false;
  }

  if (filters.salaryMax !== undefined && (job.salary_max == null || job.salary_max > filters.salaryMax)) {
    return false;
  }

  if (filters.postedAfter && (!job.posted_at || job.posted_at < filters.postedAfter)) {
    return false;
  }

  return true;
}

/** Same field/direction semantics as the Jobs board's Sort control (SORT_OPTIONS), applied client-side. */
export function compareJobsBy(a: GlobalJob, b: GlobalJob, sortOption: JobSortOption): number {
  const { field, direction } = SORT_OPTIONS[sortOption].sort;
  const dir = direction === "asc" ? 1 : -1;
  const av = a[field as keyof GlobalJob];
  const bv = b[field as keyof GlobalJob];

  if (av == null && bv == null) return 0;
  if (av == null) return 1; // nulls last regardless of direction
  if (bv == null) return -1;

  if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
  return String(av).localeCompare(String(bv)) * dir;
}
