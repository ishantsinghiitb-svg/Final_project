// ── READ-ONLY sanity check: Workable + Internshala rejected/borderline rows ──
//
// Full detail (title, description excerpt, score, reason) for every rejected
// row on these two platforms — the two the product brief specifically asked
// to eyeball before any production change. No writes anywhere.
//
// Run with: npx vite-node scripts/jobQualitySanityCheck.ts

import { createServiceSupabase } from "../src/server/supabase";
import { classifyJobQuality } from "../src/server/jobIntelligence/quality/jobQuality";

type Row = {
  id: string;
  source: string;
  role: string;
  description: string | null;
  department: string | null;
  job_function: string | null;
  technologies: string[] | null;
};

async function main(): Promise<void> {
  const supabase = createServiceSupabase();
  const { data, error } = await supabase
    .from("global_jobs")
    .select("id, source, role, description, department, job_function, technologies")
    .in("source", ["workable", "internshala"]);
  if (error) throw error;

  const rows = (data ?? []) as Row[];

  console.log("== QUALITY CLASSIFIER SANITY CHECK — Workable & Internshala (read-only) ==\n");
  console.log("No rows were modified. This only classifies and prints.\n");

  for (const platform of ["workable", "internshala"]) {
    const platformRows = rows.filter((r) => r.source === platform);
    const classified = platformRows.map((r) => ({
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
    const rejected = classified.filter((d) => !d.decision.retain);
    const retained = classified.filter((d) => d.decision.retain);

    console.log(
      `\n=== ${platform.toUpperCase()}: ${platformRows.length} total, ${retained.length} retained, ${rejected.length} rejected ===`,
    );

    console.log(`\n-- RETAINED (${retained.length}) --`);
    for (const { row, decision } of retained) {
      console.log(
        `  [RETAIN] "${row.role}" — score ${decision.score} — ${decision.signals.join(", ")}`,
      );
    }

    console.log(`\n-- REJECTED (${rejected.length}) --`);
    for (const { row, decision } of rejected) {
      const desc = (row.description ?? "").replace(/\s+/g, " ").trim().slice(0, 200);
      console.log(
        `  [REJECT${decision.borderline ? " / BORDERLINE" : ""}] "${row.role}" (id=${row.id.slice(0, 8)}) — score ${decision.score} vs threshold ${decision.threshold}` +
          `\n    description: ${desc || "(none)"}`,
      );
    }
  }

  console.log("\n== Sanity check complete — no rows were modified ==");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
