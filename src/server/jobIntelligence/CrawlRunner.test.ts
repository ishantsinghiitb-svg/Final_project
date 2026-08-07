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
