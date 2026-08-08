import { describe, expect, it } from "vitest";
import { AdapterRegistry } from "../adapters/AdapterRegistry";
import {
  createBlockedAdapter,
  createBlockedAdapterFor,
} from "../adapters/blocked/BlockedPlatformAdapter";
import { CrawlTargetError, crawlErrorMessage, isBlockedError } from "./errors";
import { DryRunJobIntelligenceStore } from "./DryRunStore";
import { getPlatformLimitation, PLATFORM_LIMITATIONS } from "./limitations";
import {
  getPlatformDescriptor,
  listPlatformSummaries,
  supportedPlatforms,
} from "./PlatformCatalog";
import { registerCrawlAdapters } from "./registerAdapters";
import { isEntryDue, toCrawlTarget } from "./registry/CompanyRegistry";
import {
  addCounters,
  emptyCounters,
  summarizeReport,
  toRunCounters,
  type CrawlReport,
} from "./report/CrawlReport";
import { ValidatingJobParser, ValidationCollector } from "./validate/ValidatingJobParser";
import { FakeFetcher } from "./testing/fakeFetcher";
import { InMemoryJobStore, registryEntry } from "./testing/fakes";
import type { JobParser, ParseOutcome, RawJobPayload } from "../parsers/types";
import type { NormalizedJobPosting, ParsedJobPosting } from "../types";

// ── errors ──

describe("crawl errors", () => {
  it("carries the blocked flag", () => {
    expect(isBlockedError(new CrawlTargetError("x", { blocked: true }))).toBe(true);
    expect(isBlockedError(new CrawlTargetError("x"))).toBe(false);
    expect(isBlockedError(new Error("x"))).toBe(false);
  });

  it("extracts a message safely", () => {
    expect(crawlErrorMessage(new Error("boom"), "fallback")).toBe("boom");
    expect(crawlErrorMessage("string error", "fallback")).toBe("string error");
    expect(crawlErrorMessage({ weird: true }, "fallback")).toBe("fallback");
    expect(crawlErrorMessage(new Error(""), "fallback")).toBe("fallback");
  });
});

// ── limitations ──

describe("platform limitations", () => {
  it("declares all three blocked platforms with evidence", () => {
    expect(Object.keys(PLATFORM_LIMITATIONS).sort()).toEqual(["foundit", "iimjobs", "wellfound"]);
    for (const limitation of Object.values(PLATFORM_LIMITATIONS)) {
      expect(limitation.evidence).toBeTruthy();
      expect(limitation.reason).toBeTruthy();
      expect(limitation.unblockedBy).toBeTruthy();
    }
  });

  it("is case-insensitive on lookup", () => {
    expect(getPlatformLimitation("WellFound")?.platform).toBe("wellfound");
    expect(getPlatformLimitation("greenhouse")).toBeUndefined();
  });

  it("records that Foundit's working endpoint is disallowed by robots.txt, not merely broken", () => {
    expect(PLATFORM_LIMITATIONS.foundit.evidence).toMatch(/robots\.txt/);
    expect(PLATFORM_LIMITATIONS.foundit.unblockedBy).toMatch(/deliberately NOT used/i);
  });
});

// ── BlockedPlatformAdapter ──

describe("BlockedPlatformAdapter", () => {
  it("fails loudly with the documented reason rather than returning zero jobs", async () => {
    const adapter = createBlockedAdapter(PLATFORM_LIMITATIONS.iimjobs);
    await expect(
      adapter.crawler.fetchRawPostings({ kind: "url", url: "https://www.iimjobs.com/j/x" }),
    ).rejects.toThrow(/IIMJobs is not supported/);
  });

  it("marks its failure as blocked", async () => {
    const adapter = createBlockedAdapter(PLATFORM_LIMITATIONS.wellfound);
    await expect(
      adapter.crawler.fetchRawPostings({ kind: "url", url: "https://wellfound.com/jobs" }),
    ).rejects.toMatchObject({ blocked: true });
  });

  it("keeps its parser total", () => {
    const adapter = createBlockedAdapter(PLATFORM_LIMITATIONS.foundit);
    const outcome = adapter.parser.parse({
      platform: "foundit",
      sourceUrl: "https://www.foundit.in/job/x",
      fetchedAt: new Date().toISOString(),
    });
    expect(outcome.ok).toBe(false);
  });

  it("builds by platform tag, or not at all for a supported platform", () => {
    expect(createBlockedAdapterFor("foundit")?.platform).toBe("foundit");
    expect(createBlockedAdapterFor("greenhouse")).toBeUndefined();
  });
});

// ── PlatformCatalog ──

