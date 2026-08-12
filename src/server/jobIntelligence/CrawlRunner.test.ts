import { describe, expect, it } from "vitest";
import { runPlatformCrawl } from "./CrawlRunner";
import { resolveDuplicate, type DedupCandidate } from "./dedup/DeduplicationEngine";
import { normalizeCompanyName } from "./normalize/company";
import { normalizeRoleTitle } from "./normalize/role";
import { normalizeLocationText } from "./normalize/location";
import type { CrawlTarget, PlatformAdapter, PlatformCrawler } from "./adapters/types";
import type { JobParser, ParseOutcome, RawJobPayload } from "./parsers/types";
import type { NormalizedJobPosting } from "./types";
import type {
  DedupCandidateQuery,
  JobIntelligenceStore,
  UpsertOutcome,
} from "./store/JobIntelligenceStore";

// ── In-memory fake store — the same "fake at the boundary" shape as
// src/server/ai/testing/fakeSupabase.ts, scoped to what CrawlRunner needs.
class InMemoryStore implements JobIntelligenceStore {
  rows: DedupCandidate[] = [];
  private counter = 0;

  async findDedupCandidates(query: DedupCandidateQuery): Promise<DedupCandidate[]> {
    return this.rows.filter(
      (row) =>
        (query.sourceJobId &&
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
    if (matchId) {
      const existing = this.rows.find((r) => r.id === matchId);
      if (existing) {
        existing.fingerprint = job.fingerprint;
        existing.sourceJobId = existing.sourceJobId ?? job.sourceJobId ?? null;
        return { jobId: existing.id, created: false };
      }
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

/**
 * Module 10B.3 (part 2) regression coverage: `InMemoryStore` above never
 * enforces a unique-index-like constraint at all, which is exactly why the
 * fingerprint/source_job_id interaction bug reached production without a
 * failing test — the plain in-memory fake had no way to reject a write the
 * real database would reject. This store simulates the two REAL constraints
 * `admin_upsert_global_job` writes against:
 *
 *   global_jobs_source_job_id_key: UNIQUE (source, source_job_id)
 *     WHERE source_job_id IS NOT NULL                          — unchanged
 *   global_jobs_fingerprint_key:   UNIQUE (fingerprint)
 *     WHERE fingerprint IS NOT NULL [AND source_job_id IS NULL] — the fix
 *
 * `fingerprintScope: "global"` reproduces the OLD (buggy) index from
 * 20260716000001; `"source-scoped"` reproduces the NEW index from
 * 20260820000001_module10b3_fingerprint_uniqueness_source_scoped.sql. Both
 * modes share identical tier-1/2/3 resolution — only the constraint differs.
 */
class ConstraintAwareStore implements JobIntelligenceStore {
  rows: DedupCandidate[] = [];
  private counter = 0;

  constructor(private readonly fingerprintScope: "global" | "source-scoped") {}

  async findDedupCandidates(query: DedupCandidateQuery): Promise<DedupCandidate[]> {
    return this.rows.filter(
      (row) =>
        (query.sourceJobId &&
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
    if (matchId) {
      const existing = this.rows.find((r) => r.id === matchId);
      if (existing) {
        existing.fingerprint = job.fingerprint;
        existing.sourceJobId = existing.sourceJobId ?? job.sourceJobId ?? null;
        return { jobId: existing.id, created: false };
      }
    }

    if (job.sourceJobId != null) {
      const idClash = this.rows.some(
        (r) => r.source === job.source && r.sourceJobId === job.sourceJobId,
      );
      if (idClash) {
        throw new Error(
          'duplicate key value violates unique constraint "global_jobs_source_job_id_key"',
        );
      }
    }

    if (job.fingerprint != null) {
      const fingerprintClash =
        this.fingerprintScope === "global"
          ? this.rows.some((r) => r.fingerprint === job.fingerprint)
          : job.sourceJobId == null &&
            this.rows.some((r) => r.sourceJobId == null && r.fingerprint === job.fingerprint);
      if (fingerprintClash) {
        throw new Error(
          'duplicate key value violates unique constraint "global_jobs_fingerprint_key"',
        );
      }
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

function fakeAdapter(
  platform: string,
  raws: RawJobPayload[],
  parseOverride?: (raw: RawJobPayload) => ParseOutcome,
): PlatformAdapter {
  const crawler: PlatformCrawler = {
    platform,
    async fetchRawPostings(_target: CrawlTarget): Promise<RawJobPayload[]> {
      return raws;
    },
  };
  const parser: JobParser = {
    platform,
    version: "fake-1",
    parse(raw: RawJobPayload): ParseOutcome {
      if (parseOverride) return parseOverride(raw);
      const idx = raw.json as { sourceJobId?: string } | undefined;
      return {
        ok: true,
        job: {
          source: platform,
          sourceJobId: idx?.sourceJobId,
          companyName: "Google Careers",
          role: "Product Internship",
          location: "Bangalore, India",
          city: "Bangalore",
          parserVersion: "fake-1",
          sourceUrl: raw.sourceUrl,
        },
      };
    },
  };
  return { platform, crawler, parser };
}

const target: CrawlTarget = { kind: "query", query: "product intern" };

describe("runPlatformCrawl", () => {
  it("imports a brand-new posting", async () => {
    const store = new InMemoryStore();
    const adapter = fakeAdapter("greenhouse", [
      {
        platform: "greenhouse",
        sourceUrl: "https://example.test/1",
        fetchedAt: "now",
        json: { sourceJobId: "gh-1" },
      },
    ]);

    const result = await runPlatformCrawl(adapter, target, store);

    expect(result.total).toBe(1);
    expect(result.imported).toBe(1);
    expect(result.updated).toBe(0);
    expect(result.failed).toBe(0);
    expect(result.outcomes[0].status).toBe("imported");
  });

  it("updates (tier-1 external id) rather than duplicating a re-crawled posting", async () => {
    const store = new InMemoryStore();
    const adapter = fakeAdapter("greenhouse", [
      {
        platform: "greenhouse",
        sourceUrl: "https://example.test/1",
        fetchedAt: "now",
        json: { sourceJobId: "gh-1" },
      },
    ]);

    await runPlatformCrawl(adapter, target, store);
    const second = await runPlatformCrawl(adapter, target, store);

    expect(second.imported).toBe(0);
    expect(second.updated).toBe(1);
    expect(store.rows).toHaveLength(1);
  });

  it("reports a parse failure without throwing or aborting the rest of the batch", async () => {
    const store = new InMemoryStore();
    const raws: RawJobPayload[] = [
      { platform: "greenhouse", sourceUrl: "https://example.test/bad", fetchedAt: "now" },
      {
        platform: "greenhouse",
        sourceUrl: "https://example.test/good",
        fetchedAt: "now",
        json: { sourceJobId: "gh-2" },
      },
    ];
    let call = 0;
    const adapter = fakeAdapter("greenhouse", raws, (raw) => {
      call++;
      if (call === 1) return { ok: false, reason: "missing required field" };
      return {
        ok: true,
        job: {
          source: "greenhouse",
          sourceJobId: "gh-2",
          companyName: "Meta",
          role: "Backend Engineer",
          location: "Remote",
          parserVersion: "fake-1",
          sourceUrl: raw.sourceUrl,
        },
      };
    });

    const result = await runPlatformCrawl(adapter, target, store);

    expect(result.total).toBe(2);
    expect(result.failed).toBe(1);
    expect(result.imported).toBe(1);
    expect(result.outcomes[0].status).toBe("parse_failed");
    expect(result.outcomes[0].reason).toBe("missing required field");
  });

  it("reports a cross-platform merge when the dedup engine's tier-3 rule fires", async () => {
    const store = new InMemoryStore();
    const company = normalizeCompanyName("Google Careers").canonicalName;
    const role = normalizeRoleTitle("Product Internship").normalized;
    const location = normalizeLocationText("Bangalore");

    // Seed an existing LinkedIn-sourced row for the same opening.
    store.rows.push({
      id: "seed-1",
      source: "linkedin",
      sourceJobId: "li-9",
      fingerprint: "unrelated-fingerprint",
      normalizedCompany: company,
      normalizedRole: role,
      normalizedLocation: location,
      postedAt: "2026-08-01T00:00:00Z",
    });

    const adapter = fakeAdapter(
      "greenhouse",
      [
        {
          platform: "greenhouse",
          sourceUrl: "https://example.test/1",
          fetchedAt: "now",
          json: { sourceJobId: "gh-1" },
        },
      ],
      (raw) => ({
        ok: true,
        job: {
          source: "greenhouse",
          sourceJobId: "gh-1",
          companyName: "Google Careers",
          role: "Product Internship",
          location: "Bangalore, India",
          city: "Bangalore",
          postedAt: "2026-08-02T00:00:00Z",
          parserVersion: "fake-1",
          sourceUrl: raw.sourceUrl,
        },
      }),
    );

    const result = await runPlatformCrawl(adapter, target, store);

    expect(result.outcomes[0].status).toBe("merged");
    expect(result.outcomes[0].dedupTier).toBe("cross_platform");
    expect(result.outcomes[0].jobId).toBe("seed-1");
    expect(store.rows).toHaveLength(1);
  });

  it("Module 10B.3: two same-source postings with the same title/company/location but different source IDs become two canonical jobs", async () => {
    // The HighRadius production case: three genuinely different Greenhouse
    // reqs (here, two) for "Implementation Consultant" in the same location —
    // each must get its own canonical row and keep its own source_job_id,
    // not collapse onto one row via the fingerprint tier.
    const store = new InMemoryStore();
    const raws: RawJobPayload[] = [
      {
        platform: "greenhouse",
        sourceUrl: "https://example.test/req-1",
        fetchedAt: "now",
        json: { sourceJobId: "7701545003" },
      },
      {
        platform: "greenhouse",
        sourceUrl: "https://example.test/req-2",
        fetchedAt: "now",
        json: { sourceJobId: "7701540003" },
      },
    ];
    const adapter = fakeAdapter("greenhouse", raws, (raw) => {
      const idx = raw.json as { sourceJobId: string };
      return {
        ok: true,
        job: {
          source: "greenhouse",
          sourceJobId: idx.sourceJobId,
          companyName: "HighRadius",
          role: "Implementation Consultant",
          location: "Hyderabad, Telangana, India",
          city: "Hyderabad",
          parserVersion: "fake-1",
          sourceUrl: raw.sourceUrl,
        },
      };
    });

    const result = await runPlatformCrawl(adapter, target, store);

    expect(result.imported).toBe(2);
    expect(result.updated).toBe(0);
    expect(result.merged).toBe(0);
    expect(result.outcomes.every((o) => o.status === "imported")).toBe(true);

    // Two distinct canonical jobs, each retaining its own source_job_id.
    expect(store.rows).toHaveLength(2);
    const ids = store.rows.map((r) => r.sourceJobId).sort();
    expect(ids).toEqual(["7701540003", "7701545003"]);
    expect(new Set(store.rows.map((r) => r.id)).size).toBe(2);
  });

  it("Module 10B.3: re-crawling the SAME req id still updates in place (tier 1 unaffected)", async () => {
    const store = new InMemoryStore();
    const adapter = fakeAdapter("greenhouse", [
      {
        platform: "greenhouse",
        sourceUrl: "https://example.test/req-1",
        fetchedAt: "now",
        json: { sourceJobId: "7697979003" },
      },
    ]);

    const first = await runPlatformCrawl(adapter, target, store);
    const second = await runPlatformCrawl(adapter, target, store);

    expect(first.imported).toBe(1);
    expect(second.imported).toBe(0);
    expect(second.updated).toBe(1);
    expect(store.rows).toHaveLength(1);
  });

  it("a store failure is reported per-posting, not thrown", async () => {
    class FailingStore extends InMemoryStore {
      async upsertCanonicalJob(): Promise<UpsertOutcome> {
        throw new Error("write failed");
      }
    }
    const store = new FailingStore();
    const adapter = fakeAdapter("greenhouse", [
      {
        platform: "greenhouse",
        sourceUrl: "https://example.test/1",
        fetchedAt: "now",
        json: { sourceJobId: "gh-1" },
      },
    ]);

    const result = await runPlatformCrawl(adapter, target, store);
    expect(result.failed).toBe(1);
    expect(result.outcomes[0].status).toBe("store_failed");
  });
});

// ── Module 10B.3 (part 2): fingerprint uniqueness vs. the source-ID guard ──
// The production defect lived one layer below what `InMemoryStore` above can
// exercise: the TS dedup decision was correct, but the real INSERT was
// rejected by a legacy DB constraint no in-memory fake modeled. These tests
// use ConstraintAwareStore to reproduce that constraint (old vs. new
// semantics) so this class of bug has real regression coverage.
describe("runPlatformCrawl + fingerprint uniqueness constraint (Module 10B.3 part 2)", () => {
  function highRadiusRaws(): RawJobPayload[] {
    return [
      {
        platform: "greenhouse",
        sourceUrl: "https://example.test/req-1",
        fetchedAt: "now",
        json: { sourceJobId: "7701545003" },
      },
      {
        platform: "greenhouse",
        sourceUrl: "https://example.test/req-2",
        fetchedAt: "now",
        json: { sourceJobId: "7701540003" },
      },
      {
        platform: "greenhouse",
        sourceUrl: "https://example.test/req-3",
        fetchedAt: "now",
        json: { sourceJobId: "7697979003" },
      },
    ];
  }

  function highRadiusAdapter(raws: RawJobPayload[]): PlatformAdapter {
    return fakeAdapter("greenhouse", raws, (raw) => {
      const idx = raw.json as { sourceJobId: string };
      return {
        ok: true,
        job: {
          source: "greenhouse",
          sourceJobId: idx.sourceJobId,
          companyName: "HighRadius",
          role: "Implementation Consultant",
          location: "Hyderabad, Telangana, India",
          city: "Hyderabad",
          parserVersion: "fake-1",
          sourceUrl: raw.sourceUrl,
        },
      };
    });
  }

  it("BEFORE the fix (global fingerprint scope): reproduces the exact production bug — only the first req imports, the rest store_fail", async () => {
    const store = new ConstraintAwareStore("global");
    const adapter = highRadiusAdapter(highRadiusRaws());

    const result = await runPlatformCrawl(adapter, target, store);

    expect(result.imported).toBe(1);
    expect(result.failed).toBe(2);
    expect(result.outcomes.map((o) => o.status)).toEqual([
      "imported",
      "store_failed",
      "store_failed",
    ]);
    expect(store.rows).toHaveLength(1);
  });

  it("AFTER the fix (source-scoped fingerprint): all three genuinely distinct HighRadius reqs become three canonical jobs", async () => {
    const store = new ConstraintAwareStore("source-scoped");
    const adapter = highRadiusAdapter(highRadiusRaws());

    const result = await runPlatformCrawl(adapter, target, store);

    expect(result.imported).toBe(3);
    expect(result.failed).toBe(0);
    expect(result.outcomes.every((o) => o.status === "imported")).toBe(true);
    expect(store.rows).toHaveLength(3);
    const ids = store.rows.map((r) => r.sourceJobId).sort();
    expect(ids).toEqual(["7697979003", "7701540003", "7701545003"]);
    expect(new Set(store.rows.map((r) => r.id)).size).toBe(3);
  });

  it("same source + same source_job_id still re-observes the same canonical job under the fix (Case 1)", async () => {
    const store = new ConstraintAwareStore("source-scoped");
    const adapter = highRadiusAdapter([highRadiusRaws()[0]]);

    const first = await runPlatformCrawl(adapter, target, store);
    const second = await runPlatformCrawl(adapter, target, store);

    expect(first.imported).toBe(1);
    expect(second.imported).toBe(0);
    expect(second.updated).toBe(1);
    expect(second.failed).toBe(0);
    expect(store.rows).toHaveLength(1);
  });

  it("cross-source dedup still merges under the fix — no separate row, no constraint error (Case 3)", async () => {
    // Mirrors the existing "reports a cross-platform merge" scenario above,
    // just against ConstraintAwareStore, to prove the fixed (source-scoped)
    // fingerprint index does not interfere with legitimate cross-source
    // merges: different source, no source_job_id collision possible, so the
    // match (here, tier 3) must succeed exactly as it did before the fix.
    const store = new ConstraintAwareStore("source-scoped");
    const company = normalizeCompanyName("Google Careers").canonicalName;
    const role = normalizeRoleTitle("Product Internship").normalized;
    const location = normalizeLocationText("Bangalore");

    store.rows.push({
      id: "seed-1",
      source: "linkedin",
      sourceJobId: "li-9",
      fingerprint: "unrelated-fingerprint",
      normalizedCompany: company,
      normalizedRole: role,
      normalizedLocation: location,
      postedAt: "2026-08-01T00:00:00Z",
    });

    const adapter = fakeAdapter(
      "greenhouse",
      [
        {
          platform: "greenhouse",
          sourceUrl: "https://example.test/1",
          fetchedAt: "now",
          json: { sourceJobId: "gh-1" },
        },
      ],
      (raw) => ({
        ok: true,
        job: {
          source: "greenhouse",
          sourceJobId: "gh-1",
          companyName: "Google Careers",
          role: "Product Internship",
          location: "Bangalore, India",
          city: "Bangalore",
          postedAt: "2026-08-02T00:00:00Z",
          parserVersion: "fake-1",
          sourceUrl: raw.sourceUrl,
        },
      }),
    );

    const result = await runPlatformCrawl(adapter, target, store);

    expect(result.failed).toBe(0);
    expect(result.outcomes[0].status).toBe("merged");
    expect(result.outcomes[0].jobId).toBe("seed-1");
    expect(store.rows).toHaveLength(1);
  });

  it("fingerprint uniqueness among source_job_id-LESS rows is still enforced under the fix (Case 4)", async () => {
    const store = new ConstraintAwareStore("source-scoped");
    const posting = {
      source: "custom-careers",
      sourceJobId: undefined,
      fingerprint: "no-id-fingerprint",
      companyName: "Acme",
      role: "Ops Generalist",
      location: "Remote",
      normalizedCompany: "acme",
      normalizedRole: "ops generalist",
      normalizedLocation: "remote",
      parserVersion: "fake-1",
      sourceUrl: "https://example.test/a",
    } as unknown as NormalizedJobPosting;

    // First write with no matchId succeeds (nothing to conflict with yet).
    await store.upsertCanonicalJob(posting, null);

    // A second, independently-arriving posting with no source_job_id but the
    // SAME fingerprint must still be rejected — the partial index still
    // covers source_job_id-IS-NULL rows exactly as it did before the fix.
    await expect(store.upsertCanonicalJob(posting, null)).rejects.toThrow(
      /global_jobs_fingerprint_key/,
    );
  });
});

// Sanity check that resolveDuplicate is what CrawlRunner is actually
// delegating to (guards against the two silently drifting apart).
describe("CrawlRunner + DeduplicationEngine wiring", () => {
  it("resolveDuplicate itself agrees on the cross-platform scenario above", () => {
    const seed: DedupCandidate = {
      id: "seed-1",
      source: "linkedin",
      sourceJobId: "li-9",
      fingerprint: "unrelated-fingerprint",
      normalizedCompany: "Google",
      normalizedRole: "Product Intern",
      normalizedLocation: "bangalore",
      postedAt: "2026-08-01T00:00:00Z",
    };
    const decision = resolveDuplicate(
      {
        source: "greenhouse",
        sourceJobId: "gh-1",
        fingerprint: "different-fingerprint",
        normalizedCompany: "Google",
        normalizedRole: "Product Intern",
        normalizedLocation: "bangalore",
        postedAt: "2026-08-02T00:00:00Z",
      },
      [seed],
    );
    expect(decision).toEqual({ tier: "cross_platform", matchId: "seed-1", confidence: 90 });
  });
});
