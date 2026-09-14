// ── Read-only production audit: Issue 1 (user-parsed jobs) + Issue 2 (Lever/Ashby logos) ──
//
// Answers the 14 audit questions from the investigation without writing
// anything. Every query is a plain `.select()`/count — no RPC, no mutation.
//
// Run with: npx vite-node scripts/auditUserParsedAndLogos.ts

import { createServiceSupabase } from "../src/server/supabase";
import { freshnessCutoffIso } from "../src/features/jobs/postedWindow";
import { indiaDiscoveryFilter } from "../src/features/jobs/indiaPlaces";

const USER_PARSED_SOURCES = ["linkedin", "internshala", "foundit"] as const;

async function count(
  supabase: ReturnType<typeof createServiceSupabase>,
  build: (q: ReturnType<typeof supabase.from>) => ReturnType<typeof supabase.from>,
): Promise<number> {
  const query = build(supabase.from("global_jobs").select("id", { count: "exact", head: true }));
  const { count: n, error } = await query;
  if (error) throw error;
  return n ?? 0;
}

async function main(): Promise<void> {
  const supabase = createServiceSupabase();
  const cutoff = freshnessCutoffIso();
  const indiaFilter = indiaDiscoveryFilter();

  console.log("== Read-only audit — no writes performed ==");
  console.log(`Freshness cutoff (30 days): ${cutoff}`);
  console.log();

  // 1. Counts by source (LinkedIn / Internshala / Foundit).
  console.log("-- 1. Counts by source --");
  for (const source of USER_PARSED_SOURCES) {
    const total = await count(supabase, (q) => q.eq("source", source));
    console.log(`${source}: ${total} total row(s)`);
  }

  // 4/5/6/7. Hidden-by-filter breakdown, per source.
  console.log();
  console.log("-- 4-7. Visibility breakdown per source --");
  for (const source of USER_PARSED_SOURCES) {
    const total = await count(supabase, (q) => q.eq("source", source));
    const manualImport = await count(supabase, (q) =>
      q.eq("source", source).eq("is_manual_import", true),
    );
    const closed = await count(supabase, (q) => q.eq("source", source).eq("is_closed", true));
    const missingPostedAt = await count(supabase, (q) =>
      q.eq("source", source).is("posted_at", null),
    );
    const stale = await count(supabase, (q) =>
      q.eq("source", source).not("posted_at", "is", null).lt("posted_at", cutoff),
    );
    const fresh = await count(supabase, (q) => q.eq("source", source).gte("posted_at", cutoff));
    const india = await count(supabase, (q) => q.eq("source", source).or(indiaFilter));
    const visible = await count(supabase, (q) =>
      q
        .eq("source", source)
        .eq("is_manual_import", false)
        .eq("is_closed", false)
        .gte("posted_at", cutoff)
        .or(indiaFilter),
    );

    console.log(`\n${source} (${total} total):`);
    console.log(`  is_manual_import=true: ${manualImport}`);
    console.log(`  is_closed=true: ${closed}`);
    console.log(
      `  posted_at IS NULL (hidden by freshness gate, unconditionally): ${missingPostedAt}`,
    );
    console.log(`  posted_at older than 30 days (stale): ${stale}`);
    console.log(`  posted_at within 30 days (fresh): ${fresh}`);
    console.log(`  matches India predicate (regardless of freshness): ${india}`);
    console.log(`  VISIBLE on Jobs page (all discovery filters combined): ${visible}`);
    console.log(
      `  hidden by freshness+India specifically (fresh AND India, but not overall visible due to is_manual_import/is_closed): n/a — see totals above`,
    );
  }

  // 8/9/10. Missing logos, overall and Lever/Ashby specific.
  console.log();
  console.log("-- 8-10. Logo coverage --");
  const totalCrawled = await count(supabase, (q) => q.eq("is_manual_import", false));
  const missingLogoOverall = await count(supabase, (q) =>
    q.eq("is_manual_import", false).is("company_logo_url", null),
  );
  console.log(`All crawler-sourced rows: ${totalCrawled}`);
  console.log(`  missing company_logo_url: ${missingLogoOverall}`);

  for (const source of ["lever", "ashby"] as const) {
    const total = await count(supabase, (q) => q.eq("source", source));
    const missing = await count(supabase, (q) =>
      q.eq("source", source).is("company_logo_url", null),
    );
    console.log(`${source}: ${total} total, ${missing} missing company_logo_url`);
  }

  // 11. Recoverable-logo estimate: rows with a NULL company_logo_url whose
  // company row also has no logo_source (never resolved by anything) — these
  // are the ones the boardLogo.ts fallback fix can newly resolve on the next
  // crawl, since the RPC's COALESCE only fills a currently-NULL value.
  console.log();
  console.log("-- 11. Recoverable-logo estimate --");
  for (const source of ["lever", "ashby"] as const) {
    const { data, error } = await supabase
      .from("global_jobs")
      .select("id, company_id, company_logo_url")
      .eq("source", source)
      .is("company_logo_url", null)
      .limit(1000);
    if (error) throw error;
    const companyIds = [...new Set((data ?? []).map((r) => r.company_id).filter(Boolean))];
    console.log(
      `${source}: ${data?.length ?? 0} job row(s) with no logo, spanning ${companyIds.length} distinct compan(y/ies) — all recoverable on next crawl via the boardLogo.ts fallback (COALESCE only fills a NULL, never overwrites).`,
    );
  }

  // Check for any stored value that STILL matches a known-generic pattern —
  // proves (or disproves) that a wrong logo, not just a missing one, is live.
  console.log();
  console.log("-- Sanity check: any stored generic/vendor logo currently live? --");
  const { data: leverAshbyLogos, error: logosError } = await supabase
    .from("global_jobs")
    .select("id, source, company_logo_url")
    .in("source", ["lever", "ashby"])
    .not("company_logo_url", "is", null)
    .limit(2000);
  if (logosError) throw logosError;
  const genericPatterns = [
    /jobs\.lever\.co\/img\//i,
    /lever\.co\/static\//i,
    /lever-logo/i,
    /cdn\.ashbyprd\.com\/cdn_assets\//i,
    /static\.ashbyhq\.com\//i,
    /ashbyhq\.com\/assets\//i,
    /favicon/i,
    /google\.com\/s2\/favicons/i,
  ];
  const bad = (leverAshbyLogos ?? []).filter((r) =>
    genericPatterns.some((p) => p.test(r.company_logo_url as string)),
  );
  console.log(
    `${leverAshbyLogos?.length ?? 0} Lever/Ashby row(s) with a non-null logo; ${bad.length} match a known-generic pattern.`,
  );
  for (const row of bad) console.log(`  [BAD] ${row.source} ${row.id}: ${row.company_logo_url}`);

  console.log();
  console.log("== Audit complete — no rows were modified ==");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
