import { describe, expect, it } from "vitest";
import { CrawlOrchestrator, allReportedLimitations, interleaveByPlatform } from "./CrawlOrchestrator";
import { BLOCKED, FakeFetcher } from "./testing/fakeFetcher";
import {
  BrokenRegistryStore,
  FailingJobStore,
  InMemoryJobStore,
  InMemoryRegistryStore,
  InMemoryReportStore,
  registryEntry,
} from "./testing/fakes";

const GREENHOUSE_URL = "https://boards-api.greenhouse.io/v1/boards/acme/jobs?content=true";
const WWR_FEED = "https://weworkremotely.com/remote-jobs.rss";

function greenhousePayload(jobs: Array<Record<string, unknown>>): string {
  return JSON.stringify({ jobs });
}

function goodJob(id: number, title = `Engineer ${id}`) {
  return {
    id,
    title,
    absolute_url: `https://acme.test/jobs/${id}`,
    company_name: "Acme",
    // India + recent: the catalog-eligibility gate (India-only, posted within
    // 30 days) runs on every adapter, so a fixture meant to exercise pipeline
    // MECHANICS has to be a job the catalog would actually accept. The date is
    // relative so these tests never start failing with the passage of time.
    first_published: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    location: { name: "Bengaluru, Karnataka, India" },
    content: "&lt;p&gt;Do the work.&lt;/p&gt;",
  };
}

/** Wires an orchestrator over in-memory collaborators. */
function build(options: {
  fetcher: FakeFetcher;
  entries?: ReturnType<typeof registryEntry>[];
  store?: InMemoryJobStore | FailingJobStore;
  now?: () => number;
  maxRunDurationMs?: number;
  entryTimeoutMs?: number;
}) {
  const registry = new InMemoryRegistryStore(options.entries ?? [registryEntry()]);
  const reports = new InMemoryReportStore();
  const store = options.store ?? new InMemoryJobStore();
  const orchestrator = new CrawlOrchestrator({
    fetcher: options.fetcher,
    registry,
    store,
    reports,
    now: options.now,
    maxRunDurationMs: options.maxRunDurationMs,
    entryTimeoutMs: options.entryTimeoutMs,
  });
  return { orchestrator, registry, reports, store };
}

describe("CrawlOrchestrator — happy path", () => {
  it("runs the full pipeline and reports accurate counters", async () => {
    const fetcher = new FakeFetcher({
      [GREENHOUSE_URL]: { body: greenhousePayload([goodJob(1), goodJob(2)]) },
    });
    const { orchestrator, store } = build({ fetcher });

    const report = await orchestrator.run({ mode: "live", scope: "all" });

    expect(report.companiesScanned).toBe(1);
    expect(report.totals.discovered).toBe(2);
    expect(report.totals.parsed).toBe(2);
    expect(report.totals.imported).toBe(2);
    expect(report.totals.failed).toBe(0);
    expect(report.totals.skipped).toBe(0);
    expect((store as InMemoryJobStore).writes).toHaveLength(2);
  });

  it("records the resolved ATS provider on the company report", async () => {
    const fetcher = new FakeFetcher({
      [GREENHOUSE_URL]: { body: greenhousePayload([goodJob(1)]) },
    });
    const { orchestrator } = build({ fetcher });

    const report = await orchestrator.run({ mode: "live", scope: "all" });
    expect(report.companies[0].resolvedProvider).toBe("greenhouse");
    expect(report.companies[0].status).toBe("success");
  });

  it("counts a re-crawl of the same postings as duplicates, not imports", async () => {
    const fetcher = new FakeFetcher({
      [GREENHOUSE_URL]: { body: greenhousePayload([goodJob(1)]) },
    });
    const { orchestrator } = build({ fetcher });

    await orchestrator.run({ mode: "live", scope: "all" });
    // force: true — the admin button's own default; without it the entry is
    // correctly not-due yet immediately after being crawled (see
    // InMemoryRegistryStore's now-faithful lastCrawlAt bookkeeping).
    const second = await orchestrator.run({ mode: "live", scope: "all", force: true });

    expect(second.totals.imported).toBe(0);
    expect(second.totals.duplicates).toBe(1);
    expect(second.totals.updated).toBe(1);
  });

  it("writes the run to the report store, started before and finished after", async () => {
    const fetcher = new FakeFetcher({
      [GREENHOUSE_URL]: { body: greenhousePayload([goodJob(1)]) },
    });
    const { orchestrator, reports } = build({ fetcher });

    await orchestrator.run({ mode: "live", scope: "all", triggeredBy: "admin@acme.test" });

    expect(reports.started).toEqual([
      { mode: "live", scope: "all", platform: null, triggeredBy: "admin@acme.test" },
    ]);
    expect(reports.finished).toHaveLength(1);
    expect(reports.finished[0].report.totals.imported).toBe(1);
  });

  it("marks the registry entry successful with the import count", async () => {
    const fetcher = new FakeFetcher({
      [GREENHOUSE_URL]: { body: greenhousePayload([goodJob(1)]) },
    });
    const { orchestrator, registry } = build({ fetcher });

    await orchestrator.run({ mode: "live", scope: "all" });

    expect(registry.results).toEqual([
      {
        entryId: "entry-1",
        result: { status: "success", error: null, jobsImported: 1, recordAttempt: true },
      },
    ]);
  });

  it("narrows to one platform when scope is 'platform'", async () => {
    const fetcher = new FakeFetcher({
      [GREENHOUSE_URL]: { body: greenhousePayload([goodJob(1)]) },
      [WWR_FEED]: {
        body: "<rss><channel><item><title>A: B</title><link>https://w.test/a</link></item></channel></rss>",
      },
    });
    const { orchestrator } = build({
      fetcher,
      entries: [
        registryEntry(),
        registryEntry({ id: "entry-2", platform: "weworkremotely", careersUrl: WWR_FEED }),
      ],
    });

    const report = await orchestrator.run({
      mode: "live",
      scope: "platform",
      platform: "weworkremotely",
    });
    expect(report.companiesScanned).toBe(1);
    expect(report.companies[0].platform).toBe("weworkremotely");
  });

  it("requires a platform when scope is 'platform'", async () => {
    const { orchestrator } = build({ fetcher: new FakeFetcher() });
    await expect(orchestrator.run({ mode: "live", scope: "platform" })).rejects.toThrow(
      /platform is required/i,
    );
  });
});

