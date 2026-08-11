import { describe, expect, it } from "vitest";
import { CrawlOrchestrator, allReportedLimitations } from "./CrawlOrchestrator";
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
    first_published: "2026-08-01T00:00:00Z",
    location: { name: "Berlin, Germany" },
    content: "&lt;p&gt;Do the work.&lt;/p&gt;",
  };
}

/** Wires an orchestrator over in-memory collaborators. */
function build(options: {
  fetcher: FakeFetcher;
  entries?: ReturnType<typeof registryEntry>[];
  store?: InMemoryJobStore | FailingJobStore;
  now?: () => number;
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
    const second = await orchestrator.run({ mode: "live", scope: "all" });

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
    const dry = await orchestrator.run({ mode: "dry_run", scope: "all" });

    expect(dry.totals.duplicates).toBe(1);
    expect(dry.totals.imported).toBe(0);
    // The live row is still the only one.
    expect((store as InMemoryJobStore).rows).toHaveLength(1);
  });
});

describe("CrawlOrchestrator — failures are contained", () => {
  it("reports a blocked board without aborting the run", async () => {
    const fetcher = new FakeFetcher({
      [GREENHOUSE_URL]: BLOCKED,
      [WWR_FEED]: {
        body: `<rss><channel><item><title>Beta Ltd: Designer</title><link>https://weworkremotely.com/remote-jobs/beta-designer</link><type>Full-Time</type></item></channel></rss>`,
      },
    });
    const { orchestrator } = build({
      fetcher,
      entries: [
        registryEntry(),
        registryEntry({
          id: "entry-2",
          platform: "weworkremotely",
          careersUrl: WWR_FEED,
          companyName: "WWR",
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

describe("allReportedLimitations", () => {
  it("lists every declared limitation with a reason and an unblock path", () => {
    const limitations = allReportedLimitations();
    expect(limitations.map((limitation) => limitation.platform).sort()).toEqual([
      "foundit",
      "iimjobs",
      "wellfound",
    ]);
    for (const limitation of limitations) {
      expect(limitation.reason.length).toBeGreaterThan(20);
      expect(limitation.unblockedBy.length).toBeGreaterThan(10);
    }
  });
});
