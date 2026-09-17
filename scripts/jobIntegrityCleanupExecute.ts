// ── PRODUCTION WRITE: remove crawler-sourced rows failing canonical eligibility ──
//
// The only write in this batch. Re-fetches crawler-sourced rows fresh and
// re-runs the crawler's OWN canonical checkJobEligibility (India +
// freshness — no second classifier) right now, then:
//   1. Hard-asserts every candidate is crawler-sourced and never an
//      extension source — throws (deletes nothing) if this ever fails.
//   2. Deletes ONLY those exact row IDs — never a broad WHERE clause.
//   3. Verifies the post-delete row count matches exactly.
// Extension-sourced rows are never read into the candidate set at all, so
// they cannot be affected regardless of their own eligibility result.
//
// Run with: npx vite-node scripts/jobIntegrityCleanupExecute.ts

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
const EXTENSION_SOURCES = ["linkedin", "naukri", "indeed", "unstop", "wellfound", "foundit"];

async function main(): Promise<void> {
  const supabase = createServiceSupabase();

  const { count: beforeTotal, error: countErr } = await supabase
    .from("global_jobs")
    .select("id", { count: "exact", head: true });
  if (countErr) throw countErr;

  const { data, error } = await supabase
    .from("global_jobs")
    .select("id, source, location, city, state, country, tags, role, posted_at, is_manual_import")
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

  for (const r of candidates) {
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

  const ids = candidates.map((r) => r.id as string);
  console.log(
    `Deleting ${ids.length} verified crawler-sourced rows failing canonical eligibility...`,
  );

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
