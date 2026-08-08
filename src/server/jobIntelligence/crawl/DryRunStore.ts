// ── Module 10B.1: Dry Run ──
//
// "Dry Run performs the full pipeline except database writes."
//
// The safest way to guarantee that is to make the DRY RUN a `JobIntelligenceStore`
// decorator rather than a flag threaded through the pipeline: every stage —
// crawl, parse, validate, normalize, dedup — runs the identical code path, and
// the single method that would mutate `global_jobs` is the only thing swapped.
// There is no `if (dryRun)` anywhere in the pipeline to get out of sync.
//
// Reads are deliberately still REAL: `findDedupCandidates` hits the live
// database, so a dry run reports accurate duplicate/new counts against the
// data that actually exists. Only `upsertCanonicalJob` is suppressed.

import type { NormalizedJobPosting } from "../types";
import type { DedupCandidate } from "../dedup/DeduplicationEngine";
import type {
  DedupCandidateQuery,
  JobIntelligenceStore,
  UpsertOutcome,
} from "../store/JobIntelligenceStore";

/** A write that WOULD have happened, recorded for the report. */
export type SuppressedWrite = {
  source: string;
  sourceJobId: string | null;
  companyName: string;
  role: string;
  /** What the write would have been, per the dedup decision handed to the store. */
  wouldCreate: boolean;
};

export class DryRunJobIntelligenceStore implements JobIntelligenceStore {
  readonly suppressedWrites: SuppressedWrite[] = [];

  constructor(private readonly inner: JobIntelligenceStore) {}

  /** Real read — a dry run must judge duplicates against the real database. */
  findDedupCandidates(query: DedupCandidateQuery): Promise<DedupCandidate[]> {
    return this.inner.findDedupCandidates(query);
  }

  async upsertCanonicalJob(
    job: NormalizedJobPosting,
    matchId: string | null,
  ): Promise<UpsertOutcome> {
    const wouldCreate = matchId === null;
    this.suppressedWrites.push({
      source: job.source,
      sourceJobId: job.sourceJobId ?? null,
      companyName: job.companyName,
      role: job.role,
      wouldCreate,
    });

    // A synthetic id keeps the caller's shape honest without inventing a
    // plausible-looking uuid that could be mistaken for a real row.
    return {
      jobId: matchId ?? `dry-run:${job.source}:${job.sourceJobId ?? job.fingerprint}`,
      created: wouldCreate,
    };
  }
}