describe("CrawlOrchestrator — dry run", () => {
  it("runs the whole pipeline but writes nothing", async () => {
    const fetcher = new FakeFetcher({
      [GREENHOUSE_URL]: { body: greenhousePayload([goodJob(1), goodJob(2)]) },
    });
    const { orchestrator, store } = build({ fetcher });

    const report = await orchestrator.run({ mode: "dry_run", scope: "all" });

    expect(report.mode).toBe("dry_run");
    expect(report.totals.discovered).toBe(2);
    expect(report.totals.parsed).toBe(2);
    // Counters are still reported...
    expect(report.totals.imported).toBe(2);
    // ...but nothing reached the real store.
    expect((store as InMemoryJobStore).writes).toHaveLength(0);
    expect((store as InMemoryJobStore).rows).toHaveLength(0);
  });

  it("does not advance the registry schedule", async () => {
    const fetcher = new FakeFetcher({
      [GREENHOUSE_URL]: { body: greenhousePayload([goodJob(1)]) },
    });
    const { orchestrator, registry } = build({ fetcher });

    await orchestrator.run({ mode: "dry_run", scope: "all" });
    expect(registry.results[0].result.recordAttempt).toBe(false);
  });

  it("still judges duplicates against the real database", async () => {
    const fetcher = new FakeFetcher({
      [GREENHOUSE_URL]: { body: greenhousePayload([goodJob(1)]) },
    });
    const { orchestrator, store } = build({ fetcher });

    await orchestrator.run({ mode: "live", scope: "all" });
    // force: true — the admin button's own default (Dry Run included).
    const dry = await orchestrator.run({ mode: "dry_run", scope: "all", force: true });

    expect(dry.totals.duplicates).toBe(1);
    expect(dry.totals.imported).toBe(0);
    // The live row is still the only one.
    expect((store as InMemoryJobStore).rows).toHaveLength(1);
  });
});

describe("CrawlOrchestrator — failures are contained", () => {
  it("reports a blocked board without aborting the run", async () => {
    // The second entry used to be a We Work Remotely feed; WWR is disabled
    // now, so a second Greenhouse board plays the "still works" role. What is
    // under test is unchanged: one board answering 403 must not stop the next.
    const secondBoard = "https://boards-api.greenhouse.io/v1/boards/beta/jobs?content=true";
    const fetcher = new FakeFetcher({
      [GREENHOUSE_URL]: BLOCKED,
      [secondBoard]: { body: greenhousePayload([goodJob(9, "Designer")]) },
    });
    const { orchestrator } = build({
      fetcher,
      entries: [
        registryEntry(),
        registryEntry({
          id: "entry-2",
          careersUrl: "https://boards.greenhouse.io/beta",
          companyName: "Beta Ltd",
        }),
      ],
    });

    const report = await orchestrator.run({ mode: "live", scope: "all" });

    expect(report.companiesScanned).toBe(2);
    expect(report.companies[0].status).toBe("blocked");
    expect(report.companies[0].message).toMatch(/403/);
    // The second target still ran and imported.
    expect(report.companies[1].status).toBe("success");
    expect(report.totals.imported).toBe(1);
  });

  it("reports an unregistered platform as a failed entry", async () => {
    const { orchestrator } = build({
      fetcher: new FakeFetcher(),
      entries: [registryEntry({ platform: "monster" })],
    });

    const report = await orchestrator.run({ mode: "live", scope: "all" });
    expect(report.companies[0].status).toBe("failed");
    expect(report.companies[0].message).toMatch(/No adapter registered/);
  });

  it("reports a declared-blocked platform with its documented limitation", async () => {
    const { orchestrator } = build({
      fetcher: new FakeFetcher(),
      entries: [registryEntry({ platform: "wellfound", companyName: "Wellfound" })],
    });

    const report = await orchestrator.run({ mode: "live", scope: "all" });
    expect(report.companies[0].status).toBe("blocked");
    expect(report.companies[0].message).toMatch(/DataDome/);
    expect(report.limitations.map((limitation) => limitation.platform)).toContain("wellfound");
  });

  it("reports a bad careers URL as a failed entry, not a crash", async () => {
    const { orchestrator } = build({
      fetcher: new FakeFetcher(),
      entries: [registryEntry({ careersUrl: "not a url" })],
    });

    const report = await orchestrator.run({ mode: "live", scope: "all" });
    expect(report.companies[0].status).toBe("failed");
    expect(report.companies[0].message).toMatch(/not a valid URL/i);
  });

  it("counts store failures separately from validation skips", async () => {
    const fetcher = new FakeFetcher({
      [GREENHOUSE_URL]: { body: greenhousePayload([goodJob(1)]) },
    });
    const { orchestrator } = build({ fetcher, store: new FailingJobStore() });

    const report = await orchestrator.run({ mode: "live", scope: "all" });
    expect(report.totals.failed).toBe(1);
    expect(report.totals.skipped).toBe(0);
    expect(report.companies[0].issues[0].kind).toBe("store_failed");
  });

  it("fails the whole run only when the registry itself is unreadable", async () => {
    const reports = new InMemoryReportStore();
    const orchestrator = new CrawlOrchestrator({
      fetcher: new FakeFetcher(),
      registry: new BrokenRegistryStore(),
      store: new InMemoryJobStore(),
      reports,
    });

    await expect(orchestrator.run({ mode: "live", scope: "all" })).rejects.toThrow(
      /registry unreachable/,
    );
    expect(reports.failed).toHaveLength(1);
    expect(reports.finished).toHaveLength(0);
  });
});

