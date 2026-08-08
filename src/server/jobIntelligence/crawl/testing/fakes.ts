// ── Module 10B.1: in-memory fakes for the orchestrator's collaborators ──
//
// Mirrors the `InMemoryStore` shape Module 10A's CrawlRunner.test.ts already
// established, extended with the registry and report stores this module adds.
// Everything inside the pipeline (parse → validate → normalize → dedup) runs
// for real against these; only the network and the database are faked.

import type { DedupCandidate } from "../../dedup/DeduplicationEngine";
import type { NormalizedJobPosting } from "../../types";
import type {
  DedupCandidateQuery,
  JobIntelligenceStore,
  UpsertOutcome,
} from "../../store/JobIntelligenceStore";
import type {
  CompanyRegistryEntry,
  CompanyRegistryStore,
  RegistryCrawlResult,
} from "../registry/CompanyRegistry";
import type { CrawlReportStore, StartRunInput } from "../report/CrawlReportStore";
import type { CrawlReport } from "../report/CrawlReport";
import type {
  SourceVerificationStore,
  StartVerificationRunInput,
} from "../verify/SourceVerificationStore";
import type { SourceHealthReport } from "../verify/SourceHealthService";
import type { SourceVerification } from "../verify/SourceVerifier";
import type { CrawlRunRow, SourceVerificationRunRow } from "@/types/database";

export class InMemoryJobStore implements JobIntelligenceStore {
  rows: DedupCandidate[] = [];
  writes: NormalizedJobPosting[] = [];
  private counter = 0;

  async findDedupCandidates(query: DedupCandidateQuery): Promise<DedupCandidate[]> {
    return this.rows.filter(
      (row) =>
        (Boolean(query.sourceJobId) &&
          row.source === query.source &&
          row.sourceJobId === query.sourceJobId) ||
        row.fingerprint === query.fingerprint ||
        (row.normalizedCompany === query.normalizedCompany &&
          row.normalizedRole === query.normalizedRole),
    );
  }

  async upsertCanonicalJob(
    job: NormalizedJobPosting,
    matchId: string | null,
  ): Promise<UpsertOutcome> {
    this.writes.push(job);
    if (matchId) {
      const existing = this.rows.find((row) => row.id === matchId);
      if (existing) return { jobId: existing.id, created: false };
    }
    const id = `job-${++this.counter}`;
    this.rows.push({
      id,
      source: job.source,
      sourceJobId: job.sourceJobId ?? null,
      fingerprint: job.fingerprint,
      normalizedCompany: job.normalizedCompany,
      normalizedRole: job.normalizedRole,
      normalizedLocation: job.normalizedLocation,
    });
    return { jobId: id, created: true };
  }
}

/** A store whose writes always fail — for the `store_failed` counter path. */
export class FailingJobStore implements JobIntelligenceStore {
  async findDedupCandidates(): Promise<DedupCandidate[]> {
    return [];
  }
  async upsertCanonicalJob(): Promise<UpsertOutcome> {
    throw new Error("database unavailable");
  }
}

export function registryEntry(overrides: Partial<CompanyRegistryEntry> = {}): CompanyRegistryEntry {
  return {
    id: "entry-1",
    companyName: "Acme",
    careersUrl: "https://boards.greenhouse.io/acme",
    platform: "career-pages",
    enabled: true,
    crawlFrequencyHours: 24,
    lastCrawlAt: null,
    lastSuccessAt: null,
    lastStatus: null,
    lastError: null,
    lastJobsImported: null,
    notes: null,
    config: {},
    // ── Module 10B.1.5 identity + health ──
    parentCompany: null,
    aliases: [],
    healthStatus: null,
    lastCheckedAt: null,
    lastHealthSuccessAt: null,
    lastFailureAt: null,
    httpStatus: null,
    detectedPlatform: null,
    errorReason: null,
    resolvedUrl: null,
    postingsSeen: null,
    ...overrides,
  };
}

export class InMemoryRegistryStore implements CompanyRegistryStore {
  readonly results: Array<{ entryId: string; result: RegistryCrawlResult }> = [];
  readonly verifications: Array<{ entryId: string; verification: SourceVerification }> = [];

  constructor(private entries: CompanyRegistryEntry[] = []) {}

  async listEntries(platform?: string): Promise<CompanyRegistryEntry[]> {
    return this.entries.filter(
      (entry) => entry.enabled && (!platform || entry.platform === platform),
    );
  }

  async listAllEntries(): Promise<CompanyRegistryEntry[]> {
    return [...this.entries];
  }

  async markCrawlResult(entryId: string, result: RegistryCrawlResult): Promise<void> {
    this.results.push({ entryId, result });
  }

  async markVerification(entryId: string, verification: SourceVerification): Promise<void> {
    this.verifications.push({ entryId, verification });
    const entry = this.entries.find((candidate) => candidate.id === entryId);
    if (entry) {
      entry.healthStatus = verification.health;
      entry.lastCheckedAt = verification.checkedAt;
      entry.detectedPlatform = verification.detectedPlatform;
    }
  }
}

/** A registry whose listing throws — for the run-level failure path. */
export class BrokenRegistryStore implements CompanyRegistryStore {
  async listEntries(): Promise<CompanyRegistryEntry[]> {
    throw new Error("registry unreachable");
  }
  async listAllEntries(): Promise<CompanyRegistryEntry[]> {
    throw new Error("registry unreachable");
  }
  async markCrawlResult(): Promise<void> {}
  async markVerification(): Promise<void> {}
}

/** Records verification runs in memory. */
export class InMemoryVerificationStore implements SourceVerificationStore {
  started: StartVerificationRunInput[] = [];
  finished: Array<{ runId: string | null; report: SourceHealthReport }> = [];
  failed: Array<{ runId: string | null; error: string }> = [];

  async startRun(input: StartVerificationRunInput): Promise<string | null> {
    this.started.push(input);
    return `verify-${this.started.length}`;
  }
  async finishRun(runId: string | null, report: SourceHealthReport): Promise<void> {
    this.finished.push({ runId, report });
  }
  async failRun(runId: string | null, error: string): Promise<void> {
    this.failed.push({ runId, error });
  }
  async listRecentRuns(): Promise<SourceVerificationRunRow[]> {
    return [];
  }
}

export class InMemoryReportStore implements CrawlReportStore {
  started: StartRunInput[] = [];
  finished: Array<{ runId: string | null; report: CrawlReport }> = [];
  failed: Array<{ runId: string | null; error: string }> = [];

  async startRun(input: StartRunInput): Promise<string | null> {
    this.started.push(input);
    return `run-${this.started.length}`;
  }
  async finishRun(runId: string | null, report: CrawlReport): Promise<void> {
    this.finished.push({ runId, report });
  }
  async failRun(runId: string | null, error: string): Promise<void> {
    this.failed.push({ runId, error });
  }
  async listRecentRuns(): Promise<CrawlRunRow[]> {
    return [];
  }
  async getRun(): Promise<CrawlRunRow | null> {
    return null;
  }
}
