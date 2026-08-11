import { describe, expect, it } from "vitest";
import { BLOCKED, FakeFetcher } from "../testing/fakeFetcher";
import { InMemoryRegistryStore, InMemoryVerificationStore, registryEntry } from "../testing/fakes";
import { rollupHealth } from "../registry/CompanyRegistry";
import { SourceHealthService, summarizeHealthReport } from "./SourceHealthService";

const GH_API = (slug: string) =>
  `https://boards-api.greenhouse.io/v1/boards/${slug}/jobs?content=true`;

function json(payload: unknown) {
  return { body: JSON.stringify(payload), contentType: "application/json" };
}

function build(options: { fetcher: FakeFetcher; entries?: ReturnType<typeof registryEntry>[] }) {
  const registry = new InMemoryRegistryStore(options.entries ?? [registryEntry()]);
  const runs = new InMemoryVerificationStore();
  const service = new SourceHealthService({ fetcher: options.fetcher, registry, runs });
  return { service, registry, runs };
}

describe("SourceHealthService.sweep", () => {
  it("verifies every entry and rolls the results up", async () => {
    const fetcher = new FakeFetcher({
      [GH_API("a")]: json({ jobs: [{ id: 1 }] }),
      [GH_API("b")]: BLOCKED,
    });
    const { service } = build({
      fetcher,
      entries: [
        registryEntry({ id: "1", companyName: "A", careersUrl: "https://boards.greenhouse.io/a" }),
        registryEntry({ id: "2", companyName: "B", careersUrl: "https://boards.greenhouse.io/b" }),
      ],
    });

    const report = await service.sweep();

    expect(report.sourcesChecked).toBe(2);
    expect(report.rollup.HEALTHY).toBe(1);
    expect(report.rollup.BLOCKED).toBe(1);
    expect(report.entries.map((entry) => entry.companyName)).toEqual(["A", "B"]);
  });

  it("writes the verdict back onto each registry entry", async () => {
    const fetcher = new FakeFetcher({ [GH_API("a")]: json({ jobs: [{ id: 1 }, { id: 2 }] }) });
    const { service, registry } = build({
      fetcher,
      entries: [registryEntry({ id: "1", careersUrl: "https://boards.greenhouse.io/a" })],
    });

    await service.sweep();

    expect(registry.verifications).toHaveLength(1);
    expect(registry.verifications[0].verification.health).toBe("HEALTHY");
    expect(registry.verifications[0].verification.detectedPlatform).toBe("greenhouse");
    expect(registry.verifications[0].verification.postingsSeen).toBe(2);
  });

  it("imports nothing — a sweep only reads", async () => {
    // The service is constructed with no JobIntelligenceStore at all, so it is
    // structurally incapable of writing a job. This test documents that.
    const fetcher = new FakeFetcher({ [GH_API("a")]: json({ jobs: [{ id: 1 }] }) });
    const { service } = build({
      fetcher,
      entries: [registryEntry({ careersUrl: "https://boards.greenhouse.io/a" })],
    });
    const report = await service.sweep();
    expect(report).not.toHaveProperty("imported");
  });

  it("records the run as its own verification run, not a crawl", async () => {
    const fetcher = new FakeFetcher({ [GH_API("a")]: json({ jobs: [] }) });
    const { service, runs } = build({
      fetcher,
      entries: [registryEntry({ careersUrl: "https://boards.greenhouse.io/a" })],
    });

    await service.sweep({ triggeredBy: "admin@acme.test" });

    expect(runs.started).toEqual([{ triggeredBy: "admin@acme.test" }]);
    expect(runs.finished).toHaveLength(1);
    expect(runs.finished[0].report.sourcesChecked).toBe(1);
  });

  it("keeps going when one source is pathological", async () => {
    const fetcher = new FakeFetcher({
      [GH_API("a")]: json({ jobs: [{ id: 1 }] }),
      // "b" has no scripted response at all → 404 from the fake.
      [GH_API("c")]: json({ jobs: [{ id: 2 }] }),
    });
    const { service } = build({
      fetcher,
      entries: [
        registryEntry({ id: "1", careersUrl: "https://boards.greenhouse.io/a" }),
        registryEntry({ id: "2", careersUrl: "https://boards.greenhouse.io/b" }),
        registryEntry({ id: "3", careersUrl: "https://boards.greenhouse.io/c" }),
      ],
    });

    const report = await service.sweep();
    expect(report.sourcesChecked).toBe(3);
    expect(report.rollup.HEALTHY).toBe(2);
    expect(report.rollup.BROKEN).toBe(1);
  });

  it("does not lose the rest of the sweep when a health write fails", async () => {
    const fetcher = new FakeFetcher({
      [GH_API("a")]: json({ jobs: [{ id: 1 }] }),
      [GH_API("b")]: json({ jobs: [{ id: 2 }] }),
    });
    const registry = new InMemoryRegistryStore([
      registryEntry({ id: "1", careersUrl: "https://boards.greenhouse.io/a" }),
      registryEntry({ id: "2", careersUrl: "https://boards.greenhouse.io/b" }),
    ]);
    registry.markVerification = async (entryId) => {
      if (entryId === "1") throw new Error("write failed");
    };

    const service = new SourceHealthService({
      fetcher,
      registry,
      runs: new InMemoryVerificationStore(),
    });

    const report = await service.sweep();
    expect(report.sourcesChecked).toBe(2);
    expect(report.entries[0].message).toMatch(/Could not save health/);
    // The second entry was still verified.
    expect(report.entries[1].health).toBe("HEALTHY");
  });

  it("suggests the new URL when a source moved", async () => {
    const page = "https://acme.test/careers";
    const fetcher = new FakeFetcher({
      [page]: {
        body: `<a href="https://boards.greenhouse.io/acme">jobs</a>`,
        contentType: "text/html",
      },
      [GH_API("acme")]: json({ jobs: [{ id: 1 }] }),
    });
    const { service } = build({ fetcher, entries: [registryEntry({ careersUrl: page })] });

    const report = await service.sweep();
    expect(report.entries[0].health).toBe("REDIRECTED");
    expect(report.entries[0].suggestedUrl).toBe("https://boards.greenhouse.io/acme");
  });

  it("never suggests a URL for a source that is not working", async () => {
    const fetcher = new FakeFetcher({ [GH_API("a")]: BLOCKED });
    const { service } = build({
      fetcher,
      entries: [registryEntry({ careersUrl: "https://boards.greenhouse.io/a" })],
    });
    const report = await service.sweep();
    expect(report.entries[0].suggestedUrl).toBeNull();
  });

  it("narrows to one platform", async () => {
    const feed = "https://weworkremotely.com/remote-jobs.rss";
    const fetcher = new FakeFetcher({
      [GH_API("a")]: json({ jobs: [{ id: 1 }] }),
      [feed]: { body: "<rss><channel></channel></rss>", contentType: "application/rss+xml" },
    });
    const { service } = build({
      fetcher,
      entries: [
        registryEntry({ id: "1", careersUrl: "https://boards.greenhouse.io/a" }),
        registryEntry({ id: "2", platform: "weworkremotely", careersUrl: feed }),
      ],
    });

    const report = await service.sweep({ platform: "weworkremotely" });
    expect(report.sourcesChecked).toBe(1);
    expect(report.entries[0].platform).toBe("weworkremotely");
  });

  // Module 10B.2 Dry Run Audit, fix 3: WWR was previously misreported UNKNOWN
  // because the sweep never told the verifier which entries are RSS feeds.
  it("a healthy We Work Remotely registry entry verifies HEALTHY end-to-end", async () => {
    const feed = "https://weworkremotely.com/remote-jobs.rss";
    const fetcher = new FakeFetcher({
      [feed]: {
        body:
          `<rss><channel>` +
          `<item><title>Acme: Backend Engineer</title><link>https://weworkremotely.com/remote-jobs/acme-1</link></item>` +
          `<item><title>Acme: Frontend Engineer</title><link>https://weworkremotely.com/remote-jobs/acme-2</link></item>` +
          `</channel></rss>`,
        contentType: "application/rss+xml",
      },
    });
    const { service, registry } = build({
      fetcher,
      entries: [
        registryEntry({
          id: "wwr-1",
          companyName: "We Work Remotely — All Jobs",
          platform: "weworkremotely",
          careersUrl: feed,
        }),
      ],
    });

    const report = await service.sweep();

    expect(report.entries[0].health).toBe("HEALTHY");
    expect(report.entries[0].detectedPlatform).toBe("weworkremotely");
    expect(report.entries[0].postingsSeen).toBe(2);
    expect(registry.verifications[0].verification.health).toBe("HEALTHY");
  });

  it("records the failure when the registry itself is unreadable", async () => {
    const runs = new InMemoryVerificationStore();
    const registry = new InMemoryRegistryStore([]);
    registry.listEntries = async () => {
      throw new Error("registry unreachable");
    };
    const service = new SourceHealthService({ fetcher: new FakeFetcher(), registry, runs });

    await expect(service.sweep()).rejects.toThrow(/registry unreachable/);
    expect(runs.failed).toHaveLength(1);
    expect(runs.finished).toHaveLength(0);
  });

  it("reports a blocked platform from evidence without a request", async () => {
    const fetcher = new FakeFetcher();
    const { service } = build({
      fetcher,
      entries: [registryEntry({ platform: "wellfound", careersUrl: "https://wellfound.com/jobs" })],
    });

    const report = await service.sweep();
    expect(report.entries[0].health).toBe("BLOCKED");
    expect(fetcher.requested).toHaveLength(0);
  });
});