describe("PlatformCatalog", () => {
  it("lists the three supported platforms for this phase", () => {
    expect(supportedPlatforms().sort()).toEqual(["career-pages", "internshala", "weworkremotely"]);
  });

  it("includes blocked platforms, flagged unsupported", () => {
    const summaries = listPlatformSummaries();
    const wellfound = summaries.find((entry) => entry.platform === "wellfound");
    expect(wellfound?.supported).toBe(false);
    expect(wellfound?.limitationReason).toMatch(/DataDome/);
  });

  it("explains how each supported platform obtains postings", () => {
    for (const summary of listPlatformSummaries().filter((entry) => entry.supported)) {
      expect(summary.method.length).toBeGreaterThan(10);
      expect(summary.limitationReason).toBeNull();
    }
  });

  it("is case-insensitive on lookup and unknown-safe", () => {
    expect(getPlatformDescriptor("Career-Pages")?.platform).toBe("career-pages");
    expect(getPlatformDescriptor("monster")).toBeUndefined();
  });

  it("does NOT include LinkedIn — deliberately out of scope for this phase", () => {
    expect(listPlatformSummaries().map((entry) => entry.platform)).not.toContain("linkedin");
  });
});

// ── registerAdapters ──

describe("registerCrawlAdapters", () => {
  it("fills Module 10A's registry with every platform tag", () => {
    const registry = registerCrawlAdapters(new FakeFetcher(), new AdapterRegistry());
    expect(registry.list().sort()).toEqual([
      "career-pages",
      "foundit",
      "iimjobs",
      "internshala",
      "wellfound",
      "weworkremotely",
    ]);
  });

  it("is idempotent — a second call must not throw", () => {
    const registry = new AdapterRegistry();
    registerCrawlAdapters(new FakeFetcher(), registry);
    expect(() => registerCrawlAdapters(new FakeFetcher(), registry)).not.toThrow();
    expect(registry.list()).toHaveLength(6);
  });
});

// ── Company registry helpers ──

describe("isEntryDue", () => {
  const now = Date.parse("2026-08-08T12:00:00Z");

  it("is due when never crawled", () => {
    expect(isEntryDue(registryEntry({ lastCrawlAt: null }), now)).toBe(true);
  });

  it("is not due inside the frequency window", () => {
    const entry = registryEntry({
      lastCrawlAt: new Date(now - 2 * 3600 * 1000).toISOString(),
      crawlFrequencyHours: 24,
    });
    expect(isEntryDue(entry, now)).toBe(false);
  });

  it("is due once the window has elapsed", () => {
    const entry = registryEntry({
      lastCrawlAt: new Date(now - 25 * 3600 * 1000).toISOString(),
      crawlFrequencyHours: 24,
    });
    expect(isEntryDue(entry, now)).toBe(true);
  });

  it("force always wins", () => {
    const entry = registryEntry({ lastCrawlAt: new Date(now).toISOString() });
    expect(isEntryDue(entry, now, true)).toBe(true);
  });

  it("treats an unparseable timestamp as due", () => {
    expect(isEntryDue(registryEntry({ lastCrawlAt: "not a date" }), now)).toBe(true);
  });
});

describe("toCrawlTarget", () => {
  it("maps a registry entry to a company target", () => {
    expect(toCrawlTarget(registryEntry({ careersUrl: "https://x.test/careers" }))).toEqual({
      kind: "company",
      companyCareerUrl: "https://x.test/careers",
    });
  });
});

// ── Report counters ──

describe("crawl report counters", () => {
  it("starts at zero", () => {
    expect(emptyCounters()).toEqual({
      discovered: 0,
      parsed: 0,
      validated: 0,
      imported: 0,
      updated: 0,
      merged: 0,
      duplicates: 0,
      skipped: 0,
      failed: 0,
    });
  });

  it("adds field-wise", () => {
    const a = { ...emptyCounters(), imported: 2, failed: 1 };
    const b = { ...emptyCounters(), imported: 3, skipped: 4 };
    const sum = addCounters(a, b);
    expect(sum.imported).toBe(5);
    expect(sum.failed).toBe(1);
    expect(sum.skipped).toBe(4);
  });

  function report(): CrawlReport {
    return {
      runId: "run-1",
      mode: "live",
      scope: "all",
      platform: null,
      triggeredBy: null,
      startedAt: "2026-08-08T12:00:00.000Z",
      finishedAt: "2026-08-08T12:00:12.000Z",
      durationMs: 12_000,
      companiesScanned: 3,
      totals: { ...emptyCounters(), discovered: 40, imported: 30, duplicates: 8, failed: 2 },
      companies: [],
      limitations: [],
    };
  }

  it("maps to the denormalized run columns", () => {
    expect(toRunCounters(report())).toMatchObject({
      companies_scanned: 3,
      jobs_discovered: 40,
      jobs_imported: 30,
      jobs_duplicates: 8,
      jobs_failed: 2,
    });
  });

  it("summarizes in one line", () => {
    expect(summarizeReport(report())).toBe(
      "Crawl: 3 target(s), 40 discovered, 30 imported, 8 duplicate(s), 0 skipped, 2 failed in 12.0s",
    );
  });

  it("labels a dry run as such", () => {
    expect(summarizeReport({ ...report(), mode: "dry_run" })).toMatch(/^Dry run:/);
  });
});

// ── ValidatingJobParser ──

