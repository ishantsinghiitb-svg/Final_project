// ── Module 10B.2: crawl safety ──
//
// The rule: a crawl that goes wrong must never cost us jobs we already have.
//
// The architecture makes this structural rather than defensive. Ageing is
// PASSIVE — `last_seen_at` is only ever advanced, one job at a time, by a
// successful write. Nothing anywhere marks jobs inactive in bulk, so there is
// no code path a 0-job response, a 5xx, a timeout or a half-finished
// pagination could take to wipe a source's jobs. These tests pin that down, so
// a future "tidy up jobs we didn't see this run" optimisation cannot be added
// without failing here first.

import { describe, expect, it } from "vitest";
import { CrawlOrchestrator } from "./CrawlOrchestrator";
import { BLOCKED, FakeFetcher } from "./testing/fakeFetcher";
import {
  InMemoryJobStore,
  InMemoryRegistryStore,
  InMemoryReportStore,
  registryEntry,
} from "./testing/fakes";

const GH_URL = "https://boards-api.greenhouse.io/v1/boards/acme/jobs?content=true";
const recentIso = () => new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString();

function json(payload: unknown) {
  return { body: JSON.stringify(payload), contentType: "application/json" };
}

function job(id: number) {
  return {
    id,
    title: `Engineer ${id}`,
    absolute_url: `https://acme.test/jobs/${id}`,
    company_name: "Acme",
    first_published: recentIso(),
    location: { name: "Pune, India" },
    content: "&lt;p&gt;Work.&lt;/p&gt;",
  };
}

function build(fetcher: FakeFetcher, store = new InMemoryJobStore()) {
  const registry = new InMemoryRegistryStore([
    registryEntry({ careersUrl: "https://boards.greenhouse.io/acme", healthStatus: "HEALTHY" }),
  ]);
  const orchestrator = new CrawlOrchestrator({
    fetcher,
    registry,
    store,
    reports: new InMemoryReportStore(),
  });
  return { orchestrator, registry, store };
}

/** Seeds the store by running one good crawl, then returns the store. */
async function seedWithGoodCrawl(store: InMemoryJobStore) {
  const good = new FakeFetcher({ [GH_URL]: json({ jobs: [job(1), job(2)], meta: { total: 2 } }) });
  const { orchestrator } = build(good, store);
  await orchestrator.run({ mode: "live", scope: "all" });
  return store;
}

