// ── READ-ONLY post-cleanup quality audit ──
//
// Verifies the production state after the low_quality cleanup: no
// crawler-sourced row remaining is classified low_quality, extension sources
// are untouched, and gives a by-platform/by-quality-category breakdown. No
// writes anywhere in this file.
//
// Run with: npx vite-node scripts/jobQualityPostCleanupAudit.ts

import { createServiceSupabase } from "../src/server/supabase";
import { classifyJobQuality } from "../src/server/jobIntelligence/quality/jobQuality";

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
const EXTENSION_SOURCES = ["linkedin", "naukri", "indeed", "unstop", "wellfound", "foundit"];

async function main(): Promise<void> {
  const supabase = createServiceSupabase();

  const { data, error } = await supabase
    .from("global_jobs")
    .select("id, source, role, description, department, job_function, technologies");
  if (error) throw error;
  const rows = data ?? [];

  console.log("== POST-CLEANUP QUALITY AUDIT (read-only) ==\n");
  console.log(`total global_jobs: ${rows.length}`);

  const extensionRows = rows.filter((r) => EXTENSION_SOURCES.includes(r.source));
  const crawlerRows = rows.filter((r) => CRAWLER_SOURCES.includes(r.source));
  console.log(`extension-sourced: ${extensionRows.length}`);
  console.log(`crawler-sourced: ${crawlerRows.length}`);

  console.log("\n-- EXTENSION SOURCES (must be fully untouched) --");
  const byExt = new Map<string, number>();
  for (const r of extensionRows) byExt.set(r.source, (byExt.get(r.source) ?? 0) + 1);
  for (const [s, n] of [...byExt.entries()].sort((a, b) => b[1] - a[1]))
    console.log(`  ${s}: ${n}`);

  console.log("\n-- CRAWLER SOURCES: quality re-check (low_quality remaining must be 0) --");
  const byPlatform = new Map<string, { total: number; lowQuality: number }>();
  for (const r of crawlerRows) {
    const decision = classifyJobQuality({
      role: r.role,
      description: r.description,
      department: r.department,
      jobFunction: r.job_function,
      technologies: r.technologies,
      source: r.source,
    });
    const entry = byPlatform.get(r.source) ?? { total: 0, lowQuality: 0 };
    entry.total++;
    if (!decision.retain) entry.lowQuality++;
    byPlatform.set(r.source, entry);
  }
  let totalLowQualityRemaining = 0;
  for (const [platform, { total, lowQuality }] of [...byPlatform.entries()].sort(
    (a, b) => b[1].total - a[1].total,
  )) {
    console.log(`  ${platform}: ${total} total, ${lowQuality} still low_quality (must be 0)`);
    totalLowQualityRemaining += lowQuality;
  }
  console.log(
    `\nTOTAL low_quality rows remaining among crawler sources: ${totalLowQualityRemaining} (must be 0)`,
  );

  console.log("\n== Post-cleanup audit complete — no rows were modified ==");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