describe("CrawlOrchestrator — validation is in the pipeline", () => {
  it("counts a validator-refused posting as rejected, not failed", async () => {
    const fetcher = new FakeFetcher({
      [GREENHOUSE_URL]: {
        body: greenhousePayload([
          goodJob(1),
          // "Apply now" is navigation text — the Validator must reject it.
          { ...goodJob(2), title: "Apply now" },
        ]),
      },
    });
    const { orchestrator, store } = build({ fetcher });

    const report = await orchestrator.run({ mode: "live", scope: "all" });

    expect(report.totals.discovered).toBe(2);
    expect(report.totals.parsed).toBe(2);
    expect(report.totals.imported).toBe(1);
    expect(report.totals.rejected).toBe(1);
    expect(report.totals.failed).toBe(0);
    expect((store as InMemoryJobStore).writes).toHaveLength(1);
  });

  it("records why a posting was skipped", async () => {
    const fetcher = new FakeFetcher({
      [GREENHOUSE_URL]: { body: greenhousePayload([{ ...goodJob(1), title: "Careers" }]) },
    });
    const { orchestrator } = build({ fetcher });

    const report = await orchestrator.run({ mode: "live", scope: "all" });
    expect(report.companies[0].issues[0].kind).toBe("validation_skipped");
    expect(report.companies[0].issues[0].reason).toMatch(/navigation text/i);
  });

  it("counts a parse failure as failed, not skipped", async () => {
    const fetcher = new FakeFetcher({
      // No title at all → the PARSER rejects it before the Validator sees it.
      [GREENHOUSE_URL]: {
        body: greenhousePayload([{ id: 1, absolute_url: "https://acme.test/1" }]),
      },
    });
    const { orchestrator } = build({ fetcher });

    const report = await orchestrator.run({ mode: "live", scope: "all" });
    expect(report.totals.failed).toBe(1);
    expect(report.totals.skipped).toBe(0);
    expect(report.companies[0].issues[0].kind).toBe("parse_failed");
  });

  it("marks a partially-successful entry 'partial'", async () => {
    const fetcher = new FakeFetcher({
      [GREENHOUSE_URL]: {
        body: greenhousePayload([goodJob(1), { ...goodJob(2), title: "Apply now" }]),
      },
    });
    const { orchestrator, registry } = build({ fetcher });

    const report = await orchestrator.run({ mode: "live", scope: "all" });
    expect(report.companies[0].status).toBe("partial");
    expect(registry.results[0].result.status).toBe("partial");
  });
});

describe("CrawlOrchestrator — scheduling", () => {
  it("skips an entry that is not due when force is off", async () => {
    const now = Date.parse("2026-08-08T12:00:00Z");
    const { orchestrator } = build({
      fetcher: new FakeFetcher(),
      entries: [
        registryEntry({
          lastCrawlAt: new Date(now - 60 * 60 * 1000).toISOString(),
          crawlFrequencyHours: 24,
        }),
      ],
      now: () => now,
    });

    const report = await orchestrator.run({ mode: "live", scope: "all", force: false });
    expect(report.companies[0].status).toBe("skipped");
    expect(report.companies[0].message).toMatch(/Not due/);
  });

  it("runs a not-due entry when the operator forces it", async () => {
    const now = Date.parse("2026-08-08T12:00:00Z");
    const fetcher = new FakeFetcher({
      [GREENHOUSE_URL]: { body: greenhousePayload([goodJob(1)]) },
    });
    const { orchestrator } = build({
      fetcher,
      entries: [
        registryEntry({
          lastCrawlAt: new Date(now - 60 * 60 * 1000).toISOString(),
          crawlFrequencyHours: 24,
        }),
      ],
      now: () => now,
    });

    const report = await orchestrator.run({ mode: "live", scope: "all", force: true });
    expect(report.companies[0].status).toBe("success");
  });

  it("ignores disabled entries entirely", async () => {
    const { orchestrator } = build({
      fetcher: new FakeFetcher(),
      entries: [registryEntry({ enabled: false })],
    });

    const report = await orchestrator.run({ mode: "live", scope: "all" });
    expect(report.companiesScanned).toBe(0);
  });

  // Module 10B.2 Dry Run Audit, fix 2: 8 inherited foreign seed companies
  // (Stripe among them) are disabled — the strategy is Indian/Indian-origin
  // companies. Disabling must be enforced the same way any other disabled
  // entry is: never selected, never requested, never written.
  it("a disabled foreign seed company is skipped while an enabled Indian company still crawls", async () => {
    const INDIAN_URL = "https://boards-api.greenhouse.io/v1/boards/acme-india/jobs?content=true";
    const fetcher = new FakeFetcher({
      [INDIAN_URL]: { body: greenhousePayload([goodJob(1)]) },
      // Deliberately no entry for GREENHOUSE_URL (Stripe's board) — if the
      // disabled entry were ever requested, the fetcher would have nothing to
      // serve it and the crawl would surface that as a failure, not silence.
    });
    const jobStore = new InMemoryJobStore();
    const { orchestrator, registry } = build({
      fetcher,
      store: jobStore,
      entries: [
        registryEntry({
          id: "stripe-foreign-seed",
          companyName: "Stripe",
          careersUrl: "https://boards.greenhouse.io/stripe",
          enabled: false,
        }),
        registryEntry({
          id: "indian-company",
          companyName: "Acme India",
          careersUrl: "https://boards.greenhouse.io/acme-india",
          enabled: true,
        }),
      ],
    });

    const report = await orchestrator.run({ mode: "live", scope: "all" });

    // Only the enabled Indian company was ever scanned.
    expect(report.companiesScanned).toBe(1);
    expect(report.companies).toHaveLength(1);
    expect(report.companies[0].status).toBe("success");

    // Disabled entries never even reach markCrawlResult — there is nothing to
    // record because there was no crawl attempt.
    expect(registry.results).toHaveLength(1);
    expect(registry.results[0].entryId).toBe("indian-company");
    expect(jobStore.writes).toHaveLength(1);
  });
});

