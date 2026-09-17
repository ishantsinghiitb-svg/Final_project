// ── PRODUCTION WRITE: delete the verified low_quality crawler-sourced rows ──
//
// This is the only script in this batch that writes to the database. It:
//   1. Re-fetches crawler-sourced rows fresh (not the earlier preview's
//      in-memory list) and reclassifies them right now.
//   2. Asserts every candidate row is crawler-sourced and not a manual
//      import — a hard safety check, not just a log line: the script
//      throws (without deleting anything) if this ever fails.
//   3. Deletes ONLY those exact row IDs — never a broad WHERE clause.
//   4. Verifies the post-delete row count matches exactly.
//
// Run with: npx vite-node scripts/jobQualityCleanupExecute.ts

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

async function main(): Promise<void> {
  const supabase = createServiceSupabase();

  const { count: beforeTotal, error: countErr } = await supabase
    .from("global_jobs")
    .select("id", { count: "exact", head: true });
  if (countErr) throw countErr;

  const { data, error } = await supabase
    .from("global_jobs")
    .select(
      "id, source, role, description, department, job_function, technologies, is_manual_import",
    )
    .in("source", CRAWLER_SOURCES);
  if (error) throw error;
  const rows = (data ?? []) as Row[];

  const lowQuality = rows.filter(
    (r) =>
      !classifyJobQuality({
        role: r.role,
        description: r.description,
        department: r.department,
        jobFunction: r.job_function,
        technologies: r.technologies,
        source: r.source,
      }).retain,
  );

  // Hard safety assertions — throw (no delete) rather than proceed if any fail.
  for (const r of lowQuality) {
    if (!CRAWLER_SOURCES.includes(r.source)) {
      throw new Error(`REFUSING: row ${r.id} has non-crawler source "${r.source}"`);
    }
    if (EXTENSION_SOURCES.includes(r.source)) {
      throw new Error(`REFUSING: row ${r.id} has an extension source "${r.source}"`);
    }
    if (r.is_manual_import) {
      throw new Error(`REFUSING: row ${r.id} is a manual import`);
    }
  }

  const ids = lowQuality.map((r) => r.id);
  console.log(`Deleting ${ids.length} verified low_quality crawler-sourced rows...`);

  const { error: deleteError, count: deletedCount } = await supabase
    .from("global_jobs")
    .delete({ count: "exact" })
    .in("id", ids);
  if (deleteError) throw deleteError;

  const { count: afterTotal, error: afterErr } = await supabase
    .from("global_jobs")
    .select("id", { count: "exact", head: true });
  if (afterErr) throw afterErr;

  console.log(`\nRows deleted (reported by Supabase): ${deletedCount}`);
  console.log(`global_jobs total before: ${beforeTotal}`);
  console.log(`global_jobs total after: ${afterTotal}`);
  console.log(`difference: ${(beforeTotal ?? 0) - (afterTotal ?? 0)} (expected ${ids.length})`);

  if (deletedCount !== ids.length || (beforeTotal ?? 0) - (afterTotal ?? 0) !== ids.length) {
    throw new Error(
      "MISMATCH: deleted count does not match the verified candidate list — investigate before trusting the audit.",
    );
  }

  console.log("\n== Cleanup complete — counts match exactly ==");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
