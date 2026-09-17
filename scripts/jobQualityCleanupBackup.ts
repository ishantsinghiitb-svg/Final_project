// ── READ-ONLY: export a full backup of the rows a cleanup pass would remove ──
//
// Writes the COMPLETE row (every column) for each low_quality crawler-sourced
// global_jobs row to a local JSON file, before any delete runs — so the exact
// pre-deletion state is recoverable from disk regardless of what happens in
// the database afterward. No writes to the database anywhere in this file.
//
// Run with: npx vite-node scripts/jobQualityCleanupBackup.ts <output-path>

import { writeFileSync } from "node:fs";
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

async function main(): Promise<void> {
  const outPath = process.argv[2];
  if (!outPath) {
    throw new Error("Usage: vite-node scripts/jobQualityCleanupBackup.ts <output-path>");
  }

  const supabase = createServiceSupabase();
  const pageSize = 1000;
  let from = 0;
  const rows: Record<string, unknown>[] = [];
  for (;;) {
    const { data, error } = await supabase
      .from("global_jobs")
      .select("*")
      .in("source", CRAWLER_SOURCES)
      .range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }

  const lowQuality = rows.filter((r) => {
    const decision = classifyJobQuality({
      role: r.role as string,
      description: r.description as string | null,
      department: r.department as string | null,
      jobFunction: r.job_function as string | null,
      technologies: r.technologies as string[] | null,
      source: r.source as string,
    });
    return !decision.retain;
  });

  writeFileSync(outPath, JSON.stringify(lowQuality, null, 2), "utf-8");
  console.log(`Backed up ${lowQuality.length} full rows (every column) to ${outPath}`);
  console.log("No database writes occurred.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
