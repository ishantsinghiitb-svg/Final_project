// ── Job quality classifier: READ-ONLY production dry run ──
//
// Classifies every EXISTING crawler-sourced global_jobs row with the new
// deterministic quality classifier (src/server/jobIntelligence/quality/
// jobQuality.ts) and reports what WOULD be retained/rejected — no writes,
// no deletes, nothing sent to the crawl pipeline. Scoped to the 6 crawler
// platforms only (Greenhouse/Lever/Ashby/SmartRecruiters/Workable/
// Internshala, plus the generic "careers"/"recruitee" career-page tags) —
// the extension-only sources (linkedin, naukri, indeed, unstop, wellfound,
// foundit) are a separate system and are never touched or counted here.
//
// Run with: npx vite-node scripts/jobQualityDryRun.ts

import { createServiceSupabase } from "../src/server/supabase";
import { classifyJobQuality } from "../src/server/jobIntelligence/quality/jobQuality";
import type { RoleFamily } from "../src/server/jobIntelligence/quality/roleTaxonomy";

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

type Row = {
  id: string;
  source: string;
  role: string;
  description: string | null;
  department: string | null;
  job_function: string | null;
  technologies: string[] | null;
};

async function fetchAllRows(supabase: ReturnType<typeof createServiceSupabase>): Promise<Row[]> {
  const pageSize = 1000;
  let from = 0;
  const all: Row[] = [];
  for (;;) {
    const { data, error } = await supabase
      .from("global_jobs")
      .select("id, source, role, description, department, job_function, technologies")
      .in("source", CRAWLER_SOURCES)
      .range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...(data as Row[]));
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

function topN(counts: Map<string, number>, n: number): Array<[string, number]> {
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
}

function pct(n: number, total: number): string {
  return total === 0 ? "0.0%" : `${((n / total) * 100).toFixed(1)}%`;
}

async function main(): Promise<void> {
  const supabase = createServiceSupabase();
  const rows = await fetchAllRows(supabase);

  console.log("== JOB QUALITY CLASSIFIER — READ-ONLY PRODUCTION DRY RUN ==");
  console.log(`Generated at: ${new Date().toISOString()}`);
  console.log("No rows were modified or deleted. No crawl was run.\n");

  // 1. Current total jobs (crawler-sourced only — extension sources excluded).
  console.log("-- 1. TOTAL (crawler-sourced rows only) --");
  console.log(`total crawler-sourced global_jobs: ${rows.length}`);

  // 2. Jobs by platform.
  console.log("\n-- 2. JOBS BY PLATFORM --");
  const byPlatform = new Map<string, Row[]>();
  for (const r of rows) {
    const list = byPlatform.get(r.source) ?? [];
    list.push(r);
    byPlatform.set(r.source, list);
  }
  for (const [source, list] of [...byPlatform.entries()].sort(
    (a, b) => b[1].length - a[1].length,
  )) {
    console.log(`  ${source}: ${list.length}`);
  }

  // Classify every row once; reuse for the remaining sections.
  const decisions = rows.map((r) => ({
    row: r,
    decision: classifyJobQuality({
      role: r.role,
      description: r.description,
      department: r.department,
      jobFunction: r.job_function,
      technologies: r.technologies,
      source: r.source,
    }),
  }));

  const retained = decisions.filter((d) => d.decision.retain);
  const rejected = decisions.filter((d) => !d.decision.retain);

  // 3/4. Retained/rejected totals.
  console.log("\n-- 3 & 4. RETAINED vs REJECTED (overall) --");
  console.log(`retained: ${retained.length}`);
  console.log(`rejected: ${rejected.length}`);
  console.log(`overall retention: ${pct(retained.length, rows.length)}`);

  // 5/6. Retention/rejection percentage by platform.
  console.log("\n-- 5 & 6. RETENTION / REJECTION % BY PLATFORM --");
  for (const [source, list] of [...byPlatform.entries()].sort(
    (a, b) => b[1].length - a[1].length,
  )) {
    const platformRetained = list.filter(
      (r) => decisions.find((d) => d.row.id === r.id)?.decision.retain,
    ).length;
    const platformRejected = list.length - platformRetained;
    console.log(
      `  ${source}: ${list.length} total -> retain ${platformRetained} (${pct(platformRetained, list.length)}), reject ${platformRejected} (${pct(platformRejected, list.length)})`,
    );
  }

  // 7/8. Role-family breakdown for retained/rejected.
  function familyBreakdown(set: typeof decisions): Map<string, number> {
    const counts = new Map<string, number>();
    for (const d of set) {
      const key = (d.decision.primaryFamily ?? "unclassified") as RoleFamily | "unclassified";
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }

  console.log("\n-- 7. ROLE-FAMILY BREAKDOWN (retained) --");
  for (const [family, n] of topN(familyBreakdown(retained), 20)) {
    console.log(`  ${family}: ${n} (${pct(n, retained.length)})`);
  }

  console.log("\n-- 8. ROLE-FAMILY BREAKDOWN (rejected) --");
  for (const [family, n] of topN(familyBreakdown(rejected), 20)) {
    console.log(`  ${family}: ${n} (${pct(n, rejected.length)})`);
  }

  // 9/10. Top 50 rejected / retained titles (by raw title, case-preserved, frequency).
  function titleCounts(set: typeof decisions): Map<string, number> {
    const counts = new Map<string, number>();
    for (const d of set) {
      const title = d.row.role?.trim() || "(blank)";
      counts.set(title, (counts.get(title) ?? 0) + 1);
    }
    return counts;
  }

  console.log("\n-- 9. TOP 50 REJECTED TITLES --");
  for (const [title, n] of topN(titleCounts(rejected), 50)) {
    console.log(`  ${n}x  ${title}`);
  }

  console.log("\n-- 10. TOP 50 RETAINED TITLES --");
  for (const [title, n] of topN(titleCounts(retained), 50)) {
    console.log(`  ${n}x  ${title}`);
  }

  // 11. Borderline/uncertain examples.
  console.log("\n-- 11. BORDERLINE / UNCERTAIN EXAMPLES (classifier is close to its threshold) --");
  const borderline = decisions.filter((d) => d.decision.borderline);
  console.log(
    `total borderline: ${borderline.length} (${pct(borderline.length, rows.length)} of all rows)\n`,
  );
  const sample = borderline.slice(0, 40);
  for (const d of sample) {
    console.log(
      `  [${d.decision.retain ? "RETAIN" : "REJECT"}] "${d.row.role}" (${d.row.source}, score ${d.decision.score} vs threshold ${d.decision.threshold}) — ${d.decision.reason}`,
    );
  }

  console.log("\n== Dry run complete — no rows were modified or deleted ==");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
