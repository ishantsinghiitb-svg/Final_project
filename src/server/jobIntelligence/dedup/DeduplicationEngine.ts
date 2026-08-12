// ── Module 10A: Deduplication engine ──
//
// Pure TS mirror of the SQL tiered-dedup rules `find_cross_platform_match` +
// `upsert_global_job` implement (see
// supabase/migrations/20260722000001_module4a_hierarchical_dedup.sql) — same
// tiers, same thresholds, same conservative "false positives are worse than
// duplicates" posture. This module makes that decision testable without a
// database and reusable by the crawl framework to report what happened
// (imported / updated / merged-cross-platform) — but the actual write still
// goes through the DB (SQL is authoritative for what's persisted; this must
// stay behaviorally identical to it, the same idiom as fingerprint.ts /
// external-id.ts / source-detection.ts already use elsewhere in this repo).
//
// Resolution priority:
//   1. (source, sourceJobId) — exact
//   2. fingerprint — exact
//   3. cross-platform similarity — company + role + location must ALL match
//      (post-normalization); work_mode/employment_type are hard gates when
//      present on both sides; base score 80, +10 for posted_at within ±2
//      days, +10 for overlapping salary range; merges only at score ≥ 90.

export type DedupCandidate = {
  id: string;
  source: string;
  sourceJobId: string | null;
  fingerprint: string | null;
  normalizedCompany: string;
  normalizedRole: string;
  normalizedLocation: string | null;
  workMode?: string | null;
  employmentType?: string | null;
  postedAt?: string | null;
  salaryMin?: number | null;
  salaryMax?: number | null;
};

export type DedupIncoming = {
  source: string;
  sourceJobId?: string | null;
  fingerprint: string;
  normalizedCompany: string;
  normalizedRole: string;
  normalizedLocation: string | null;
  workMode?: string | null;
  employmentType?: string | null;
  postedAt?: string | null;
  salaryMin?: number | null;
  salaryMax?: number | null;
};

export type DedupResult =
  | { tier: "external_id"; matchId: string }
  | { tier: "fingerprint"; matchId: string }
  | { tier: "cross_platform"; matchId: string; confidence: number }
  | { tier: "none" };

const MERGE_THRESHOLD = 90;
const BASE_CROSS_PLATFORM_SCORE = 80;
const POSTED_AT_TOLERANCE_MS = 2 * 24 * 60 * 60 * 1000;

function salaryRangesOverlap(
  aMin?: number | null,
  aMax?: number | null,
  bMin?: number | null,
  bMax?: number | null,
): boolean {
  if (aMin == null || aMax == null || bMin == null || bMax == null) return false;
  return aMin <= bMax && bMin <= aMax;
}

function postedWithinTolerance(a?: string | null, b?: string | null): boolean {
  if (!a || !b) return false;
  const ta = Date.parse(a);
  const tb = Date.parse(b);
  if (Number.isNaN(ta) || Number.isNaN(tb)) return false;
  return Math.abs(ta - tb) <= POSTED_AT_TOLERANCE_MS;
}

/**
 * Scores one candidate against the incoming posting for tier-3 (cross-platform)
 * matching. Returns null if the candidate doesn't even pass the entry gates
 * (company/role/location all matching, no hard conflicts).
 */
function scoreCrossPlatformCandidate(
  incoming: DedupIncoming,
  candidate: DedupCandidate,
): number | null {
  if (
    candidate.normalizedCompany !== incoming.normalizedCompany ||
    candidate.normalizedRole !== incoming.normalizedRole ||
    candidate.normalizedLocation !== incoming.normalizedLocation
  ) {
    return null;
  }

  if (
    incoming.workMode != null &&
    candidate.workMode != null &&
    incoming.workMode !== candidate.workMode
  ) {
    return null;
  }
  if (
    incoming.employmentType != null &&
    candidate.employmentType != null &&
    incoming.employmentType !== candidate.employmentType
  ) {
    return null;
  }

  let score = BASE_CROSS_PLATFORM_SCORE;
  if (postedWithinTolerance(incoming.postedAt, candidate.postedAt)) score += 10;
  if (
    salaryRangesOverlap(
      incoming.salaryMin,
      incoming.salaryMax,
      candidate.salaryMin,
      candidate.salaryMax,
    )
  ) {
    score += 10;
  }
  return score;
}

/**
 * Resolves an incoming normalized posting against a pool of candidate
 * `global_jobs` rows, returning which (if any) it should merge into and at
 * which tier. `candidates` is expected to already be a reasonably narrow
 * pool (e.g. rows sharing source+sourceJobId, fingerprint, or normalized
 * company+role) — this function does not itself query anything.
 */
export function resolveDuplicate(
  incoming: DedupIncoming,
  candidates: DedupCandidate[],
): DedupResult {
  if (incoming.sourceJobId) {
    const exact = candidates.find(
      (c) => c.source === incoming.source && c.sourceJobId === incoming.sourceJobId,
    );
    if (exact) return { tier: "external_id", matchId: exact.id };
  }

  // Module 10B.3: a candidate from the SAME source carrying its OWN
  // distinct, non-null source_job_id is a confirmed-different posting — the
  // source itself has already told us these are two different requisitions
  // (e.g. two open Greenhouse reqs with an identical title/location). That
  // fact overrides both the fingerprint tier and the cross-platform tier,
  // which exist only for cases where no reliable per-source id is
  // available. Mirrors the guard in admin_upsert_global_job (the actual
  // write path this function's decision is reported alongside) — see
  // supabase/migrations/20260819000001_module10b3_dedup_source_id_guard.sql.
  // Never excludes anything a genuine tier-1 match above would have caught,
  // since that candidate's sourceJobId is by definition equal to incoming's.
  const safeCandidates = candidates.filter(
    (c) =>
      !(
        c.source === incoming.source &&
        c.sourceJobId != null &&
        incoming.sourceJobId != null &&
        c.sourceJobId !== incoming.sourceJobId
      ),
  );

  const byFingerprint = safeCandidates.find((c) => c.fingerprint === incoming.fingerprint);
  if (byFingerprint) return { tier: "fingerprint", matchId: byFingerprint.id };

  // Entry requirement mirrors the SQL: without a resolvable company, role,
  // AND location on the incoming payload, never attempt tier 3.
  if (!incoming.normalizedCompany || !incoming.normalizedRole || !incoming.normalizedLocation) {
    return { tier: "none" };
  }

  let bestId: string | null = null;
  let bestScore = 0;
  for (const candidate of safeCandidates) {
    const score = scoreCrossPlatformCandidate(incoming, candidate);
    if (score != null && score > bestScore) {
      bestScore = score;
      bestId = candidate.id;
    }
  }

  if (bestId && bestScore >= MERGE_THRESHOLD) {
    return { tier: "cross_platform", matchId: bestId, confidence: bestScore };
  }
  return { tier: "none" };
}
