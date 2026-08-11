// ── Module 10B.2.5: registry-wide counts for the admin panel headline ──
//
// Pure and side-effect-free, and deliberately kept in `src/server/` (not in
// `src/server-functions/jobIntelligence.ts`, where this used to live) —
// exporting a plain function from a `server-functions` file makes it reachable
// from the client bundle even when only ever called from inside a
// `createServerFn` handler, which trips the client build's import-protection
// check the moment that function touches something under `src/server/` (here,
// `crawlEligibility`). Same reasoning as `src/features/jobs/activeWindow.ts`.

import {
  crawlEligibility,
  rollupHealth,
  type CompanyRegistryEntry,
  type HealthRollup,
} from "./CompanyRegistry";

/** Registry-wide counts the admin panel headline renders. */
export type RegistrySummary = {
  total: number;
  enabled: number;
  /**
   * HEALTHY or REDIRECTED, REGISTRY-WIDE — including disabled entries that
   * still carry a health verdict from before they were disabled. NOT a
   * subset of `enabled`; do not compare the two as if one contains the
   * other. See `eligibleNow` for that question.
   */
  verified: number;
  /**
   * Module 10B.2.5: the number `enabled` alone cannot answer — enabled AND
   * currently verified HEALTHY/REDIRECTED, i.e. what `crawlEligibility()`
   * would actually let a crawl touch right now. Always <= `enabled`. This is
   * a read of the existing eligibility rule for display purposes only; it
   * does not change what `crawlEligibility()` itself decides.
   */
  eligibleNow: number;
  /** BROKEN or BLOCKED — needs an operator to fix or accept. */
  needsAttention: number;
  /** Never verified yet. */
  unchecked: number;
  health: HealthRollup;
  /** Count per detected platform (ATS id / custom_careers / "undetected"). */
  platforms: Array<{ platform: string; count: number }>;
  lastCheckedAt: string | null;
};

export function summarizeRegistry(entries: CompanyRegistryEntry[]): RegistrySummary {
  const health = rollupHealth(entries);
  const platformCounts = new Map<string, number>();
  let lastCheckedAt: string | null = null;
  let eligibleNow = 0;

  for (const entry of entries) {
    const key = entry.detectedPlatform ?? "undetected";
    platformCounts.set(key, (platformCounts.get(key) ?? 0) + 1);
    if (entry.lastCheckedAt && (!lastCheckedAt || entry.lastCheckedAt > lastCheckedAt)) {
      lastCheckedAt = entry.lastCheckedAt;
    }
    if (crawlEligibility(entry).crawlable) eligibleNow++;
  }

  return {
    total: entries.length,
    enabled: entries.filter((entry) => entry.enabled).length,
    verified: health.HEALTHY + health.REDIRECTED,
    eligibleNow,
    needsAttention: health.BROKEN + health.BLOCKED,
    unchecked: health.UNCHECKED,
    health,
    platforms: [...platformCounts.entries()]
      .map(([platform, count]) => ({ platform, count }))
      .sort((a, b) => b.count - a.count),
    lastCheckedAt,
  };
}
