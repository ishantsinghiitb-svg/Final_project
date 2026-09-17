// ── READ-ONLY final production audit after the integrity cleanup ──
//
// Covers all 12 items requested: totals, crawler canonical India/freshness
// (100% expected — the exact functions the crawler's own ingestion gate
// uses), extension-jobs preservation, duplicates, WWR, logos, dangerous
// HTML, Jobs-page visible count, and remaining quality-classifier
// low_quality rows among crawler sources. No writes anywhere in this file.
//
// Run with: npx vite-node scripts/jobIntegrityPostCleanupAudit.ts

import { createServiceSupabase } from "../src/server/supabase";
import { checkJobEligibility } from "../src/server/jobIntelligence/eligibility/jobEligibility";
import { classifyJobQuality } from "../src/server/jobIntelligence/quality/jobQuality";
import { matchesIndiaDiscoveryFilter } from "../src/features/jobs/indiaPlaces";
import { freshnessCutoffIso } from "../src/features/jobs/postedWindow";
import { isGenericPlatformImage } from "../src/server/jobIntelligence/logo/companyLogo";

const EXTENSION_SOURCES = ["linkedin", "naukri", "indeed", "unstop", "wellfound", "foundit"];
const CRAWLER_SOURCES = [
  "greenhouse",
  "lever",
  "ashby",
  "smartrecruiters",
  "workable",
  "internshala",
  "careers",
  "recruitee",
];

async function main(): Promise<void> {
  const supabase = createServiceSupabase();
  const { data, error } = await supabase.from("global_jobs").select("*");
  if (error) throw error;
  const rows = data ?? [];
  const now = new Date();

  console.log("== FINAL PRODUCTION AUDIT — post integrity cleanup (read-only) ==\n");

  // 1-3: totals
  const extensionRows = rows.filter((r) => EXTENSION_SOURCES.includes(r.source));
  const crawlerRows = rows.filter((r) => CRAWLER_SOURCES.includes(r.source));
  console.log(`1. total global_jobs: ${rows.length}`);
  console.log(`2. crawler-sourced: ${crawlerRows.length}`);
  console.log(`3. extension-sourced: ${extensionRows.length}`);

  // 4-5: canonical crawler eligibility, split by rule
  const crawlerDecisions = crawlerRows.map((r) =>
    checkJobEligibility(
      {
        location: r.location,
        city: r.city,
        state: r.state,
        country: r.country,
        postedAt: r.posted_at,
        tags: r.tags,
        role: r.role,
      },
      { now },
    ),
  );
  const crawlerLocationFail = crawlerDecisions.filter(
    (d) => !d.eligible && d.kind === "location",
  ).length;
  const crawlerFreshnessFail = crawlerDecisions.filter(
    (d) => !d.eligible && d.kind === "freshness",
  ).length;
  const crawlerEligible = crawlerDecisions.filter((d) => d.eligible).length;
  console.log(
    `\n4. crawler India eligibility: ${crawlerRows.length - crawlerLocationFail}/${crawlerRows.length} pass location (${crawlerLocationFail} fail — must be 0)`,
  );
  console.log(
    `5. crawler freshness <=30 days: ${crawlerRows.length - crawlerFreshnessFail}/${crawlerRows.length} pass freshness (${crawlerFreshnessFail} fail — must be 0)`,
  );
  console.log(
    `   crawler rows passing BOTH canonical rules: ${crawlerEligible}/${crawlerRows.length} (must be 100%)`,
  );

  // 6: extension preservation
  console.log(`\n6. extension-sourced rows preserved: ${extensionRows.length}`);
  const byExt = new Map<string, number>();
  for (const r of extensionRows) byExt.set(r.source, (byExt.get(r.source) ?? 0) + 1);
  for (const [s, n] of [...byExt.entries()].sort((a, b) => b[1] - a[1]))
    console.log(`   ${s}: ${n}`);

  // 7: duplicate fingerprints
  const fpCounts = new Map<string, number>();
  for (const r of rows) {
    if (!r.fingerprint) continue;
    fpCounts.set(r.fingerprint, (fpCounts.get(r.fingerprint) ?? 0) + 1);
  }
  const dupes = [...fpCounts.entries()].filter(([, n]) => n > 1);
  console.log(`\n7. duplicate fingerprints (appearing >1 time): ${dupes.length} (must be 0)`);

  // 8: WWR
  const { data: wwrEntries } = await supabase
    .from("crawl_company_registry")
    .select("id, enabled")
    .eq("platform", "weworkremotely");
  const enabledWwr = (wwrEntries ?? []).filter((e) => e.enabled).length;
  const wwrRowsInCatalog = rows.filter((r) => r.source === "weworkremotely").length;
  console.log(`\n8. WWR registry entries enabled: ${enabledWwr} (must be 0)`);
  console.log(`   WWR-sourced global_jobs rows: ${wwrRowsInCatalog} (must be 0)`);

  // 9: logos
  const withLogo = rows.filter((r) => r.company_logo_url);
  const generic = withLogo.filter((r) => isGenericPlatformImage(r.company_logo_url));
  console.log(`\n9. generic/vendor/favicon logos: ${generic.length} (must be 0)`);
  console.log(
    `   genuine employer logos: ${withLogo.length - generic.length}, NULL logos: ${rows.length - withLogo.length}`,
  );

  // 10: dangerous HTML
  const dangerousPattern = /<script|onerror=|onload=|javascript:|<iframe|<object|<embed/i;
  const dangerous = rows.filter(
    (r) => r.description_html && dangerousPattern.test(r.description_html),
  );
  console.log(`\n10. rows with a dangerous HTML token: ${dangerous.length} (must be 0)`);

  // 11: Jobs-page visible count (the real display filter, unchanged)
  const cutoff = freshnessCutoffIso(now);
  const visible = rows.filter(
    (r) =>
      !r.is_manual_import &&
      !r.is_closed &&
      r.posted_at &&
      r.posted_at >= cutoff &&
      matchesIndiaDiscoveryFilter({
        country: r.country,
        location: r.location,
        city: r.city,
        state: r.state,
      }),
  );
  console.log(`\n11. Jobs-page visible count (display filter): ${visible.length}`);

  // 12: quality classifier — low_quality remaining among crawler sources
  let lowQualityRemaining = 0;
  for (const r of crawlerRows) {
    const decision = classifyJobQuality({
      role: r.role,
      description: r.description,
      department: r.department,
      jobFunction: r.job_function,
      technologies: r.technologies,
      source: r.source,
    });
    if (!decision.retain) lowQualityRemaining++;
  }
  console.log(
    `\n12. quality classifier low_quality crawler rows remaining: ${lowQualityRemaining} (must be 0)`,
  );

  console.log("\n== Audit complete — no rows were modified ==");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