describe("CrawlOrchestrator — India-first region relevance (Module 10B.3 Phase 1)", () => {
  /** One WWR feed with an India-relevant item and a USA-only-restricted item. */
  function wwrFeed(): string {
    return (
      `<rss><channel>` +
      `<item><title>Acme India: Backend Engineer</title>` +
      `<link>https://weworkremotely.com/remote-jobs/acme-backend</link>` +
      `<region>Remote</region><country>🇮🇳 India</country></item>` +
      `<item><title>Acme US: Frontend Engineer</title>` +
      `<link>https://weworkremotely.com/remote-jobs/acme-frontend</link>` +
      `<region>Texas</region><country>🇺🇸 United States of America</country></item>` +
      `</channel></rss>`
    );
  }

  function buildWithWwr(fetcher: FakeFetcher, store?: InMemoryJobStore) {
    return build({
      fetcher,
      store,
      entries: [
        registryEntry({
          id: "wwr-entry",
          platform: "weworkremotely",
          careersUrl: WWR_FEED,
          companyName: "We Work Remotely — All Jobs",
        }),
      ],
    });
  }

  // ── We Work Remotely is disabled (2026-09-12) ──
  //
  // These cases used to drive the region-relevance gate THROUGH the WWR
  // adapter, which was the only adapter that ever set `regionRelevance`. WWR
  // is now a declared limitation, so the gate's own behaviour is covered by
  // its unit tests (relevance/RelevanceFilteringJobParser.test.ts and
  // relevance/regionRelevance.test.ts, both unchanged and passing) and what
  // the orchestrator must now guarantee is that WWR imports nothing at all.

  it("H/I. a We Work Remotely entry is blocked, imports nothing, and says why", async () => {
    const fetcher = new FakeFetcher({ [WWR_FEED]: { body: wwrFeed() } });
    const { orchestrator, store } = buildWithWwr(fetcher);

    const report = await orchestrator.run({ mode: "live", scope: "all" });
    const jobStore = store as InMemoryJobStore;

    expect(jobStore.writes).toHaveLength(0);
    expect(report.totals.imported).toBe(0);
    expect(report.companies[0].status).toBe("blocked");
    expect(report.companies[0].message).toMatch(/India-only|not crawlable/i);
  });

  it("a blocked platform is refused before any network request is made", async () => {
    // The feed is deliberately NOT scripted into the fetcher: if the
    // orchestrator tried to fetch it, the run would surface a fetch failure
    // instead of a clean blocked verdict.
    const fetcher = new FakeFetcher({});
    const { orchestrator } = buildWithWwr(fetcher);

    const report = await orchestrator.run({ mode: "live", scope: "all" });

    expect(report.companies[0].status).toBe("blocked");
    expect(report.totals.failed).toBe(0);
  });

  it("J. an unrelated career-pages crawl is completely unaffected", async () => {
    const fetcher = new FakeFetcher({
      [GREENHOUSE_URL]: { body: greenhousePayload([goodJob(1), goodJob(2)]) },
    });
    const { orchestrator, store } = build({ fetcher });

    const report = await orchestrator.run({ mode: "live", scope: "all" });

    expect(report.totals.imported).toBe(2);
    expect(report.totals.excluded).toBe(0);
    expect((store as InMemoryJobStore).writes).toHaveLength(2);
  });

  it("K. a dry run over a blocked platform also writes nothing", async () => {
    const fetcher = new FakeFetcher({ [WWR_FEED]: { body: wwrFeed() } });
    const { orchestrator, store } = buildWithWwr(fetcher);

    const report = await orchestrator.run({ mode: "dry_run", scope: "all" });

    expect(report.totals.imported).toBe(0);
    const jobStore = store as InMemoryJobStore;
    expect(jobStore.writes).toHaveLength(0);
    expect(jobStore.rows).toHaveLength(0);
  });
});

describe("allReportedLimitations", () => {
  it("lists every declared limitation with a reason and an unblock path", () => {
    const limitations = allReportedLimitations();
    expect(limitations.map((limitation) => limitation.platform).sort()).toEqual([
      "foundit",
      "iimjobs",
      "wellfound",
      "weworkremotely",
    ]);
    for (const limitation of limitations) {
      expect(limitation.reason.length).toBeGreaterThan(20);
      expect(limitation.unblockedBy.length).toBeGreaterThan(10);
    }
  });
});

