import { createServerFn } from "@tanstack/react-start";
import { requireAdmin } from "@/server/jobIntelligence/adminAuth";
import { runPlatformCrawl, type CrawlRunResult } from "@/server/jobIntelligence/CrawlRunner";
import { adapterRegistry } from "@/server/jobIntelligence/adapters/AdapterRegistry";
import { SupabaseJobIntelligenceStore } from "@/server/jobIntelligence/store/SupabaseJobIntelligenceStore";
import type { CrawlTarget } from "@/server/jobIntelligence/adapters/types";

// ── runManualCrawl (Module 10A) ──
//
// The ONE entry point through which an admin manually triggers a platform
// crawl — see src/server/jobIntelligence/CrawlRunner.ts for the pipeline
// itself. Lives outside src/server/** for the same reason
// src/server-functions/resume.ts does (see its header comment): the client
// build blocks any import path containing a "server" segment, so a
// createServerFn the client can call must be defined here even though its
// handler body only ever runs server-side.
//
// No adapters are registered yet (Module 10A ships the architecture only —
// see AdapterRegistry) — calling this with any platform today fails fast
// with a clear "not registered" error rather than silently doing nothing.
// No route/UI calls this in this phase; it exists so the framework is
// complete and callable the moment a real adapter is registered.

type RunManualCrawlInput = {
  accessToken: string;
  platform: string;
  target: CrawlTarget;
};

export const runManualCrawl = createServerFn({ method: "POST" })
  .validator((data: RunManualCrawlInput) => data)
  .handler(async ({ data }): Promise<CrawlRunResult> => {
    await requireAdmin(data.accessToken);

    const adapter = adapterRegistry.get(data.platform);
    if (!adapter) {
      throw new Error(
        `No crawl adapter registered for platform "${data.platform}". ` +
          `Registered platforms: ${adapterRegistry.list().join(", ") || "(none)"}.`,
      );
    }

    const store = new SupabaseJobIntelligenceStore();
    return runPlatformCrawl(adapter, data.target, store);
  });
