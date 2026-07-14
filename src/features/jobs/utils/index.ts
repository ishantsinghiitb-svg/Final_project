import type { GlobalJob } from "@/types";

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

/** Format a salary range into a human-readable string. */
export function formatSalary(job: GlobalJob): string {
  if (!job.salary_min && !job.salary_max) return "";
  const currency = job.salary_currency ?? "USD";
  const fmt = (n: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
      notation: "compact",
    }).format(n);
  if (job.salary_min && job.salary_max)
    return `${fmt(job.salary_min)}–${fmt(job.salary_max)}`;
  if (job.salary_min) return `${fmt(job.salary_min)}+`;
  return `Up to ${fmt(job.salary_max!)}`;
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
