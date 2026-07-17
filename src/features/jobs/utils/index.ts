import type { GlobalJob } from "@/types";
import type { RoleCategory } from "@/features/jobs/types";

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

/** Format a posted_at date string relative to now. */
export function formatPostedAt(iso: string | null | undefined): string {
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

/** Format a posted_at date into a full human-readable string for the detail page. */
export function formatPostedAtFull(iso: string | null | undefined): string {
  if (!iso) return "Unknown";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
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