function parsedJob(overrides: Partial<ParsedJobPosting> = {}): ParsedJobPosting {
  return {
    source: "test",
    sourceJobId: "1",
    sourceUrl: "https://x.test/1",
    companyName: "Acme",
    role: "Engineer",
    parserVersion: "v1",
    ...overrides,
  };
}

function stubParser(outcome: ParseOutcome): JobParser {
  return { platform: "test", version: "v1", parse: () => outcome };
}

const RAW: RawJobPayload = {
  platform: "test",
  sourceUrl: "https://x.test/1",
  fetchedAt: "2026-08-08T00:00:00.000Z",
};

describe("ValidatingJobParser", () => {
  it("passes a valid posting through and records it as parsed", () => {
    const collector = new ValidationCollector();
    const parser = new ValidatingJobParser(stubParser({ ok: true, job: parsedJob() }), collector);

    expect(parser.parse(RAW).ok).toBe(true);
    expect(collector.get(RAW.sourceUrl)?.kind).toBe("parsed");
    expect(collector.parsedCount).toBe(1);
  });

  it("rejects an invalid posting and records it as skipped", () => {
    const collector = new ValidationCollector();
    const parser = new ValidatingJobParser(
      stubParser({ ok: true, job: parsedJob({ role: "Apply now" }) }),
      collector,
    );

    const outcome = parser.parse(RAW);
    expect(outcome.ok).toBe(false);
    expect(collector.get(RAW.sourceUrl)?.kind).toBe("skipped");
    expect(collector.skipped).toHaveLength(1);
  });

  it("leaves a parse failure alone — it must stay 'failed', not become 'skipped'", () => {
    const collector = new ValidationCollector();
    const parser = new ValidatingJobParser(
      stubParser({ ok: false, reason: "no title" }),
      collector,
    );

    expect(parser.parse(RAW).ok).toBe(false);
    expect(collector.get(RAW.sourceUrl)).toBeUndefined();
    expect(collector.skipped).toHaveLength(0);
  });

  it("returns the SANITIZED job, not the parser's original", () => {
    const collector = new ValidationCollector();
    const parser = new ValidatingJobParser(
      stubParser({ ok: true, job: parsedJob({ description: "<p>markup</p>" }) }),
      collector,
    );

    const outcome = parser.parse(RAW);
    if (!outcome.ok) throw new Error("expected success");
    expect(outcome.job.description).toBeNull();
    expect(collector.sanitizedNotes[0]).toMatch(/description/);
  });

  it("delegates platform and version to the wrapped parser", () => {
    const parser = new ValidatingJobParser(
      stubParser({ ok: false, reason: "x" }),
      new ValidationCollector(),
    );
    expect(parser.platform).toBe("test");
    expect(parser.version).toBe("v1");
  });

  it("resets cleanly", () => {
    const collector = new ValidationCollector();
    collector.record("https://x.test/1", { kind: "parsed", sanitized: [] });
    collector.reset();
    expect(collector.parsedCount).toBe(0);
  });
});

// ── DryRunJobIntelligenceStore ──

function normalized(overrides: Partial<NormalizedJobPosting> = {}): NormalizedJobPosting {
  return {
    ...parsedJob(),
    normalizedCompany: "acme",
    normalizedRole: "engineer",
    normalizedLocation: "berlin",
    fingerprint: "fp-1",
    ...overrides,
  };
}

describe("DryRunJobIntelligenceStore", () => {
  it("suppresses writes and records what would have happened", async () => {
    const inner = new InMemoryJobStore();
    const dryRun = new DryRunJobIntelligenceStore(inner);

    const result = await dryRun.upsertCanonicalJob(normalized(), null);

    expect(inner.writes).toHaveLength(0);
    expect(inner.rows).toHaveLength(0);
    expect(result.created).toBe(true);
    expect(result.jobId).toMatch(/^dry-run:/);
    expect(dryRun.suppressedWrites).toEqual([
      {
        source: "test",
        sourceJobId: "1",
        companyName: "Acme",
        role: "Engineer",
        wouldCreate: true,
      },
    ]);
  });

  it("reports an update (not a create) when a match was found", async () => {
    const dryRun = new DryRunJobIntelligenceStore(new InMemoryJobStore());
    const result = await dryRun.upsertCanonicalJob(normalized(), "existing-id");

    expect(result).toEqual({ jobId: "existing-id", created: false });
    expect(dryRun.suppressedWrites[0].wouldCreate).toBe(false);
  });

  it("passes dedup reads straight through to the real store", async () => {
    const inner = new InMemoryJobStore();
    inner.rows.push({
      id: "job-1",
      source: "test",
      sourceJobId: "1",
      fingerprint: "fp-1",
      normalizedCompany: "acme",
      normalizedRole: "engineer",
      normalizedLocation: "berlin",
    });

    const dryRun = new DryRunJobIntelligenceStore(inner);
    const candidates = await dryRun.findDedupCandidates({
      source: "test",
      sourceJobId: "1",
      fingerprint: "fp-1",
      normalizedCompany: "acme",
      normalizedRole: "engineer",
    });

    expect(candidates).toHaveLength(1);
  });
});
