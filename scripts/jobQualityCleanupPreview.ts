// ── READ-ONLY preview of the production quality-cleanup operation ──
//
// Produces the EXACT list/count of global_jobs rows that a cleanup pass
// would remove, and proves every safety property the product brief requires
// BEFORE any write happens:
//   - every affected row is crawler-sourced (never an extension source)
//   - every affected row is independently reclassified low_quality right now
//   - the operation is idempotent (re-running the classifier on the same
//     rows yields the same decision — trivially true, since it's a pure
//     function of role/description/source, but verified here explicitly)
//
// No writes anywhere in this file.
//
// Run with: npx vite-node scripts/jobQualityCleanupPreview.ts

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

// The extension's own source tags — used only to assert exclusion, never queried.
const EXTENSION_SOURCES = ["linkedin", "naukri", "indeed", "unstop", "wellfound", "foundit"];

type Row = {
  id: string;
  source: string;
  role: string;
  description: string | null;
  department: string | null;
  job_function: string | null;
  technologies: string[] | null;
  is_manual_import: boolean | null;
};

async function fetchAll(supabase: ReturnType<typeof createServiceSupabase>): Promise<Row[]> {
  const pageSize = 1000;
  let from = 0;
  const all: Row[] = [];
  for (;;) {
    const { data, error } = await supabase
      .from("global_jobs")
      .select(
        "id, source, role, description, department, job_function, technologies, is_manual_import",
      )
      .range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...(data as Row[]));
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

async function main(): Promise<void> {
  const supabase = createServiceSupabase();
  const allRows = await fetchAll(supabase);

  console.log("== PRODUCTION CLEANUP PREVIEW — READ-ONLY (no writes) ==\n");
  console.log(`total global_jobs rows (all sources): ${allRows.length}`);

  const extensionRows = allRows.filter((r) => EXTENSION_SOURCES.includes(r.source));
  const crawlerRows = allRows.filter((r) => CRAWLER_SOURCES.includes(r.source));
  const otherRows = allRows.filter(
    (r) => !EXTENSION_SOURCES.includes(r.source) && !CRAWLER_SOURCES.includes(r.source),
  );
  console.log(`extension-sourced rows (never touched): ${extensionRows.length}`);
  console.log(`crawler-sourced rows (candidate set): ${crawlerRows.length}`);
  if (otherRows.length > 0) {
    console.log(
      `rows with an unrecognized source (also never touched, not in either list): ${otherRows.length} — ${[...new Set(otherRows.map((r) => r.source))].join(", ")}`,
    );
  }

  // Classify the candidate set (crawler-sourced only) — TWICE, to prove
  // idempotency explicitly rather than assume it from purity.
  const classifyRow = (r: Row) =>
    classifyJobQuality({
      role: r.role,
      description: r.description,
      department: r.department,
      jobFunction: r.job_function,
      technologies: r.technologies,
      source: r.source,
    });

  const firstPass = crawlerRows.map((r) => ({ row: r, decision: classifyRow(r) }));
  const secondPass = crawlerRows.map((r) => ({ row: r, decision: classifyRow(r) }));
  const idempotencyMismatches = firstPass.filter(
    (a, i) => a.decision.retain !== secondPass[i].decision.retain,
  );

  const lowQuality = firstPass.filter((d) => !d.decision.retain);
  const manualImportAmongLowQuality = lowQuality.filter((d) => d.row.is_manual_import);

  console.log(`\n-- SAFETY PROPERTIES --`);
  console.log(
    `idempotent: ${idempotencyMismatches.length === 0 ? "YES" : `NO — ${idempotencyMismatches.length} mismatches!`}`,
  );
  console.log(
    `every affected row confirmed crawler-sourced: ${lowQuality.every((d) => CRAWLER_SOURCES.includes(d.row.source)) ? "YES" : "NO"}`,
  );
  console.log(
    `every affected row confirmed is_manual_import=false: ${manualImportAmongLowQuality.length === 0 ? "YES" : `NO — ${manualImportAmongLowQuality.length} are manual imports!`}`,
  );
  console.log(
    `extension sources present in affected set: ${lowQuality.filter((d) => EXTENSION_SOURCES.includes(d.row.source)).length} (must be 0)`,
  );

  console.log(`\n-- AFFECTED ROWS BY PLATFORM --`);
  const byPlatform = new Map<string, number>();
  for (const d of lowQuality) byPlatform.set(d.row.source, (byPlatform.get(d.row.source) ?? 0) + 1);
  for (const [platform, n] of [...byPlatform.entries()].sort((a, b) => b[1] - a[1])) {
    const total = crawlerRows.filter((r) => r.source === platform).length;
    console.log(`  ${platform}: ${n} of ${total} would be removed`);
  }

  console.log(`\n-- TOTAL --`);
  console.log(`crawler-sourced rows that would be REMOVED (low_quality): ${lowQuality.length}`);
  console.log(`crawler-sourced rows that would REMAIN: ${crawlerRows.length - lowQuality.length}`);
  console.log(
    `global_jobs total after cleanup (projected): ${allRows.length - lowQuality.length} (was ${allRows.length})`,
  );

  console.log(`\n-- EXACT ROW LIST TO BE REMOVED (id, source, role) --`);
  for (const d of lowQuality) {
    console.log(`  ${d.row.id}\t${d.row.source}\t${d.row.role}`);
  }

  console.log("\n== Preview complete — NO ROWS WERE MODIFIED OR DELETED ==");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
