// ── Module 10B.3 Phase 1: India-first region relevance ──
//
// OfferLyst is India-first: a source that publishes a hiring-eligibility
// restriction should not have postings imported that explicitly exclude
// India. This is deliberately NOT "India-only" — a worldwide/unrestricted
// remote role from a foreign company is genuinely reachable by an Indian
// candidate and must stay eligible. Only a posting that names a SPECIFIC
// non-India restriction is excluded.
//
// This module is source-agnostic on purpose: it knows nothing about We Work
// Remotely or any other platform. A platform adapter that has a real
// eligibility-restriction signal (today: only WeWorkRemotelyAdapter) computes
// a `RegionRelevance` from ITS OWN raw fields and attaches it to the
// `ParsedJobPosting` it returns. Every other adapter leaves the field unset,
// and `isRegionRelevant` treats "no signal" as "no restriction" — allow. That
// is what keeps this generic: the gate that reads this value never needs a
// platform check, and a future open/global source can plug into the exact
// same field the moment it has a comparable restriction signal to classify.

/**
 * - `india` — explicitly includes India in a stated eligibility restriction.
 * - `worldwide` — the source explicitly says open to anywhere.
 * - `unrestricted` — no eligibility restriction was stated at all.
 * - `restricted_non_india` — explicitly restricted to one or more countries,
 *   none of which is India.
 */
export type RegionRelevanceClassification =
  "india" | "worldwide" | "unrestricted" | "restricted_non_india";

export type RegionRelevance = {
  classification: RegionRelevanceClassification;
  /** The restriction as the source stated it, verbatim. Set only for `restricted_non_india`. */
  restrictedTo: string | null;
};

/** Whether a posting with this relevance should be allowed through the pipeline. */
export function isRegionRelevant(relevance: RegionRelevance): boolean {
  return relevance.classification !== "restricted_non_india";
}

/** Operator-facing reason for a `restricted_non_india` exclusion. */
export function regionExclusionReason(relevance: RegionRelevance): string {
  return `Explicitly restricted to ${relevance.restrictedTo ?? "a region that excludes India"}.`;
}