describe("rollupHealth", () => {
  it("counts never-verified entries as UNCHECKED, not UNKNOWN", () => {
    const rollup = rollupHealth([
      registryEntry({ healthStatus: "HEALTHY" }),
      registryEntry({ healthStatus: null }),
      registryEntry({ healthStatus: "UNKNOWN" }),
    ]);
    expect(rollup.HEALTHY).toBe(1);
    expect(rollup.UNCHECKED).toBe(1);
    expect(rollup.UNKNOWN).toBe(1);
  });

  it("returns all zeroes for an empty registry", () => {
    expect(rollupHealth([])).toEqual({
      HEALTHY: 0,
      REDIRECTED: 0,
      BLOCKED: 0,
      BROKEN: 0,
      UNAVAILABLE: 0,
      UNKNOWN: 0,
      UNCHECKED: 0,
    });
  });
});

describe("summarizeHealthReport", () => {
  it("renders one readable line", async () => {
    const fetcher = new FakeFetcher({ [GH_API("a")]: json({ jobs: [{ id: 1 }] }) });
    const { service } = build({
      fetcher,
      entries: [registryEntry({ careersUrl: "https://boards.greenhouse.io/a" })],
    });
    const report = await service.sweep();
    expect(summarizeHealthReport(report)).toMatch(
      /Checked 1 source\(s\): 1 healthy, 0 redirected, 0 blocked, 0 broken/,
    );
  });
});