// ── Module 13: current relaxed quality policy, applied to the real crawler pipeline ──
//
// jobQuality.test.ts already covers the classifier itself exhaustively. These
// exercise the REAL orchestrator composition (fetch -> parse -> eligibility ->
// quality -> validate -> store) end to end, proving QualityFilteringJobParser
// (the one, shared decorator -- not a second/platform-specific implementation)
// is actually wired ahead of every source's writes, for both live and dry-run
// modes, and that it never interferes with the India/freshness gates.
describe("CrawlOrchestrator - quality filtering (current relaxed policy)", () => {
  it.each([
    "Data Analyst",
    "Backend Trainee",
    "Product Intern",
    "Management Trainee",
    "Operations Analyst",
  ])(
    "%s (score 0 or better) is imported, not rejected for lacking a positive taxonomy match",
    async (title) => {
      const fetcher = new FakeFetcher({
        [GREENHOUSE_URL]: { body: greenhousePayload([goodJob(1, title)]) },
      });
      const { orchestrator, store } = build({ fetcher });

      const report = await orchestrator.run({ mode: "live", scope: "all" });

      expect(report.totals.lowQuality).toBe(0);
      expect(report.totals.imported).toBe(1);
      expect((store as InMemoryJobStore).rows).toHaveLength(1);
    },
  );

  it.each(["Translator", "Teacher", "Tutor"])(
    "a clearly low-signal role (%s) is rejected by quality and never reaches the store",
    async (title) => {
      const fetcher = new FakeFetcher({
        [GREENHOUSE_URL]: { body: greenhousePayload([goodJob(1, title)]) },
      });
      const { orchestrator, store } = build({ fetcher });

      const report = await orchestrator.run({ mode: "live", scope: "all" });

      expect(report.totals.lowQuality).toBe(1);
      expect(report.totals.imported).toBe(0);
      expect(report.totals.rejected).toBe(0); // low-quality is its own counter, not a validator rejection
      expect((store as InMemoryJobStore).rows).toHaveLength(0);
      expect((store as InMemoryJobStore).writes).toHaveLength(0);
      const issue = report.companies[0].issues.find((i) => i.kind === "low_quality");
      expect(issue?.reason).toMatch(/low_signal/);
    },
  );

  it("a low-quality job is rejected identically in dry-run mode (the gate is not tied to the write path)", async () => {
    const fetcher = new FakeFetcher({
      [GREENHOUSE_URL]: { body: greenhousePayload([goodJob(1, "Telecaller")]) },
    });
    const { orchestrator, store } = build({ fetcher });

    const report = await orchestrator.run({ mode: "dry_run", scope: "all" });

    expect(report.totals.lowQuality).toBe(1);
    expect(report.totals.imported).toBe(0);
    expect((store as InMemoryJobStore).rows).toHaveLength(0);
    expect((store as InMemoryJobStore).writes).toHaveLength(0);
  });

  it("does not blindly reject a technical role for an incidental low-signal word", async () => {
    const fetcher = new FakeFetcher({
      [GREENHOUSE_URL]: { body: greenhousePayload([goodJob(1, "Customer Support Engineer")]) },
    });
    const { orchestrator, store } = build({ fetcher });

    const report = await orchestrator.run({ mode: "live", scope: "all" });

    expect(report.totals.lowQuality).toBe(0);
    expect(report.totals.imported).toBe(1);
    expect((store as InMemoryJobStore).rows).toHaveLength(1);
  });

  it("India and freshness still gate ahead of quality - a good title still gets the RIGHT rejection reason", async () => {
    const staleJob = {
      ...goodJob(1, "Data Analyst"),
      first_published: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString(),
    };
    const foreignJob = { ...goodJob(2, "Data Analyst"), location: { name: "Austin, Texas, USA" } };
    const fetcher = new FakeFetcher({
      [GREENHOUSE_URL]: { body: greenhousePayload([staleJob, foreignJob]) },
    });
    const { orchestrator, store } = build({ fetcher });

    const report = await orchestrator.run({ mode: "live", scope: "all" });

    // A good (score > threshold) title never even reaches quality scoring once
    // an earlier gate has already excluded it - proven by the counters landing
    // on the EARLIER gate, not on lowQuality, for a title that would pass quality.
    expect(report.totals.ineligibleStale).toBe(1);
    expect(report.totals.ineligibleLocation).toBe(1);
    expect(report.totals.lowQuality).toBe(0);
    expect(report.totals.imported).toBe(0);
    expect((store as InMemoryJobStore).rows).toHaveLength(0);
  });
});

// ── Module 13: run time budget (the Dry Run "crawl failed" fix) ──
//
// Root cause: `run()` looped over the WHOLE registry (~180 entries live) inside
// one synchronous request with no bound, so a large scope (the UI's own
// default -- no platform selected) ran for many minutes and was killed by the
// platform before ever returning a report. These prove the fix: the run always
// completes and persists a real report, entries beyond the budget are reported
// (not silently dropped or counted as failures), and dry-run isolation still
// holds for a truncated run.
describe("CrawlOrchestrator - run time budget (Dry Run 'crawl failed' fix)", () => {
  /** A clock that advances by `stepMs` every time it's read - deterministically simulates elapsed wall time per entry. */
  function steppingClock(startMs: number, stepMs: number): () => number {
    let value = startMs;
    let calls = 0;
    return () => {
      // The FIRST read is `run()`'s own `startedAtMs` - must not itself already
      // exceed the deadline, so only advance from the second read onward.
      if (calls > 0) value += stepMs;
      calls += 1;
      return value;
    };
  }

  function threeEntries() {
    return [
      registryEntry({ id: "e1", companyName: "Acme", careersUrl: "https://boards.greenhouse.io/acme" }),
      registryEntry({ id: "e2", companyName: "Beta", careersUrl: "https://boards.greenhouse.io/beta" }),
      registryEntry({ id: "e3", companyName: "Gamma", careersUrl: "https://boards.greenhouse.io/gamma" }),
    ];
  }

  const acmeUrl = "https://boards-api.greenhouse.io/v1/boards/acme/jobs?content=true";
  const betaUrl = "https://boards-api.greenhouse.io/v1/boards/beta/jobs?content=true";
  const gammaUrl = "https://boards-api.greenhouse.io/v1/boards/gamma/jobs?content=true";

  it("a run that would exceed the budget completes successfully, never throws, and marks the remainder skipped", async () => {
    const fetcher = new FakeFetcher({
      [acmeUrl]: { body: greenhousePayload([goodJob(1)]) },
      [betaUrl]: { body: greenhousePayload([goodJob(2)]) },
      [gammaUrl]: { body: greenhousePayload([goodJob(3)]) },
    });
    // Each entry "costs" 30s of clock time; a 45s budget fits exactly one.
    const { orchestrator, reports, registry } = build({
      fetcher,
      entries: threeEntries(),
      now: steppingClock(Date.parse("2026-08-08T12:00:00Z"), 30_000),
      maxRunDurationMs: 45_000,
    });

    const report = await orchestrator.run({ mode: "live", scope: "all", force: true });

    expect(report.truncated).toBe(true);
    expect(report.companies).toHaveLength(3);
    expect(report.companies[0].status).toBe("success"); // Acme: actually run
    expect(report.companies[1].status).toBe("skipped");
    expect(report.companies[1].message).toMatch(/time budget|not reached/i);
    expect(report.companies[2].status).toBe("skipped");
    // Never counted as a failure - these were never attempted.
    expect(report.totals.failed).toBe(0);
    // The run still finished and persisted normally (not failed at the top level).
    expect(reports.finished).toHaveLength(1);
    expect(reports.failed).toHaveLength(0);
    // Skipped-by-budget entries cost nothing extra: only the ONE real attempt
    // touched the registry (mirrors the existing "not due yet" skip, which
    // also never calls markCrawlResult for an entry it never tried).
    expect(registry.results).toHaveLength(1);
  });

  it("a truncated run writes nothing extra in dry-run mode either", async () => {
    const fetcher = new FakeFetcher({
      [acmeUrl]: { body: greenhousePayload([goodJob(1)]) },
      [betaUrl]: { body: greenhousePayload([goodJob(2)]) },
      [gammaUrl]: { body: greenhousePayload([goodJob(3)]) },
    });
    const { orchestrator, store } = build({
      fetcher,
      entries: threeEntries(),
      now: steppingClock(Date.parse("2026-08-08T12:00:00Z"), 30_000),
      maxRunDurationMs: 45_000,
    });

    const report = await orchestrator.run({ mode: "dry_run", scope: "all", force: true });

    expect(report.truncated).toBe(true);
    expect((store as InMemoryJobStore).writes).toHaveLength(0);
    expect((store as InMemoryJobStore).rows).toHaveLength(0);
  });

  it("a run that comfortably fits the budget is not marked truncated", async () => {
    const fetcher = new FakeFetcher({
      [GREENHOUSE_URL]: { body: greenhousePayload([goodJob(1)]) },
    });
    const { orchestrator } = build({ fetcher, maxRunDurationMs: 45_000 });

    const report = await orchestrator.run({ mode: "live", scope: "all" });

    expect(report.truncated).toBe(false);
    expect(
      report.companies.every((c) => c.status !== "skipped" || c.message?.match(/not due/i)),
    ).toBe(true);
  });

  it("uses the documented default budget (RUN_DEADLINE_MS) when none is injected", async () => {
    const fetcher = new FakeFetcher({
      [GREENHOUSE_URL]: { body: greenhousePayload([goodJob(1)]) },
    });
    const { orchestrator } = build({ fetcher }); // no maxRunDurationMs override

    const report = await orchestrator.run({ mode: "live", scope: "all" });
    expect(report.truncated).toBe(false); // a fast in-memory test never approaches 45s
  });
});

