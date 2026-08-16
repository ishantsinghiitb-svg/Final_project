import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAdmin } from "@/server/jobIntelligence/adminAuth";
import { runPlatformCrawl, type CrawlRunResult } from "@/server/jobIntelligence/CrawlRunner";
import { adapterRegistry } from "@/server/jobIntelligence/adapters/AdapterRegistry";
import { SupabaseJobIntelligenceStore } from "@/server/jobIntelligence/store/SupabaseJobIntelligenceStore";
import {
  ensureAdaptersRegistered,
  getCrawlFetcher,
} from "@/server/jobIntelligence/crawl/registerAdapters";
import { CrawlOrchestrator } from "@/server/jobIntelligence/crawl/CrawlOrchestrator";
import { SupabaseCompanyRegistryStore } from "@/server/jobIntelligence/crawl/registry/SupabaseCompanyRegistryStore";
import { SupabaseCrawlReportStore } from "@/server/jobIntelligence/crawl/report/CrawlReportStore";
import {
  listPlatformSummaries,
  type PlatformSummary,
} from "@/server/jobIntelligence/crawl/PlatformCatalog";
import type { CrawlMode, CrawlReport } from "@/server/jobIntelligence/crawl/report/CrawlReport";
import type { CompanyRegistryEntry } from "@/server/jobIntelligence/crawl/registry/CompanyRegistry";
import {
  summarizeRegistry,
  type RegistrySummary,
} from "@/server/jobIntelligence/crawl/registry/registrySummary";
import { AdminAccessError } from "@/server/jobIntelligence/adminAuth";
import {
  SourceHealthService,
  type SourceHealthReport,
} from "@/server/jobIntelligence/crawl/verify/SourceHealthService";
import { SupabaseSourceVerificationStore } from "@/server/jobIntelligence/crawl/verify/SourceVerificationStore";
import { accessToken, uuid, validate } from "./validation";

export type { RegistrySummary } from "@/server/jobIntelligence/crawl/registry/registrySummary";

const platform = z.string().min(1).max(100);
const CrawlTargetSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("url"), url: z.string().url().max(2048) }),
  z.object({
    kind: z.literal("query"),
    query: z.string().min(1).max(200),
    location: z.string().max(200).optional(),
  }),
  z.object({ kind: z.literal("company"), companyCareerUrl: z.string().url().max(2048) }),
]);

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
// Module 10B.1 update: adapters ARE registered now (see
// src/server/jobIntelligence/crawl/registerAdapters.ts), so this single-target
// path is live. `ensureAdaptersRegistered()` populates Module 10A's registry
// on first use; it is idempotent and safe on every request. Nothing else in
// this function changed — the registry lookup and error path are Module 10A's.

const RunManualCrawlSchema = z.object({
  accessToken,
  platform,
  target: CrawlTargetSchema,
});

