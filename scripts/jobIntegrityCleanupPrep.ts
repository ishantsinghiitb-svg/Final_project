// ── READ-ONLY: dependency check + full backup before the integrity cleanup ──
//
// For the crawler-sourced rows failing the canonical eligibility check
// (checkJobEligibility — same function the crawler's own ingestion gate
// uses, no second classifier):
//   1. Checks CASCADE dependents (saved_jobs/collection_jobs/recently_viewed).
//   2. Checks SET NULL dependents (applications) for visibility only.
//   3. Exports the complete row (every column) for each candidate to a local
//      JSON backup file, before any delete runs.
//
// No writes to the database anywhere in this file.
//
// Run with: npx vite-node scripts/jobIntegrityCleanupPrep.ts <backup-output-path>

import { writeFileSync } from "node:fs";
import { createServiceSupabase } from "../src/server/supabase";
import { checkJobEligibility } from "../src/server/jobIntelligence/eligibility/jobEligibility";

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
  if (!outPath)
    throw new Error("Usage: vite-node scripts/jobIntegrityCleanupPrep.ts <backup-output-path>");

  const supabase = createServiceSupabase();
  const { data, error } = await supabase
    .from("global_jobs")
    .select("*")
    .in("source", CRAWLER_SOURCES);
  if (error) throw error;
  const rows = data ?? [];

  const now = new Date();
  const candidates = rows.filter((r) => {
    const decision = checkJobEligibility(
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
    );
    return !decision.eligible;
  });

  console.log(
    `Candidate crawler-sourced rows failing canonical eligibility: ${candidates.length}\n`,
  );

  const ids = candidates.map((r) => r.id as string);

  console.log("-- DEPENDENCY CHECK --");
  for (const table of ["saved_jobs", "collection_jobs", "recently_viewed"] as const) {
    const { data: dependents, error: depError } = await supabase
      .from(table)
      .select("id, job_id, user_id")
      .in("job_id", ids);
    if (depError) throw depError;
    console.log(`${table}: ${dependents?.length ?? 0} dependent row(s) (ON DELETE CASCADE)`);
    for (const d of dependents ?? []) {
      console.log(`  ${table} id=${d.id} -> job_id=${d.job_id} (user_id=${d.user_id})`);
    }
  }

  const { data: apps, error: appsError } = await supabase
    .from("applications")
    .select("id, job_id, company_name, role")
    .in("job_id", ids);
  if (appsError) throw appsError;
  console.log(
    `\napplications: ${apps?.length ?? 0} row(s) reference a candidate (ON DELETE SET NULL — safe, company_name/role already denormalized)`,
  );
  for (const a of apps ?? []) {
    console.log(
      `  application id=${a.id} -> job_id=${a.job_id} ("${a.role}" at "${a.company_name}")`,
    );
  }

  writeFileSync(outPath, JSON.stringify(candidates, null, 2), "utf-8");
  console.log(`\nBacked up ${candidates.length} full rows to ${outPath}`);
  console.log("== Prep complete — no rows were modified ==");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