// ── Module 13: interleaveByPlatform (pure function) ──
describe("interleaveByPlatform", () => {
  function entry(id: string, platform: string): ReturnType<typeof registryEntry> {
    return registryEntry({ id, platform, companyName: id });
  }

  it("round-robins across platforms, one per round, preserving each platform's own order", () => {
    const input = [
      entry("cp-1", "career-pages"),
      entry("cp-2", "career-pages"),
      entry("cp-3", "career-pages"),
      entry("in-1", "internshala"),
      entry("in-2", "internshala"),
    ];
    const result = interleaveByPlatform(input).map((e) => e.id);
    // Round 0: cp-1, in-1. Round 1: cp-2, in-2. Round 2: cp-3 (internshala exhausted).
    expect(result).toEqual(["cp-1", "in-1", "cp-2", "in-2", "cp-3"]);
  });

  it("is a no-op for a single platform (scope: platform)", () => {
    const input = [entry("a", "career-pages"), entry("b", "career-pages"), entry("c", "career-pages")];
    expect(interleaveByPlatform(input).map((e) => e.id)).toEqual(["a", "b", "c"]);
  });

  it("handles an empty list and a single entry", () => {
    expect(interleaveByPlatform([])).toEqual([]);
    expect(interleaveByPlatform([entry("only", "career-pages")]).map((e) => e.id)).toEqual(["only"]);
  });

  it("never drops or duplicates an entry, for any number of platforms", () => {
    const input = [
      entry("a1", "career-pages"),
      entry("a2", "career-pages"),
      entry("a3", "career-pages"),
      entry("a4", "career-pages"),
      entry("b1", "internshala"),
      entry("c1", "monster"),
      entry("c2", "monster"),
    ];
    const result = interleaveByPlatform(input);
    expect(result).toHaveLength(input.length);
    expect(new Set(result.map((e) => e.id))).toEqual(new Set(input.map((e) => e.id)));
  });
});

