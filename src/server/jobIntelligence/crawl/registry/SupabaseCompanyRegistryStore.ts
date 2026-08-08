// ── Module 10B.1: Supabase-backed Company Registry ──
//
// `crawl_company_registry` has RLS enabled with NO policy for anon/authenticated,
// so this only works through the service-role client — which is exactly the
// intent: the registry is operator state, reachable only from the admin server
// functions behind `requireAdmin`.

import { createServiceSupabase, type ServerSupabase } from "@/server/supabase";
import type { CrawlCompanyRegistryRow } from "@/types/database";
import type {
  CompanyRegistryEntry,
  CompanyRegistryStore,
  RegistryCrawlResult,
} from "./CompanyRegistry";
import { isCrawlableHealth, type SourceVerification } from "../verify/SourceVerifier";

function toEntry(row: CrawlCompanyRegistryRow): CompanyRegistryEntry {
  return {
    id: row.id,
    companyName: row.company_name,
    careersUrl: row.careers_url,
    platform: row.platform,
    enabled: row.enabled,
    crawlFrequencyHours: row.crawl_frequency_hours,
    lastCrawlAt: row.last_crawl_at,
    lastSuccessAt: row.last_success_at,
    lastStatus: row.last_status,
    lastError: row.last_error,
    lastJobsImported: row.last_jobs_imported,
    notes: row.notes,
    config: row.config ?? {},
    parentCompany: row.parent_company ?? null,
    aliases: row.aliases ?? [],
    healthStatus: row.health_status ?? null,
    lastCheckedAt: row.last_checked_at ?? null,
    lastHealthSuccessAt: row.last_health_success_at ?? null,
    lastFailureAt: row.last_failure_at ?? null,
    httpStatus: row.http_status ?? null,
    detectedPlatform: row.detected_platform ?? null,
    errorReason: row.error_reason ?? null,
    resolvedUrl: row.resolved_url ?? null,
    postingsSeen: row.postings_seen ?? null,
  };
}

export class SupabaseCompanyRegistryStore implements CompanyRegistryStore {
  constructor(private readonly supabase: ServerSupabase = createServiceSupabase()) {}

  async listEntries(platform?: string): Promise<CompanyRegistryEntry[]> {
    let query = this.supabase
      .from("crawl_company_registry")
      .select("*")
      .eq("enabled", true)
      .order("company_name", { ascending: true });

    if (platform) query = query.eq("platform", platform);

    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []).map((row) => toEntry(row as CrawlCompanyRegistryRow));
  }

  async listAllEntries(): Promise<CompanyRegistryEntry[]> {
    const { data, error } = await this.supabase
      .from("crawl_company_registry")
      .select("*")
      .order("platform", { ascending: true })
      .order("company_name", { ascending: true });
    if (error) throw error;
    return (data ?? []).map((row) => toEntry(row as CrawlCompanyRegistryRow));
  }

  async markCrawlResult(entryId: string, result: RegistryCrawlResult): Promise<void> {
    // A dry run reports what WOULD happen; advancing last_crawl_at would make
    // the entry look freshly crawled and silently skip it on the next live run.
    if (!result.recordAttempt) return;

    const now = new Date().toISOString();
    // Typed as the table's own Update shape (not Record<string, unknown>) —
    // postgrest-js rejects an index-signature object, and the concrete type
    // catches a column rename at compile time.
    const patch: Partial<CrawlCompanyRegistryRow> = {
      last_crawl_at: now,
      last_status: result.status,
      last_error: result.error,
      last_jobs_imported: result.jobsImported,
      updated_at: now,
    };
    // `last_success_at` is a high-water mark — only a run that actually worked
    // moves it, so "last known good" survives a string of failures.
    if (result.status === "success" || result.status === "partial") {
      patch.last_success_at = now;
    }

    const { error } = await this.supabase
      .from("crawl_company_registry")
      .update(patch)
      .eq("id", entryId);
    if (error) throw error;
  }

  async markVerification(entryId: string, verification: SourceVerification): Promise<void> {
    const healthy = isCrawlableHealth(verification.health);

    const patch: Partial<CrawlCompanyRegistryRow> = {
      health_status: verification.health,
      last_checked_at: verification.checkedAt,
      http_status: verification.httpStatus,
      detected_platform: verification.detectedPlatform,
      error_reason: verification.errorReason,
      postings_seen: verification.postingsSeen,
      updated_at: new Date().toISOString(),
      // Only recorded when the URL actually moved — writing the probe URL back
      // on every healthy check would make every row look redirected.
      resolved_url:
        verification.finalUrl && verification.finalUrl !== verification.url
          ? verification.finalUrl
          : null,
    };

    // Both are high-water marks, so an operator can see "it last worked on X,
    // it has been failing since Y" rather than only the latest state.
    if (healthy) patch.last_health_success_at = verification.checkedAt;
    else patch.last_failure_at = verification.checkedAt;

    const { error } = await this.supabase
      .from("crawl_company_registry")
      .update(patch)
      .eq("id", entryId);
    if (error) throw error;
  }
}
