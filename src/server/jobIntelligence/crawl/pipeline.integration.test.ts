// ── Module 10B.2: end-to-end pipeline integration ──
//
// Proves the WHOLE canonical path runs for real, on real platform payloads:
//
//   platform crawler → parser → validator → normalizer → deduplicator → store
//
// Only two things are faked: the network (a scripted `FakeFetcher`) and the
// database (`InMemoryJobStore`). Everything between them is the production
// code — Module 10A's `runPlatformCrawl`, its normalizers, its fingerprinting
// and its dedup engine — so this test fails if any stage silently stops being
// wired in, which a per-stage unit test cannot catch.

import { describe, expect, it } from "vitest";
import { CrawlOrchestrator } from "./CrawlOrchestrator";
import { FakeFetcher } from "./testing/fakeFetcher";
import {
  InMemoryJobStore,
  InMemoryRegistryStore,
  InMemoryReportStore,
  registryEntry,
} from "./testing/fakes";

const GH_URL = "https://boards-api.greenhouse.io/v1/boards/acme/jobs?content=true";
const LEVER_URL = "https://api.lever.co/v0/postings/acme?mode=json&limit=100&skip=0";
const WWR_URL = "https://weworkremotely.com/remote-jobs.rss";

/** A realistic recent posted_at for fixtures that aren't specifically testing date handling. */
const recentIso = () => new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString();

function json(payload: unknown) {
  return { body: JSON.stringify(payload), contentType: "application/json" };
}

function greenhouseJob(overrides: Record<string, unknown> = {}) {
  return {
    id: 4242,
    title: "Senior Backend Engineer",
    absolute_url: "https://boards.greenhouse.io/acme/jobs/4242",
    company_name: "Acme Careers",
    first_published: recentIso(),
    location: { name: "Bengaluru, Karnataka, India" },
    departments: [{ name: "Engineering" }],
    content: "&lt;p&gt;Build the platform.&lt;/p&gt;&lt;ul&gt;&lt;li&gt;Go&lt;/li&gt;&lt;/ul&gt;",
    ...overrides,
  };
}

function build(options: { fetcher: FakeFetcher; entries?: ReturnType<typeof registryEntry>[] }) {
  const registry = new InMemoryRegistryStore(options.entries ?? []);
  const store = new InMemoryJobStore();
  const reports = new InMemoryReportStore();
  const orchestrator = new CrawlOrchestrator({
    fetcher: options.fetcher,
    registry,
    store,
    reports,
  });
  return { orchestrator, registry, store, reports };
}