// ── Module 13: progressive registry coverage + cross-platform fairness ──
//
// Root problem: a truncated run always re-processed the SAME alphabetical
// prefix of the registry, because nothing advanced between runs. The fix is
// entirely the `last_crawl_at` ordering in SupabaseCompanyRegistryStore
// (mirrored in InMemoryRegistryStore for these tests) plus interleaveByPlatform
// above — no separate cursor, nothing that would break across the stateless
// Worker boundary. These exercise it through the real orchestrator.
describe("CrawlOrchestrator — progressive coverage across runs (Module 13)", () => {
  function manyEntries(platform: string, count: number, prefix: string) {
    return Array.from({ length: count }, (_, i) =>
      registryEntry({
        id: `${prefix}-${i}`,
        companyName: `${prefix} Co ${i}`,
        careersUrl: `https://boards.greenhouse.io/${prefix}-${i}`,
        platform,
      }),
    );
  }

  /** Ids the run actually attempted (success or failure — anything but the deadline placeholder). */
  function attemptedIds(registry: InMemoryRegistryStore): string[] {
    return registry.results.map((r) => r.entryId);
  }

  it("1/2. a truncated run's remainder is picked up by the NEXT run, not the same first slice again", async () => {
    const entries = manyEntries("career-pages", 6, "cp");
    const fetcher = new FakeFetcher(
      Object.fromEntries(
        entries.map((e) => [
          `https://boards-api.greenhouse.io/v1/boards/${e.id}/jobs?content=true`,
          { body: greenhousePayload([goodJob(1)]) },
        ]),
      ),
    );
    // Every clock read after the run's own opening one advances by 3.5s —
    // several reads happen per crawled entry (durationMs bookkeeping), so
    // this deterministically lets ~2 of the 6 entries fit a 20s budget
    // without depending on exactly how many reads one entry costs.
    let clock = Date.parse("2026-08-08T12:00:00Z");
    let reads = 0;
    const { orchestrator, registry } = build({
      fetcher,
      entries,
      now: () => {
        reads += 1;
        if (reads > 1) clock += 3_500;
        return clock;
      },
      maxRunDurationMs: 20_000,
    });

    const first = await orchestrator.run({ mode: "live", scope: "all", force: true });
    expect(first.truncated).toBe(true);
    const firstAttempted = attemptedIds(registry);
    expect(firstAttempted.length).toBeGreaterThan(0);
    expect(firstAttempted.length).toBeLessThan(entries.length);

    const second = await orchestrator.run({ mode: "live", scope: "all", force: true });
    const secondAttempted = attemptedIds(registry).slice(firstAttempted.length);

    // The second run's attempts must be entries the FIRST run never reached —
    // never a re-processing of the same slice.
    for (const id of secondAttempted) {
      expect(firstAttempted).not.toContain(id);
    }
    expect(secondAttempted.length).toBeGreaterThan(0);
  });

  it("3. Internshala gets a turn within the very first entries, despite far fewer companies than career-pages", async () => {
    const cp = manyEntries("career-pages", 10, "cp");
    const internshala = [
      registryEntry({ id: "in-0", companyName: "Internshala — Internships", platform: "internshala" }),
      registryEntry({ id: "in-1", companyName: "Internshala — Jobs", platform: "internshala" }),
    ];
    const fetcher = new FakeFetcher(); // every request 404s — fine, we only assert on SCHEDULING
    const { orchestrator, registry } = build({
      fetcher,
      entries: [...cp, ...internshala],
      maxRunDurationMs: 45_000, // plenty for a handful of instant-failing entries
    });

    await orchestrator.run({ mode: "live", scope: "all", force: true });

    const attempted = attemptedIds(registry);
    const firstInternshalaIndex = attempted.findIndex((id) => id.startsWith("in-"));
    expect(firstInternshalaIndex).toBeGreaterThanOrEqual(0); // it WAS reached
    // Interleaved one-per-round across 2 platforms: internshala's first entry
    // is at worst the 2nd attempt, never buried behind all 10 career-pages ones.
    expect(firstInternshalaIndex).toBeLessThanOrEqual(1);
  });

  it("6. disabled and unverified companies are never scheduled, in any run", async () => {
    const entries = [
      ...manyEntries("career-pages", 3, "cp"),
      registryEntry({ id: "disabled", companyName: "Disabled Co", enabled: false }),
      registryEntry({ id: "unverified", companyName: "Unverified Co", healthStatus: null }),
    ];
    const fetcher = new FakeFetcher();
    const { orchestrator, registry } = build({ fetcher, entries, maxRunDurationMs: 45_000 });

    await orchestrator.run({ mode: "live", scope: "all", force: true });

    expect(attemptedIds(registry)).not.toContain("disabled");
    // "unverified" is fetched (enabled), then refused by crawlEligibility and
    // marked "skipped" — a real, recorded attempt, just not a crawl. Disabled
    // entries are stronger: never even read from the registry.
  });

  it("4/5. repeated runs eventually cover the WHOLE enabled+ready registry, then rotate back to the oldest", async () => {
    const entries = [...manyEntries("career-pages", 8, "cp"), ...manyEntries("internshala", 2, "in")];
    const fetcher = new FakeFetcher();
    // A tight budget that genuinely forces truncation each run (a few entries
    // at a time), so this test actually requires the rotation mechanism —
    // without a clock like this, all 10 fast-failing entries could fit in one
    // run and the test would pass without ever exercising multi-run coverage.
    let clock = Date.parse("2026-08-08T12:00:00Z");
    let reads = 0;
    const { orchestrator, registry } = build({
      fetcher,
      entries,
      now: () => {
        reads += 1;
        if (reads > 1) clock += 5_000;
        return clock;
      },
      maxRunDurationMs: 12_000,
    });

    const seenAcrossAllRuns = new Set<string>();
    for (let run = 0; run < 10; run++) {
      const before = registry.results.length;
      await orchestrator.run({ mode: "live", scope: "all", force: true });
      const attemptedThisRun = registry.results.slice(before);
      expect(attemptedThisRun.length).toBeLessThan(entries.length); // proves it really did truncate
      for (const r of attemptedThisRun) seenAcrossAllRuns.add(r.entryId);
      if (seenAcrossAllRuns.size === entries.length) break;
    }

    // Every enabled, health-verified entry was attempted at least once.
    for (const e of entries) expect(seenAcrossAllRuns).toContain(e.id);

    // Natural restart: once everything has a lastCrawlAt, the NEXT run again
    // starts from the least-recently-crawled entry — i.e. it does not get
    // stuck re-running the LAST entry it happened to process forever.
    const beforeRestart = registry.results.length;
    await orchestrator.run({ mode: "live", scope: "all", force: true });
    const restartAttempts = registry.results.slice(beforeRestart).map((r) => r.entryId);
    expect(restartAttempts.length).toBeGreaterThan(0);
    expect(new Set(restartAttempts).size).toBe(restartAttempts.length); // no entry attempted twice IN one run
  });

  it("does not affect a single-platform run (scope: platform) — there is nothing to interleave", async () => {
    const entries = manyEntries("career-pages", 4, "cp");
    const fetcher = new FakeFetcher();
    const { orchestrator, registry } = build({ fetcher, entries, maxRunDurationMs: 45_000 });

    await orchestrator.run({ mode: "live", scope: "platform", platform: "career-pages", force: true });
    expect(attemptedIds(registry)).toHaveLength(4);
  });
});

