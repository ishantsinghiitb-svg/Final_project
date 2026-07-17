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
// The Role filter (Jobs + Applications) buckets it into a fixed taxonomy via
// keyword matching — order matters, most specific/least ambiguous categories
// are checked first. This is the single source of truth for that mapping;
// both features import it rather than re-implementing the classification.

const ROLE_PATTERNS: [RoleCategory, RegExp][] = [
  ["ml_ai", /machine learning|artificial intelligence|deep learning|\bnlp\b|computer vision|\bllm\b|\bml\b|\bai\b/i],
  ["data", /data (scientist|engineer|analyst)|analytics|business intelligence|\bbi\b/i],
  ["devops", /devops|site reliability|\bsre\b|infrastructure|platform engineer|cloud engineer/i],
  ["mobile", /\bios\b|\bandroid\b|mobile|flutter|react native/i],
  ["full_stack", /full[\s-]?stack/i],
  ["frontend", /front[\s-]?end|ui engineer|react developer/i],
  ["backend", /back[\s-]?end|server[\s-]?side/i],
  ["design", /designer|\bux\b|ui\/ux|product design/i],
  ["product", /product manager|product owner|\bpm\b/i],
  ["marketing", /marketing|growth|\bseo\b|content strategist/i],
  ["sales", /sales|account executive|business development|\bbdr\b|\bsdr\b/i],
  ["finance", /finance|accounting|financial analyst/i],
  ["operations", /operations|\bops\b|program manager|project manager|people ops|\bhr\b|human resources/i],
];

export function categorizeRole(role: string | null | undefined): RoleCategory {
  if (!role) return "other";
  for (const [category, pattern] of ROLE_PATTERNS) {
    if (pattern.test(role)) return category;
  }
  return "other";
}
