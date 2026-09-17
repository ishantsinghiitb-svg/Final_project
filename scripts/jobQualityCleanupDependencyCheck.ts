// ── READ-ONLY: check for user-data dependents on the rows a cleanup would remove ──
//
// `saved_jobs`, `collection_jobs`, and `recently_viewed` all have
// `job_id ... ON DELETE CASCADE` to global_jobs — deleting a job row a real
// user saved/collected/recently-viewed would silently delete THEIR row too.
// `applications` and the interview-prep `job_id` column use
// `ON DELETE SET NULL` (safe — those tables denormalize company_name/role
// onto the row itself, so no user-visible data is lost). This script checks
// the CASCADE tables only, for exactly the 63 candidate rows, before any
// delete runs. No writes anywhere in this file.
//
// Run with: npx vite-node scripts/jobQualityCleanupDependencyCheck.ts

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
  const supabase = createServiceSupabase();

  const { data: rows, error } = await supabase
    .from("global_jobs")
    .select("id, source, role, description, department, job_function, technologies")
    .in("source", CRAWLER_SOURCES);
  if (error) throw error;

  const lowQualityIds = (rows ?? [])
    .filter(
      (r) =>
        !classifyJobQuality({
          role: r.role,
          description: r.description,
          department: r.department,
          jobFunction: r.job_function,
          technologies: r.technologies,
          source: r.source,
        }).retain,
    )
    .map((r) => r.id as string);

  console.log(`Checking ${lowQualityIds.length} candidate job IDs for CASCADE dependents...\n`);

  for (const table of ["saved_jobs", "collection_jobs", "recently_viewed"] as const) {
    const { data: dependents, error: depError } = await supabase
      .from(table)
      .select("id, job_id, user_id")
      .in("job_id", lowQualityIds);
    if (depError) throw depError;
    console.log(
      `${table}: ${dependents?.length ?? 0} dependent row(s) referencing a candidate job`,
    );
    for (const d of dependents ?? []) {
      console.log(`  ${table} id=${d.id} -> job_id=${d.job_id} (user_id=${d.user_id})`);
    }
  }

  // Applications and interview job_id are ON DELETE SET NULL — count them
  // for visibility only (no data loss expected), not as a blocker.
  const { data: apps, error: appsError } = await supabase
    .from("applications")
    .select("id, job_id, company_name, role")
    .in("job_id", lowQualityIds);
  if (appsError) throw appsError;
  console.log(
    `\napplications: ${apps?.length ?? 0} row(s) reference a candidate job (ON DELETE SET NULL — safe, company_name/role are already denormalized on the row)`,
  );
  for (const a of apps ?? []) {
    console.log(
      `  application id=${a.id} -> job_id=${a.job_id} ("${a.role}" at "${a.company_name}")`,
    );
  }

  console.log("\n== Dependency check complete — no rows were modified ==");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
