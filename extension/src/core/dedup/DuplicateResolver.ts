import { FingerprintGenerator } from "../fingerprint/FingerprintGenerator";
import type { UniversalJob } from "../parsers/types";

export type JobIdentity = {
  source: string;
  /** Primary key — the source's stable external id (spec `externalID`), when present. */
  externalId: string | null;
  /** Deterministic fallback hash of company + title + location. */
  fingerprint: string | null;
};

/**
 * Reusable duplicate-detection layer, shared by extension capture and manual
 * URL import. This class computes the identity keys tiers 1–2 resolve
 * against, plus the client-side cache key the content pipeline reuses —
 * centralizing it here means every current and future source dedupes the
 * same way instead of re-deriving keys inline.
 *
 * The authoritative write-time resolution — including a third,
 * cross-platform tier — lives entirely in the `upsert_global_job` RPC (the
 * single write path), in priority order:
 *
 *   1. (source, externalID)  — exact, whenever the board exposes a stable id
 *   2. fingerprint           — company + title + location hash
 *   3. cross-platform similarity — same real-world opening on a different
 *      board (see `find_cross_platform_match` in
 *      supabase/migrations/20260722000001_module4a_hierarchical_dedup.sql):
 *      company + role + location normalized-equal (location required and
 *      never fuzzy — different cities never merge), work_mode/employment_type
 *      agreeing where both are known, plus at least one more corroborating
 *      signal (posted date within ±2 days, or an overlapping salary range) to
 *      cross a ≥90% confidence bar. Conservative by design — identity fields
 *      alone are never enough to merge.
 *
 * Tier 3 needs no client-side representation: it's resolved entirely inside
 * the RPC from the same payload tiers 1–2 already send, so this class's
 * public shape (`resolve` / `identify` / `dedupKey`) didn't change to support
 * it, and won't need to change for a future fuzzy/embedding-based tier 3
 * either — only `find_cross_platform_match`'s body would.
 */
export class DuplicateResolver {
  /**
   * Always computes the fingerprint fallback key, even when an external id is
   * already present.
   *
   * This used to short-circuit when `sourceJobId` was set (no wasted hashing),
   * but that let a real capture and a manual import of the SAME job identity
   * create two rows whenever only one side had an extractable external id: the
   * side with an id would never get a fingerprint, so if the other side's
   * write landed first under a fingerprint-only row, the id-carrying write's
   * fallback lookup (`fingerprint IS NOT NULL`) had nothing to match — see
   * `upsert_global_job`, which resolves by (source, source_job_id) first and
   * ONLY falls back to fingerprint when that first lookup misses. Populating
   * both keys on every write means whichever key the two rows share (id or
   * fingerprint) is enough for `upsert_global_job` to find the same row,
   * regardless of write order between the extension and manual import.
   */
  static async resolve(job: UniversalJob): Promise<UniversalJob> {
    const fingerprint = await FingerprintGenerator.generate(
      job.title,
      job.companyName,
      job.location,
    );
    return { ...job, fingerprint };
  }

  /** The identity keys a (resolved) job carries, in priority order. */
  static identify(job: UniversalJob): JobIdentity {
    return {
      source: job.source,
      externalId: job.sourceJobId,
      fingerprint: job.fingerprint,
    };
  }

  /**
   * Stable in-memory key for the content pipeline's "did I just sync this exact
   * posting?" cache. Prefers external id, then fingerprint, then a normalized
   * company|title|location tuple (same normalization as `FingerprintGenerator`).
   */
  static dedupKey(job: UniversalJob): string {
    if (job.sourceJobId) return `${job.source}:id:${job.sourceJobId}`;
    if (job.fingerprint) return `${job.source}:fp:${job.fingerprint}`;
    return `${job.source}:k:${this.normalizedTuple(job)}`;
  }

  private static normalizedTuple(job: UniversalJob): string {
    return [job.title, job.companyName, job.location ?? ""]
      .map((part) => part.trim().toLowerCase().replace(/\s+/g, " "))
      .join("|");
  }
}