export const runManualCrawl = createServerFn({ method: "POST" })
  .validator((data: unknown) => validate(RunManualCrawlSchema, data))
  .handler(async ({ data }): Promise<CrawlRunResult> => {
    await requireAdmin(data.accessToken);
    ensureAdaptersRegistered();

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

// ── Module 10B.1: registry-driven crawling ──
//
// Four admin-only entry points. Every one calls `requireAdmin` FIRST — these
// hit the service-role Supabase client, which bypasses RLS, so the env
// allowlist is the only gate between a caller and operator-level data.
//
// Return types are deliberately plain data (no Error subclasses, no functions,
// no `unknown` fields): everything here crosses the `createServerFn` boundary,
// which requires statically-serializable results — the same constraint that
// shaped `CrawlRunOutcome` in Module 10A.

function buildOrchestrator(): CrawlOrchestrator {
  return new CrawlOrchestrator({
    fetcher: getCrawlFetcher(),
    registry: new SupabaseCompanyRegistryStore(),
    store: new SupabaseJobIntelligenceStore(),
    reports: new SupabaseCrawlReportStore(),
  });
}

/**
 * Serializable registry row for the admin panel.
 *
 * `CompanyRegistryEntry.config` is `unknown` (adapters interpret their own
 * options), and `unknown` cannot cross the `createServerFn` boundary — the
 * same trap Module 10A hit with `RawJobPayload.json`. It is serialized to a
 * JSON string here rather than widened to a lossy typed shape, so a future
 * adapter's config keys survive without this type needing to know them.
 */
export type AdminRegistryEntry = Omit<CompanyRegistryEntry, "config"> & {
  configJson: string | null;
};

function toAdminEntry(entry: CompanyRegistryEntry): AdminRegistryEntry {
  const { config, ...rest } = entry;
  let configJson: string | null = null;
  if (config && typeof config === "object" && Object.keys(config).length > 0) {
    try {
      configJson = JSON.stringify(config);
    } catch {
      configJson = null;
    }
  }
  return { ...rest, configJson };
}

export type CrawlAdminOverview = {
  isAdmin: boolean;
  platforms: PlatformSummary[];
  entries: AdminRegistryEntry[];
  summary: RegistrySummary;
  lastRun: CrawlReport | null;
  lastRunAt: string | null;
  recentRuns: Array<{
    id: string;
    mode: CrawlMode;
    scope: string;
    platform: string | null;
    status: string;
    startedAt: string;
    durationMs: number | null;
    imported: number;
    discovered: number;
    failed: number;
  }>;
};

/**
 * Everything the Settings admin panel renders in one round trip. Returns
 * `isAdmin: false` (not a thrown error) for a non-admin caller so the panel can
 * simply not render — an ordinary user hitting this is the expected case, not
 * an exceptional one.
 */
const AccessTokenOnlySchema = z.object({ accessToken });

export const getCrawlAdminOverview = createServerFn({ method: "POST" })
  .validator((data: unknown) => validate(AccessTokenOnlySchema, data))
  .handler(async ({ data }): Promise<CrawlAdminOverview> => {
    try {
      await requireAdmin(data.accessToken);
    } catch (err) {
      if (err instanceof AdminAccessError) {
        return {
          isAdmin: false,
          summary: summarizeRegistry([]),
          platforms: [],
          entries: [],
          lastRun: null,
          lastRunAt: null,
          recentRuns: [],
        };
      }
      throw err;
    }

    const registry = new SupabaseCompanyRegistryStore();
    const reports = new SupabaseCrawlReportStore();

    const [entries, runs] = await Promise.all([
      registry.listAllEntries(),
      reports.listRecentRuns(10),
    ]);

    const completed = runs.find((run) => run.status === "completed");

    return {
      isAdmin: true,
      platforms: listPlatformSummaries(),
      summary: summarizeRegistry(entries),
      entries: entries.map(toAdminEntry),
      lastRun: (completed?.report as CrawlReport | undefined) ?? null,
      lastRunAt: completed?.started_at ?? null,
      recentRuns: runs.map((run) => ({
        id: run.id,
        mode: run.mode,
        scope: run.scope,
        platform: run.platform,
        status: run.status,
        startedAt: run.started_at,
        durationMs: run.duration_ms,
        imported: run.jobs_imported,
        discovered: run.jobs_discovered,
        failed: run.jobs_failed,
      })),
    };
  });

export type RunCrawlInput = {
  accessToken: string;
  /** Omit or pass null to crawl every enabled registry entry. */
  platform?: string | null;
  dryRun?: boolean;
  /** Ignore each entry's crawl frequency — what pressing the button means. */
  force?: boolean;
};

const RunCrawlSchema = z.object({
  accessToken,
  platform: platform.nullable().optional(),
  dryRun: z.boolean().optional(),
  force: z.boolean().optional(),
});

/**
 * Crawl Selected Platform / Crawl All / Dry Run — one function, because the
 * three differ only in `platform` and `mode`. Returns the full report so the
 * panel can render it immediately without a second fetch.
 */
export const runRegistryCrawl = createServerFn({ method: "POST" })
  .validator((data: unknown) => validate(RunCrawlSchema, data))
  .handler(async ({ data }): Promise<CrawlReport> => {
    const authed = await requireAdmin(data.accessToken);
    ensureAdaptersRegistered();

    const platform = data.platform?.trim() || null;
    return buildOrchestrator().run({
      mode: data.dryRun ? "dry_run" : "live",
      scope: platform ? "platform" : "all",
      platform,
      triggeredBy: authed.user.email ?? null,
      // The operator asked for this run explicitly; the per-entry frequency is
      // a floor for scheduled selection, not a lock on manual runs.
      force: data.force ?? true,
    });
  });

const GetCrawlReportSchema = z.object({ accessToken, runId: uuid });

/** One stored report by id, for "View Last Crawl Report" on an older run. */
export const getCrawlReport = createServerFn({ method: "POST" })
  .validator((data: unknown) => validate(GetCrawlReportSchema, data))
  .handler(async ({ data }): Promise<CrawlReport | null> => {
    await requireAdmin(data.accessToken);
    const run = await new SupabaseCrawlReportStore().getRun(data.runId);
    return (run?.report as CrawlReport | undefined) ?? null;
  });

// ── Module 10B.1.5: source health ──

export type VerifySourcesInput = {
  accessToken: string;
  /** Narrow to one platform; omit for the whole registry. */
  platform?: string | null;
  /** Include disabled entries — off by default. */
  includeDisabled?: boolean;
};

const VerifySourcesSchema = z.object({
  accessToken,
  platform: platform.nullable().optional(),
  includeDisabled: z.boolean().optional(),
});

/**
 * Verifies every registered source URL and records its health. This imports
 * NOTHING: it is a read-only sweep over the registry that answers "are these
 * URLs still working", which is a different question from "did the last crawl
 * succeed" and is tracked in its own columns.
 */
export const verifyRegistrySources = createServerFn({ method: "POST" })
  .validator((data: unknown) => validate(VerifySourcesSchema, data))
  .handler(async ({ data }): Promise<SourceHealthReport> => {
    const authed = await requireAdmin(data.accessToken);

    const service = new SourceHealthService({
      fetcher: getCrawlFetcher(),
      registry: new SupabaseCompanyRegistryStore(),
      runs: new SupabaseSourceVerificationStore(),
    });

    return service.sweep({
      platform: data.platform?.trim() || null,
      includeDisabled: data.includeDisabled ?? false,
      triggeredBy: authed.user.email ?? null,
    });
  });
