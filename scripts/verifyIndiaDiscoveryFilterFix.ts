// ── Read-only verification: the India/Indianapolis substring-collision fix ──
//
// Proves the ACTUAL PostgREST query (not just the in-process JS mirror) both
// (a) is syntactically accepted by Supabase/PostgREST — there is no
// dedicated JobRepository test file, so this is the only thing that can
// catch a query-string mistake before production — and (b) returns the
// expected result shape against the real table.
//
// Zero writes. Every query is a plain `.select()` count/list.
//
// Run with: npx vite-node scripts/verifyIndiaDiscoveryFilterFix.ts

import { createServiceSupabase } from "../src/server/supabase";
import { foreignLocationExclusions, indiaDiscoveryFilter } from "../src/features/jobs/indiaPlaces";

async function main(): Promise<void> {
  const supabase = createServiceSupabase();

  console.log("== Read-only verification — no writes performed ==\n");

  // 1. Does PostgREST accept the compound filter at all?
  const start = Date.now();
  let query = supabase
    .from("global_jobs")
    .select("id, city, state, country, location", { count: "exact" })
    .or(indiaDiscoveryFilter());
  for (const clause of foreignLocationExclusions()) {
    query = query.or(clause);
  }
  const { data, error, count } = await query.limit(1000);
  const elapsedMs = Date.now() - start;

  if (error) {
    console.error("QUERY FAILED — PostgREST rejected the filter:", error);
    process.exit(1);
  }

  console.log(`Query succeeded in ${elapsedMs}ms.`);
  console.log(`Rows matching the NEW two-sided filter: ${count}`);

  // 2. Compare against the OLD (India-signal-only) count, to see how many
  // rows the foreign-exclusion half actually removes in live data.
  const { count: oldCount, error: oldError } = await supabase
    .from("global_jobs")
    .select("id", { count: "exact", head: true })
    .or(indiaDiscoveryFilter());
  if (oldError) throw oldError;
  console.log(`Rows matching the India-signal-ONLY (old) filter: ${oldCount}`);
  console.log(`Rows removed by the new foreign-exclusion check: ${(oldCount ?? 0) - (count ?? 0)}`);

  // 3. Print any removed rows so a human can eyeball them — did the
  // foreign-exclusion half actually catch something real, and does it look
  // like a genuine foreign posting rather than a false removal?
  const { data: oldRows, error: oldRowsError } = await supabase
    .from("global_jobs")
    .select("id, city, state, country, location")
    .or(indiaDiscoveryFilter())
    .limit(2000);
  if (oldRowsError) throw oldRowsError;

  const newIds = new Set((data ?? []).map((r) => r.id));
  const removed = (oldRows ?? []).filter((r) => !newIds.has(r.id));
  console.log(`\n${removed.length} row(s) removed by the foreign-exclusion check:`);
  for (const row of removed.slice(0, 30)) {
    console.log(
      `  [REMOVED] city=${row.city ?? "-"} state=${row.state ?? "-"} country=${row.country ?? "-"} location=${row.location ?? "-"}`,
    );
  }

  // 4. Query-length sanity check — print the exact character counts of the
  // pieces going into the request, since the foreign free-text pattern is
  // the largest single piece (countries + cities + subdivisions + global
  // scope combined).
  console.log("\n-- Filter size --");
  console.log(`indiaDiscoveryFilter() length: ${indiaDiscoveryFilter().length} chars`);
  for (const clause of foreignLocationExclusions()) {
    console.log(`  exclusion clause length: ${clause.length} chars`);
  }

  // 5. Explicitly verify a genuine India row with a NULL state/country is
  // not wrongly dropped anymore — this is the exact bug the first version
  // of this filter had (verified live: it dropped 118 of 319 genuine India
  // rows purely for having a NULL in some unrelated column).
  const { data: nullFieldIndiaRows } = await supabase
    .from("global_jobs")
    .select("id, city, state, country, location")
    .or(indiaDiscoveryFilter())
    .or("state.is.null,country.is.null")
    .limit(50);
  const stillVisible = (nullFieldIndiaRows ?? []).filter((r) => newIds.has(r.id));
  console.log(
    `\nGenuine-India rows sampled with a NULL state/country: ${nullFieldIndiaRows?.length ?? 0}; ` +
      `still visible under the new filter: ${stillVisible.length} ` +
      `(this should equal the sampled count — 0 would mean the NULL-collapse bug is back).`,
  );

  console.log("\n== Verification complete — no rows were modified ==");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