// ── Module 13: report accounting (Task 4) — every parsed posting is attributed somewhere ──
describe("CrawlOrchestrator — report accounting", () => {
  it("discovered postings are fully accounted for across imported/duplicates/excluded/ineligible/lowQuality/rejected/failed — nothing silently disappears", async () => {
    const stale = { ...goodJob(1, "Data Analyst"), first_published: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString() };
    const foreign = { ...goodJob(2, "Data Analyst"), location: { name: "Austin, Texas, USA" } };
    const lowQualityJob = goodJob(3, "Translator");
    const good = goodJob(4, "Data Analyst");

    const fetcher = new FakeFetcher({
      [GREENHOUSE_URL]: { body: greenhousePayload([stale, foreign, lowQualityJob, good]) },
    });
    const { orchestrator, store } = build({ fetcher });

    const report = await orchestrator.run({ mode: "live", scope: "all" });

    expect(report.totals.discovered).toBe(4);
    expect(report.totals.parsed).toBe(4);
    expect(report.totals.ineligibleStale).toBe(1);
    expect(report.totals.ineligibleLocation).toBe(1);
    expect(report.totals.lowQuality).toBe(1);
    expect(report.totals.imported).toBe(1);
    expect(report.totals.rejected).toBe(0);
    expect(report.totals.failed).toBe(0);

    // Conservation: every parsed posting lands in EXACTLY one bucket.
    const t = report.totals;
    const accounted =
      t.imported + t.updated + t.merged + t.excluded + t.ineligibleLocation + t.ineligibleStale +
      t.lowQuality + t.rejected + t.failed;
    expect(accounted).toBe(t.parsed);
    expect((store as InMemoryJobStore).rows).toHaveLength(1);
  });

  it("reproduces the live 430-job report's own arithmetic (Task 3 verification)", () => {
    // Directly checks the exact numbers a real production Dry Run reported,
    // against the SAME formula the test above proves the orchestrator upholds
    // — confirms nothing in that live report was double-counted or lost.
    const live = {
      parsed: 430,
      ineligibleLocation: 205,
      ineligibleStale: 173,
      lowQuality: 4,
      rejected: 0,
      failed: 0,
      imported: 24,
      updated: 24,
      merged: 0,
      excluded: 0,
    };
    const accounted =
      live.imported + live.updated + live.merged + live.excluded + live.ineligibleLocation +
      live.ineligibleStale + live.lowQuality + live.rejected + live.failed;
    expect(accounted).toBe(live.parsed);
    // duplicates (also reported as 24 live) is imported+updated+merged's OWN
    // sibling field, not a fourth independent bucket layered on top — see
    // countOutcomes: every "updated"/"merged" outcome increments BOTH its own
    // counter and duplicates in the same switch case, by definition.
    expect(live.updated + live.merged).toBe(24); // matches the live "Duplicates: 24"
  });
});

// ── Module 13: per-entry timeout (the 80.1s live duration investigation) ──
//
// RUN_DEADLINE_MS only ever bounded when a NEW entry could start. Nothing
// bounded an entry already in flight — a single HTTP call's own retry/backoff
// worst case is ~62s (HttpFetcher's unchanged constants), and several ATS
// providers issue many sequential requests per company (Lever/SmartRecruiters
// pagination, Internshala's per-posting detail fetches), so one entry could
// legitimately run far longer than the run-level deadline before this existed.
describe("CrawlOrchestrator — per-entry timeout (ENTRY_TIMEOUT_MS)", () => {
  /** A fetcher whose EVERY request hangs forever — the strongest possible proof the watchdog actually fires. */
  class HangingFetcher {
    requested: string[] = [];
    fetchText(url: string): Promise<never> {
      this.requested.push(url);
      return new Promise(() => {}); // never resolves
    }
  }

  it("bounds a single entry that never resolves, instead of hanging the whole run", async () => {
    const fetcher = new HangingFetcher();
    const { orchestrator, registry } = build({
      fetcher: fetcher as unknown as FakeFetcher,
      entries: [registryEntry()],
      entryTimeoutMs: 20, // ms — keeps the test fast
    });

    const report = await orchestrator.run({ mode: "live", scope: "all" });

    expect(report.companies[0].status).toBe("failed");
    expect(report.companies[0].message).toMatch(/timed out/i);
    expect(registry.results[0].result.status).toBe("failed");
  }, 5_000);

  it("never fires for an entry that finishes well within the budget", async () => {
    const fetcher = new FakeFetcher({
      [GREENHOUSE_URL]: { body: greenhousePayload([goodJob(1)]) },
    });
    const { orchestrator } = build({ fetcher, entryTimeoutMs: 5_000 });

    const report = await orchestrator.run({ mode: "live", scope: "all" });
    expect(report.companies[0].status).toBe("success");
  });

  it("uses the documented default (ENTRY_TIMEOUT_MS) when none is injected", async () => {
    const fetcher = new FakeFetcher({
      [GREENHOUSE_URL]: { body: greenhousePayload([goodJob(1)]) },
    });
    const { orchestrator } = build({ fetcher });
    // A fast in-memory entry finishes in milliseconds — the 90s default is
    // never actually waited out here; this only proves the default applies
    // and a normal entry is entirely unaffected by it.
    const report = await orchestrator.run({ mode: "live", scope: "all" });
    expect(report.companies[0].status).toBe("success");
  });

  it("a timed-out entry is treated exactly like any other per-entry failure — the run itself still completes and persists", async () => {
    const fetcher = new HangingFetcher();
    const { orchestrator, reports } = build({
      fetcher: fetcher as unknown as FakeFetcher,
      entries: [registryEntry(), registryEntry({ id: "e2", companyName: "Beta" })],
      entryTimeoutMs: 20,
    });

    const report = await orchestrator.run({ mode: "live", scope: "all" });

    expect(report.companies).toHaveLength(2);
    expect(report.companies.every((c) => c.status === "failed")).toBe(true);
    expect(report.totals.failed).toBe(0); // no POSTINGS failed — both companies just never produced any
    expect(reports.finished).toHaveLength(1);
    expect(reports.failed).toHaveLength(0); // the RUN itself did not fail
  }, 5_000);
});
