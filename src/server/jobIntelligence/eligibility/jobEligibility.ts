// ── The single catalog-eligibility gate ──
//
// Every adapter's output passes through this before it can reach
// `admin_upsert_global_job`, so "what belongs in the OfferLyst catalog" is
// answered in exactly one place instead of per platform. Two rules today:
//
//   1. the job's own location must be in India   (./indiaLocation.ts)
//   2. its posted date must be within 30 days    (./freshness.ts)
//
// Both are reject-by-default: no location evidence and no posted date are
// rejections, not passes. Order matters only for the reason text — location is
// checked first because it is the cheaper, more common rejection.

import type { ParsedJobPosting } from "../types";
import { isIndiaJobLocation } from "./indiaLocation";
import { isFreshJob, MAX_JOB_AGE_DAYS } from "./freshness";

export type EligibilityRejection = {
  eligible: false;
  /** Which rule rejected it — drives the crawl report's per-reason counters. */
  kind: "location" | "freshness";
  reason: string;
};

export type EligibilityDecision = { eligible: true; ageDays: number } | EligibilityRejection;

export type EligibilityOptions = {
  now?: Date;
  maxAgeDays?: number;
};

/**
 * Whether a parsed posting belongs in the catalog.
 *
 * Reads only the posting's OWN fields — never the employer's headquarters,
 * never the registry entry's country. A Bengaluru-headquartered company
 * posting a London role is a London role.
 */
export function checkJobEligibility(
  job: Pick<
    ParsedJobPosting,
    "location" | "city" | "state" | "country" | "postedAt" | "tags" | "role"
  >,
  options: EligibilityOptions = {},
): EligibilityDecision {
  const now = options.now ?? new Date();
  const maxAgeDays = options.maxAgeDays ?? MAX_JOB_AGE_DAYS;

  const location = isIndiaJobLocation({
    location: job.location,
    city: job.city,
    state: job.state,
    country: job.country,
    // Secondary/extra locations live in `tags` for the adapters that have them
    // (Ashby's secondaryLocations, Greenhouse's offices), so a role listed in
    // "San Francisco" with an India office tag is still judged on all of it —
    // and, per the two-sided rule, rejected for naming both.
    extras: job.tags ?? null,
  });
  if (!location.eligible) {
    return { eligible: false, kind: "location", reason: location.reason };
  }

  const freshness = isFreshJob(job.postedAt, now, maxAgeDays);
  if (!freshness.fresh) {
    return { eligible: false, kind: "freshness", reason: freshness.reason };
  }

  return { eligible: true, ageDays: freshness.ageDays };
}
