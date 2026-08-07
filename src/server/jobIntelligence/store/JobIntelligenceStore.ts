import type { DedupCandidate } from "../dedup/DeduplicationEngine";
import type { NormalizedJobPosting } from "../types";

export type DedupCandidateQuery = {
  source: string;
  sourceJobId?: string | null;
  fingerprint: string;
  normalizedCompany: string;
  normalizedRole: string;
};

export type UpsertOutcome = {
  jobId: string;
  /** True when this write created a brand-new `global_jobs` row rather than updating/merging into an existing one. */
  created: boolean;
};

/**
 * The Database stage's contract — deliberately narrow (just what CrawlRunner
 * needs) so it can be backed by the real Supabase-writing implementation in
 * production and by a trivial in-memory fake in tests, the same "fake at the
 * boundary" pattern src/server/ai/testing/fakeSupabase.ts already uses for
 * the AI engine.
 */
export interface JobIntelligenceStore {
  /**
   * Returns a small, pre-filtered candidate pool for the dedup engine to
   * choose among: any row matching (source, sourceJobId), any row matching
   * the fingerprint, and any row sharing the normalized company + role
   * (the tier-3 candidate pool). Never the whole table.
   */
  findDedupCandidates(query: DedupCandidateQuery): Promise<DedupCandidate[]>;

  /**
   * Writes (or merges into) the canonical `global_jobs` row for a normalized
   * posting, resolves/creates its `companies` row, links skills, and records
   * this platform's contribution in `job_sources`. `matchId`, when given, is
   * the id `resolveDuplicate` already chose — the store still re-resolves
   * identity itself (the DB is authoritative; `matchId` is an optimization/
   * cross-check, not trusted blindly).
   */
  upsertCanonicalJob(job: NormalizedJobPosting, matchId: string | null): Promise<UpsertOutcome>;
}
