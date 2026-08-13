// ── Module 11A: domain-based logo fallback ──
//
// Priority order for a company's canonical logo (product requirement):
//   1. A logo already captured from a scraped job posting — handled entirely
//      in SQL (see the 20260821000001 migration's `companies` upsert:
//      first-known-wins via COALESCE). Nothing in this file runs for a
//      company that already has one.
//   2. THIS module — a domain-based fallback for companies that have a known
//      website domain but no logo yet.
//   3/4. The existing `CompanyMark` UI component's img→initials fallback
//      (src/components/dashboard/primitives.tsx) — already built, untouched.
//
// Uses Google's public, unauthenticated favicon-by-domain endpoint
// (`www.google.com/s2/favicons`). No API key, no paid tier, backed by
// Google's own infrastructure. It fetches the DOMAIN'S OWN favicon — it is
// not an image search and never returns an unrelated company's mark; the
// worst case is a generic/low-resolution icon, handled by
// `isLikelyMissingFavicon` below plus the UI's existing initials fallback.
//
// Deliberately NOT called from crawl ingestion (see CrawlRunner/adapters,
// which this module never imports) — logo enrichment is a separate,
// on-demand concern (see scripts/resolveCompanyLogos.ts) so a slow/unreachable
// favicon fetch can never affect crawl latency or success.

const GOOGLE_FAVICON_ENDPOINT = "https://www.google.com/s2/favicons";

/** Default request size — large enough to look good in the ~32-48px UI slots CompanyMark renders at. */
export const DEFAULT_FAVICON_SIZE = 128;

/**
 * Builds the Google favicon-by-domain URL for a company's website domain.
 * Pure/deterministic — never throws. Returns null for empty input.
 */
export function googleFaviconUrl(
  domain: string | null | undefined,
  size = DEFAULT_FAVICON_SIZE,
): string | null {
  const cleaned = (domain ?? "").trim().toLowerCase();
  if (!cleaned) return null;
  const params = new URLSearchParams({ sz: String(size), domain: cleaned });
  return `${GOOGLE_FAVICON_ENDPOINT}?${params.toString()}`;
}

/**
 * Google's favicon endpoint always returns SOME image (a generic globe
 * placeholder when the domain has no real favicon) rather than a 404, so a
 * failed fetch can't be detected by status code alone. It DOES return a
 * distinctively tiny response for the generic placeholder — this is a
 * best-effort byte-size heuristic, not a guarantee. Callers that want a
 * strict guarantee should treat this as advisory only: worst case, a
 * generic globe icon is stored, which `CompanyMark` renders fine (it is a
 * real, if unhelpful, image) and a human can replace later. Never treated as
 * an error — logo enrichment is best-effort by design.
 */
export function isLikelyPlaceholderFavicon(byteLength: number): boolean {
  return byteLength > 0 && byteLength < 200;
}
