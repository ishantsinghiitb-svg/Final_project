import type { SalaryPeriod } from "../types";

/**
 * URL/id helpers shared by `UnstopParser`, `UnstopListingParser` and the
 * manual-URL importer — so every entry point derives the SAME `sourceJobId`
 * and canonical `sourceUrl` for a posting and different URL forms collapse to
 * one deduplicated Global Job.
 *
 * Unstop's four page shapes:
 *   • Job listing        `https://unstop.com/job` (and `/job/<seo-slug>`)
 *   • Internship listing `https://unstop.com/internship` (and `/internship/<seo-slug>`)
 *   • Job detail         `https://unstop.com/jobs/<slug>-<id>`
 *   • Internship detail  `https://unstop.com/internships/<slug>-<id>`
 *
 * The opportunity id is the trailing numeric segment of a DETAIL slug
 * (`…-1714496`), identical across the JSON-LD `url`, the `<link rel=canonical>`
 * and the listing card's `href` — so all of them canonicalize to the same
 * `https://unstop.com/(jobs|internships)/<slug>-<id>`.
 *
 * NOTE the singular/plural split that separates listing from detail:
 * `/job` & `/internship` are LISTING routes; `/jobs/…` & `/internships/…` are
 * DETAIL routes. The regexes below encode exactly that.
 */

const DETAIL_PATH = /^\/(jobs|internships)\/[^/]+/i;
const LISTING_PATH = /^\/(job|internship)(?:\/|$)/i;

function pathnameOf(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}

/** True for a single-opportunity detail page (`/jobs/…` or `/internships/…`). */
export function isUnstopDetailUrl(url: string): boolean {
  return DETAIL_PATH.test(pathnameOf(url));
}

/** True for a listing/search page (`/job…` or `/internship…`, singular). */
export function isUnstopListingUrl(url: string): boolean {
  return LISTING_PATH.test(pathnameOf(url));
}

/**
 * True when the URL names an INTERNSHIP (detail `/internships/…` or listing
 * `/internship…`). Used to stamp `employmentType = "Internship"`, which the
 * JSON-LD's generic `PART_TIME`/`FULL_TIME` tag doesn't convey.
 */
export function isUnstopInternshipUrl(url: string): boolean {
  return /^\/internships?(?:\/|$)/i.test(pathnameOf(url));
}

/** The trailing numeric opportunity id of a detail slug (`…-1714496` → `1714496`). */
export function extractUnstopJobId(url: string): string | null {
  const path = pathnameOf(url).replace(/\/+$/, "");
  const lastSegment = path.split("/").pop() ?? "";
  const match = /-(\d+)$/.exec(lastSegment);
  return match ? match[1] : null;
}

/** Canonical, id-bearing detail URL so listing card and detail page dedupe to one row. */
export function buildUnstopCanonicalUrl(url: string, jobId: string): string {
  const internship = isUnstopInternshipUrl(url);
  const segment = internship ? "internships" : "jobs";
  // Preserve the human slug when present (it's the real canonical); otherwise
  // fall back to an id-only path that still resolves to the same opportunity.
  const path = pathnameOf(url).replace(/\/+$/, "");
  const lastSegment = path.split("/").pop() ?? "";
  if (isUnstopDetailUrl(url) && lastSegment.endsWith(`-${jobId}`)) {
    return `https://unstop.com/${segment}/${lastSegment}`;
  }
  return `https://unstop.com/${segment}/${jobId}`;
}

/** schema.org `MonetaryAmount.value.unitText` → `UniversalJob.salaryPeriod`. */
export const UNSTOP_SALARY_UNIT_MAP: Record<string, SalaryPeriod> = {
  HOUR: "Hourly",
  DAY: "Daily",
  WEEK: "Weekly",
  MONTH: "Monthly",
  YEAR: "Yearly",
};
