import { resolveDuplicate, type DedupCandidate } from "./dedup/DeduplicationEngine";
import { normalizeParsedJob } from "./normalize";
import type { CrawlTarget, PlatformAdapter } from "./adapters/types";
import type { JobIntelligenceStore } from "./store/JobIntelligenceStore";
import type { NormalizedJobPosting } from "./types";

// ── Module 10A: admin-only manual crawl framework ──
//
//   Run Platform Crawl → Import Jobs → Normalize → Deduplicate → Store
//
// This is the ONLY orchestration entry point for ingestion. No scheduling,
// no cron, no browser-extension involvement, no user-triggered path — the
// caller (see src/server-functions/jobIntelligence.ts) must have already
// passed `requireAdmin`. Adding a new platform means implementing one
// `PlatformAdapter` (crawler + parser) and calling `runPlatformCrawl` with
// it — nothing here changes.

export type CrawlRunOutcome = {
  // Deliberately NOT the full RawJobPayload — its `json` field is `unknown`
  // (platform-specific) and this type crosses the createServerFn boundary
  // (see src/server-functions/jobIntelligence.ts), which requires every
  // returned field to be staticly known-serializable. A summary is also all
  // a caller actually needs to interpret one outcome.
  platform: string;
  sourceUrl: string;
  status: "imported" | "updated" | "merged" | "parse_failed" | "store_failed";
  jobId?: string;
  dedupTier?: "external_id" | "fingerprint" | "cross_platform" | "none";
  reason?: string;
};

export type CrawlRunResult = {
  platform: string;
  target: CrawlTarget;
  total: number;
  imported: number;
  updated: number;
  merged: number;
  failed: number;
  outcomes: CrawlRunOutcome[];
};

function toDedupCandidateQuery(job: NormalizedJobPosting) {
  return {
    source: job.source,
    sourceJobId: job.sourceJobId ?? null,
    fingerprint: job.fingerprint,
    normalizedCompany: job.normalizedCompany,
    normalizedRole: job.normalizedRole,
  };
}

/** Runs the full pipeline for one adapter against one target, against a given store. */
export async function runPlatformCrawl(
  adapter: PlatformAdapter,
  target: CrawlTarget,
  store: JobIntelligenceStore,
): Promise<CrawlRunResult> {
  const raws = await adapter.crawler.fetchRawPostings(target);

  const outcomes: CrawlRunOutcome[] = [];
  let imported = 0;
  let updated = 0;
  let merged = 0;
  let failed = 0;

  for (const raw of raws) {
    const summary = { platform: raw.platform, sourceUrl: raw.sourceUrl };
    const parsed = adapter.parser.parse(raw);
    if (!parsed.ok) {
      failed++;
      outcomes.push({ ...summary, status: "parse_failed", reason: parsed.reason });
      continue;
    }

    let normalized: NormalizedJobPosting;
    try {
      normalized = await normalizeParsedJob(parsed.job);
    } catch (err) {
      failed++;
      outcomes.push({
        ...summary,
        status: "parse_failed",
        reason: err instanceof Error ? err.message : "Normalization failed.",
      });
      continue;
    }

    try {
      const candidates: DedupCandidate[] = await store.findDedupCandidates(
        toDedupCandidateQuery(normalized),
      );
      const decision = resolveDuplicate(
        {
          source: normalized.source,
          sourceJobId: normalized.sourceJobId ?? null,
          fingerprint: normalized.fingerprint,
          normalizedCompany: normalized.normalizedCompany,
          normalizedRole: normalized.normalizedRole,
          normalizedLocation: normalized.normalizedLocation,
          workMode: normalized.workMode ?? null,
          employmentType: normalized.employmentType ?? null,
          postedAt: normalized.postedAt ?? null,
          salaryMin: normalized.salaryMin ?? null,
          salaryMax: normalized.salaryMax ?? null,
        },
        candidates,
      );

      const matchId = decision.tier === "none" ? null : decision.matchId;
      const result = await store.upsertCanonicalJob(normalized, matchId);

      const status = result.created
        ? "imported"
        : decision.tier === "cross_platform"
          ? "merged"
          : "updated";
      if (status === "imported") imported++;
      else if (status === "merged") merged++;
      else updated++;

      outcomes.push({ ...summary, status, jobId: result.jobId, dedupTier: decision.tier });
    } catch (err) {
      failed++;
      outcomes.push({
        ...summary,
        status: "store_failed",
        reason: err instanceof Error ? err.message : "Store write failed.",
      });
    }
  }

  return {
    platform: adapter.platform,
    target,
    total: raws.length,
    imported,
    updated,
    merged,
    failed,
    outcomes,
  };
}
