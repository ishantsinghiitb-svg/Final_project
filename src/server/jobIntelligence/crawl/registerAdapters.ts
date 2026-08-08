// ── Module 10B.1: filling Module 10A's AdapterRegistry ──
//
// Module 10A shipped `adapterRegistry` deliberately EMPTY, documenting that "a
// future module adds a real adapter with exactly one call to register()".
// This is that call — six of them, one per platform tag — so Module 10A's own
// `runManualCrawl` server function (which looks platforms up in that registry)
// starts working without a line changing inside it.
//
// The orchestrator does NOT read this registry: it builds an adapter per
// registry ENTRY, because Company Career Pages needs that entry's company name
// and config to resolve its ATS board. The two coexist on purpose —
// `adapterRegistry` serves the single-target "crawl this one URL" path, the
// catalog serves the registry-driven path.

import { adapterRegistry, AdapterRegistry } from "../adapters/AdapterRegistry";
import { createBlockedAdapter } from "../adapters/blocked/BlockedPlatformAdapter";
import { createCareerPagesAdapter } from "../adapters/careerPages/CareerPagesAdapter";
import { createInternshalaAdapter } from "../adapters/internshala/InternshalaAdapter";
import { createWeWorkRemotelyAdapter } from "../adapters/weWorkRemotely/WeWorkRemotelyAdapter";
import { PLATFORM_LIMITATIONS } from "./limitations";
import { HttpFetcher, type CrawlFetcher } from "./HttpFetcher";

/**
 * Registers every Module 10B.1 adapter into a registry. Idempotent: a
 * platform already present is left alone, because `AdapterRegistry.register`
 * throws on a duplicate and this runs once per server instance — a second call
 * (hot reload, a test re-import) must not crash the process.
 */
export function registerCrawlAdapters(
  fetcher: CrawlFetcher,
  registry: AdapterRegistry = adapterRegistry,
): AdapterRegistry {
  const adapters = [
    createCareerPagesAdapter(fetcher),
    createWeWorkRemotelyAdapter(fetcher),
    createInternshalaAdapter(fetcher),
    // Blocked platforms are registered too, so `runManualCrawl("wellfound", …)`
    // answers with the documented limitation instead of "no adapter registered",
    // which would read like an oversight.
    ...Object.values(PLATFORM_LIMITATIONS).map(createBlockedAdapter),
  ];

  for (const adapter of adapters) {
    if (registry.get(adapter.platform)) continue;
    registry.register(adapter);
  }
  return registry;
}

let defaultFetcher: HttpFetcher | null = null;

/** The process-wide fetcher. One instance so its per-host politeness delay actually spans a run. */
export function getCrawlFetcher(): HttpFetcher {
  defaultFetcher ??= new HttpFetcher();
  return defaultFetcher;
}

/** Ensures the process-wide registry is populated; safe to call on every request. */
export function ensureAdaptersRegistered(): AdapterRegistry {
  return registerCrawlAdapters(getCrawlFetcher());
}