describe("integration: crawler → parser → validator → normalizer → dedup → store", () => {
  it("carries one Greenhouse posting through every stage into the canonical store", async () => {
    const fetcher = new FakeFetcher({
      [GH_URL]: json({ jobs: [greenhouseJob()], meta: { total: 1 } }),
    });
    const { orchestrator, store } = build({
      fetcher,
      entries: [
        registryEntry({
          companyName: "Acme",
          careersUrl: "https://boards.greenhouse.io/acme",
          healthStatus: "HEALTHY",
        }),
      ],
    });

    const report = await orchestrator.run({ mode: "live", scope: "all" });

    // Crawler stage
    expect(report.totals.discovered).toBe(1);
    // Parser stage
    expect(report.totals.parsed).toBe(1);
    // Validator stage
    expect(report.totals.validated).toBe(1);
    // Store stage
    expect(report.totals.imported).toBe(1);
    expect(store.writes).toHaveLength(1);

    const written = store.writes[0];

    // Parser produced canonical fields from the platform payload.
    expect(written.source).toBe("greenhouse");
    expect(written.sourceJobId).toBe("4242");
    expect(written.role).toBe("Senior Backend Engineer");
    expect(written.url).toBe("https://boards.greenhouse.io/acme/jobs/4242");
    expect(written.city).toBe("Bengaluru");
    expect(written.department).toBe("Engineering");

    // Validator stripped markup rather than storing raw HTML.
    expect(written.description).toBe("Build the platform.\n\n- Go");
    expect(written.description).not.toMatch(/[<>]/);

    // Normalizer stage: Module 10A's company + role normalization ran, and the
    // ORIGINAL values were preserved alongside the canonical ones.
    expect(written.companyName).toBe("Acme Careers");
    expect(written.normalizedCompany).toBe("Acme");
    expect(written.normalizedRole).toBe("Senior Backend Engineer");
    expect(written.normalizedLocation).toBe("bengaluru");

    // Deduplicator stage: a fingerprint was computed for tier-2 matching.
    expect(written.fingerprint).toMatch(/^[a-f0-9]{16,}$/);
  });

  it("resolves the SAME job seen twice as one canonical row, not two", async () => {
    const fetcher = new FakeFetcher({
      [GH_URL]: json({ jobs: [greenhouseJob()], meta: { total: 1 } }),
    });
    const { orchestrator, store } = build({
      fetcher,
      entries: [
        registryEntry({ careersUrl: "https://boards.greenhouse.io/acme", healthStatus: "HEALTHY" }),
      ],
    });

    await orchestrator.run({ mode: "live", scope: "all" });
    const second = await orchestrator.run({ mode: "live", scope: "all" });

    expect(second.totals.imported).toBe(0);
    expect(second.totals.duplicates).toBe(1);
    expect(store.rows).toHaveLength(1);
  });

  it("merges the same role across two platforms into one canonical job", async () => {
    // The cross-platform requirement: one job on Greenhouse and on a company
    // feed must not become two unrelated jobs.
    const sharedRole = "Staff Data Engineer";
    const postedAt = recentIso();

    const fetcher = new FakeFetcher({
      [GH_URL]: json({
        jobs: [
          greenhouseJob({
            id: 999,
            title: sharedRole,
            company_name: "Acme",
            first_published: postedAt,
            location: { name: "Pune, India" },
          }),
        ],
        meta: { total: 1 },
      }),
      [LEVER_URL]: json([
        {
          id: "lever-999",
          text: sharedRole,
          hostedUrl: "https://jobs.lever.co/acme/lever-999",
          createdAt: Date.parse(postedAt),
          categories: { location: "Pune, India", commitment: "Full-time" },
          description: "<p>Same job, different board.</p>",
        },
      ]),
    });

    const { orchestrator, store } = build({
      fetcher,
      entries: [
        registryEntry({
          id: "gh",
          companyName: "Acme",
          careersUrl: "https://boards.greenhouse.io/acme",
          healthStatus: "HEALTHY",
        }),
        registryEntry({
          id: "lv",
          companyName: "Acme",
          careersUrl: "https://jobs.lever.co/acme",
          healthStatus: "HEALTHY",
        }),
      ],
    });

    const report = await orchestrator.run({ mode: "live", scope: "all" });

    expect(report.totals.discovered).toBe(2);
    // One canonical row, and the second platform recorded as a duplicate/merge
    // rather than a new job.
    expect(store.rows).toHaveLength(1);
    expect(report.totals.imported).toBe(1);
    expect(report.totals.duplicates).toBe(1);
  });

  it("runs every stage in DRY RUN but writes nothing", async () => {
    const fetcher = new FakeFetcher({
      [GH_URL]: json({ jobs: [greenhouseJob()], meta: { total: 1 } }),
    });
    const { orchestrator, store } = build({
      fetcher,
      entries: [
        registryEntry({ careersUrl: "https://boards.greenhouse.io/acme", healthStatus: "HEALTHY" }),
      ],
    });

    const report = await orchestrator.run({ mode: "dry_run", scope: "all" });

    // Real fetch, real parse, real validation, real normalization, real dedup…
    expect(fetcher.requested).toEqual([GH_URL]);
    expect(report.totals.discovered).toBe(1);
    expect(report.totals.parsed).toBe(1);
    expect(report.totals.validated).toBe(1);
    // …and no write.
    expect(store.writes).toHaveLength(0);
    expect(store.rows).toHaveLength(0);
  });

  it("imports a posting with an old posted_at all the way to the store (Module 10B.2 fix)", async () => {
    // Regression for the 2026-08-09 Dry Run audit: a validator-level
    // `postedAt`-age reject was removed because it discarded 69% of real,
    // valid postings from large-company ATS boards where reqs legitimately
    // stay open for months. A stale-but-otherwise-valid posting must now
    // reach the store, carrying its ORIGINAL posted_at untouched — freshness
    // is `last_seen_at`'s job (stamped by admin_upsert_global_job at write
    // time), not a reason to refuse the write in the first place.
    const stale = new Date(Date.now() - 200 * 24 * 3600 * 1000).toISOString();
    const fetcher = new FakeFetcher({
      [GH_URL]: json({
        // A genuinely distinct posting (different title+location), not just a
        // different id — same role/company/location would legitimately dedup
        // to one canonical job via fingerprint matching, which would make
        // `imported` come out as 1 for reasons unrelated to what this test
        // checks.
        jobs: [
          greenhouseJob(),
          greenhouseJob({
            id: 7,
            title: "Staff Data Engineer",
            location: { name: "Pune, India" },
            first_published: stale,
          }),
        ],
        meta: { total: 2 },
      }),
    });
    const { orchestrator, store } = build({
      fetcher,
      entries: [
        registryEntry({ careersUrl: "https://boards.greenhouse.io/acme", healthStatus: "HEALTHY" }),
      ],
    });

    const report = await orchestrator.run({ mode: "live", scope: "all" });

    expect(report.totals.discovered).toBe(2);
    expect(report.totals.imported).toBe(2);
    expect(report.totals.rejected).toBe(0);
    expect(report.totals.failed).toBe(0);
    expect(store.writes).toHaveLength(2);
    expect(store.writes.find((w) => w.sourceJobId === "7")?.postedAt).toBe(stale);
  });

  it("still rejects a posting with a genuine defect, independent of date", async () => {
    // Proves the validator still does real work in this pipeline — the fix
    // removed ONE specific rule, not validation as a whole.
    const fetcher = new FakeFetcher({
      [GH_URL]: json({
        jobs: [greenhouseJob(), greenhouseJob({ id: 8, title: "Apply now" })],
        meta: { total: 2 },
      }),
    });
    const { orchestrator, store } = build({
      fetcher,
      entries: [
        registryEntry({ careersUrl: "https://boards.greenhouse.io/acme", healthStatus: "HEALTHY" }),
      ],
    });

    const report = await orchestrator.run({ mode: "live", scope: "all" });

    expect(report.totals.imported).toBe(1);
    expect(report.totals.rejected).toBe(1);
    expect(store.writes).toHaveLength(1);
  });

  it("runs a non-ATS platform through the identical pipeline", async () => {
    const feed = `<?xml version="1.0"?><rss><channel><item>
      <title>Beta Ltd: Remote Platform Engineer</title>
      <type>Full-Time</type>
      <region>Anywhere in the World</region>
      <description>&lt;p&gt;Run the platform.&lt;/p&gt;</description>
      <pubDate>${new Date(Date.now() - 3 * 24 * 3600 * 1000).toUTCString()}</pubDate>
      <link>https://weworkremotely.com/remote-jobs/beta-platform-engineer</link>
    </item></channel></rss>`;

    const { orchestrator, store } = build({
      fetcher: new FakeFetcher({ [WWR_URL]: { body: feed, contentType: "application/rss+xml" } }),
      entries: [
        registryEntry({
          platform: "weworkremotely",
          companyName: "We Work Remotely",
          careersUrl: WWR_URL,
          healthStatus: "HEALTHY",
        }),
      ],
    });

    const report = await orchestrator.run({ mode: "live", scope: "all" });

    expect(report.totals.imported).toBe(1);
    const written = store.writes[0];
    expect(written.source).toBe("weworkremotely");
    expect(written.companyName).toBe("Beta Ltd");
    expect(written.role).toBe("Remote Platform Engineer");
    expect(written.remote).toBe(true);
    expect(written.fingerprint).toBeTruthy();
  });

  it("contains one platform's failure without losing another's jobs", async () => {
    const fetcher = new FakeFetcher({
      [GH_URL]: json({ jobs: [greenhouseJob()], meta: { total: 1 } }),
      // The Lever board is unscripted → 404 on page 1 → that entry fails.
    });
    const { orchestrator, store } = build({
      fetcher,
      entries: [
        registryEntry({
          id: "gh",
          careersUrl: "https://boards.greenhouse.io/acme",
          healthStatus: "HEALTHY",
        }),
        registryEntry({
          id: "lv",
          careersUrl: "https://jobs.lever.co/acme",
          healthStatus: "HEALTHY",
        }),
      ],
    });

    const report = await orchestrator.run({ mode: "live", scope: "all" });

    expect(report.companiesScanned).toBe(2);
    expect(report.totals.imported).toBe(1);
    expect(store.rows).toHaveLength(1);
    expect(report.companies.filter((c) => c.status === "failed")).toHaveLength(1);
  });

  it("reports a per-platform rollup", async () => {
    const fetcher = new FakeFetcher({
      [GH_URL]: json({ jobs: [greenhouseJob()], meta: { total: 1 } }),
    });
    const { orchestrator } = build({
      fetcher,
      entries: [
        registryEntry({ careersUrl: "https://boards.greenhouse.io/acme", healthStatus: "HEALTHY" }),
      ],
    });

    const report = await orchestrator.run({ mode: "live", scope: "all" });
    expect(report.platforms).toHaveLength(1);
    expect(report.platforms[0]).toMatchObject({
      platform: "career-pages",
      targets: 1,
      succeeded: 1,
    });
    expect(report.platforms[0].counters.imported).toBe(1);
  });
});