describe("a failing crawl never removes previously known jobs", () => {
  it("keeps existing rows when the source returns 0 jobs", async () => {
    const store = await seedWithGoodCrawl(new InMemoryJobStore());
    expect(store.rows).toHaveLength(2);

    const empty = new FakeFetcher({ [GH_URL]: json({ jobs: [], meta: { total: 0 } }) });
    const report = await build(empty, store).orchestrator.run({ mode: "live", scope: "all" });

    // Reported as a failure — 200 with no jobs is not success…
    expect(report.companies[0].status).toBe("failed");
    // …and the two jobs we already had are untouched.
    expect(store.rows).toHaveLength(2);
  });

  it("keeps existing rows when the source 5xxs", async () => {
    const store = await seedWithGoodCrawl(new InMemoryJobStore());

    const broken = new FakeFetcher({
      [GH_URL]: { failure: { ok: false, kind: "http", status: 503, reason: "HTTP 503" } },
    });
    const report = await build(broken, store).orchestrator.run({ mode: "live", scope: "all" });

    expect(report.companies[0].status).toBe("failed");
    expect(store.rows).toHaveLength(2);
  });

  it("keeps existing rows when the source times out", async () => {
    const store = await seedWithGoodCrawl(new InMemoryJobStore());

    const slow = new FakeFetcher({
      [GH_URL]: { failure: { ok: false, kind: "timeout", reason: "Request timed out" } },
    });
    await build(slow, store).orchestrator.run({ mode: "live", scope: "all" });

    expect(store.rows).toHaveLength(2);
  });

  it("keeps existing rows when the source is blocked", async () => {
    const store = await seedWithGoodCrawl(new InMemoryJobStore());
    await build(new FakeFetcher({ [GH_URL]: BLOCKED }), store).orchestrator.run({
      mode: "live",
      scope: "all",
    });
    expect(store.rows).toHaveLength(2);
  });

  it("keeps existing rows when the response is malformed", async () => {
    const store = await seedWithGoodCrawl(new InMemoryJobStore());

    const garbage = new FakeFetcher({
      [GH_URL]: { body: "<html>not json</html>", contentType: "text/html" },
    });
    await build(garbage, store).orchestrator.run({ mode: "live", scope: "all" });

    expect(store.rows).toHaveLength(2);
  });

  it("keeps the jobs it did NOT see when a crawl returns only some of them", async () => {
    // The partial-pagination case: job 2 is missing from this run. It must
    // survive untouched and simply not be refreshed.
    const store = await seedWithGoodCrawl(new InMemoryJobStore());

    const partial = new FakeFetcher({ [GH_URL]: json({ jobs: [job(1)], meta: { total: 2 } }) });
    const report = await build(partial, store).orchestrator.run({ mode: "live", scope: "all" });

    expect(store.rows).toHaveLength(2);
    // The board's own count disagrees with what it returned, and that is said
    // out loud rather than passed off as a complete crawl.
    expect(report.companies[0].warnings.join(" ")).toMatch(/looks incomplete/);
  });

  it("writes nothing at all on a dry run, so it cannot affect the lifecycle", async () => {
    const store = await seedWithGoodCrawl(new InMemoryJobStore());
    const writesBefore = store.writes.length;

    const fetcher = new FakeFetcher({ [GH_URL]: json({ jobs: [job(1)], meta: { total: 1 } }) });
    await build(fetcher, store).orchestrator.run({ mode: "dry_run", scope: "all" });

    expect(store.writes).toHaveLength(writesBefore);
    expect(store.rows).toHaveLength(2);
  });

  it("only refreshes a job by WRITING it — there is no bulk lifecycle update", async () => {
    // A successful re-crawl re-writes the jobs it saw (which is what advances
    // last_seen_at in the RPC). Nothing else is touched.
    const store = await seedWithGoodCrawl(new InMemoryJobStore());
    store.writes.length = 0;

    const fetcher = new FakeFetcher({ [GH_URL]: json({ jobs: [job(1)], meta: { total: 1 } }) });
    await build(fetcher, store).orchestrator.run({ mode: "live", scope: "all" });

    // Exactly the one job the crawl actually saw.
    expect(store.writes).toHaveLength(1);
    expect(store.writes[0].sourceJobId).toBe("1");
  });

  it("writes a job today even when its posted_at is months old (Module 10B.2 fix)", async () => {
    // Being observed IS the freshness signal. A job the source first posted
    // long ago still reaches the store on today's crawl — which is what lets
    // the (frozen, already-verified) RPC stamp `last_seen_at = now()` on the
    // write. posted_at age must never gate whether a write happens at all.
    const staleDate = new Date(Date.now() - 300 * 24 * 3600 * 1000).toISOString();
    const fetcher = new FakeFetcher({
      [GH_URL]: json({
        jobs: [{ ...job(1), first_published: staleDate }],
        meta: { total: 1 },
      }),
    });
    const { orchestrator, store } = build(fetcher);

    const report = await orchestrator.run({ mode: "live", scope: "all" });

    expect(report.companies[0].status).toBe("success");
    expect(store.writes).toHaveLength(1);
    expect(store.writes[0].postedAt).toBe(staleDate);
  });
});

describe("a failing crawl is recorded honestly", () => {
  it("does not mark the registry entry successful", async () => {
    const empty = new FakeFetcher({ [GH_URL]: json({ jobs: [], meta: { total: 0 } }) });
    const { orchestrator, registry } = build(empty);

    await orchestrator.run({ mode: "live", scope: "all" });

    expect(registry.results[0].result.status).toBe("failed");
    expect(registry.results[0].result.jobsImported).toBe(0);
    expect(registry.results[0].result.error).toMatch(/no job postings/i);
  });

  it("does not advance the registry schedule on a dry run", async () => {
    const fetcher = new FakeFetcher({ [GH_URL]: json({ jobs: [job(1)], meta: { total: 1 } }) });
    const { orchestrator, registry } = build(fetcher);

    await orchestrator.run({ mode: "dry_run", scope: "all" });
    expect(registry.results[0].result.recordAttempt).toBe(false);
  });
});