describe("integration: only verified sources are crawled", () => {
  it.each(["BROKEN", "BLOCKED", "UNAVAILABLE", "UNKNOWN"] as const)(
    "refuses a %s source without making a request",
    async (healthStatus) => {
      const fetcher = new FakeFetcher({
        [GH_URL]: json({ jobs: [greenhouseJob()], meta: { total: 1 } }),
      });
      const { orchestrator, store } = build({
        fetcher,
        entries: [registryEntry({ careersUrl: "https://boards.greenhouse.io/acme", healthStatus })],
      });

      const report = await orchestrator.run({ mode: "live", scope: "all" });

      expect(fetcher.requested).toHaveLength(0);
      expect(store.writes).toHaveLength(0);
      expect(report.companies[0].status).toBe("skipped");
      expect(report.companies[0].message).toMatch(healthStatus);
    },
  );

  it("crawls a HEALTHY source", async () => {
    const fetcher = new FakeFetcher({
      [GH_URL]: json({ jobs: [greenhouseJob()], meta: { total: 1 } }),
    });
    const { orchestrator } = build({
      fetcher,
      entries: [
        registryEntry({ careersUrl: "https://boards.greenhouse.io/acme", healthStatus: "HEALTHY" }),
      ],
    });

    const report = await orchestrator.run({ mode: "live", scope: "all" });
    expect(report.totals.imported).toBe(1);
  });

  it("REFUSES a never-verified (NULL health) source and says how to fix it", async () => {
    // "Never verified" is the absence of evidence, not a clean bill of health.
    // This is not permanent: running "Check all sources" sets the health, and
    // a source that verifies as HEALTHY/REDIRECTED becomes crawlable.
    const fetcher = new FakeFetcher({
      [GH_URL]: json({ jobs: [greenhouseJob()], meta: { total: 1 } }),
    });
    const { orchestrator, store } = build({
      fetcher,
      entries: [
        registryEntry({ careersUrl: "https://boards.greenhouse.io/acme", healthStatus: null }),
      ],
    });

    const report = await orchestrator.run({ mode: "live", scope: "all" });

    expect(fetcher.requested).toHaveLength(0);
    expect(store.writes).toHaveLength(0);
    expect(report.companies[0].status).toBe("skipped");
    expect(report.companies[0].message).toMatch(/never been verified/i);
    expect(report.companies[0].message).toMatch(/Check all sources/);
  });

  it("crawls that same source once verification marks it healthy", async () => {
    // Proves the NULL refusal is a gate, not a permanent block — the path WWR
    // and Internshala take after a verification sweep.
    const fetcher = new FakeFetcher({
      [GH_URL]: json({ jobs: [greenhouseJob()], meta: { total: 1 } }),
    });
    const { orchestrator } = build({
      fetcher,
      entries: [
        registryEntry({
          careersUrl: "https://boards.greenhouse.io/acme",
          healthStatus: "REDIRECTED",
        }),
      ],
    });

    const report = await orchestrator.run({ mode: "live", scope: "all" });
    expect(report.totals.imported).toBe(1);
  });

  it("refuses a disabled source", async () => {
    const fetcher = new FakeFetcher();
    const { orchestrator } = build({
      fetcher,
      entries: [registryEntry({ enabled: false, healthStatus: "HEALTHY" })],
    });

    // listEntries only returns enabled rows, so nothing is even considered.
    const report = await orchestrator.run({ mode: "live", scope: "all" });
    expect(report.companiesScanned).toBe(0);
    expect(fetcher.requested).toHaveLength(0);
  });
});
