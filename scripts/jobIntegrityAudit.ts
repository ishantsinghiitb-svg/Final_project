// ── READ-ONLY audit: canonical India/freshness eligibility on EXISTING rows ──
//
// Classifies every current global_jobs row using the crawler's OWN canonical
// ingestion-time eligibility check (checkJobEligibility, which internally
// calls isIndiaJobLocation and isFreshJob — the exact functions
// EligibilityFilteringJobParser already wires into every live crawl). No new
// classifier is introduced here, and none of it writes to the database.
//
// This is deliberately the STRICTER, two-sided ingestion-time check, not the
// more permissive Jobs-page DISPLAY filter (matchesIndiaDiscoveryFilter) that
// scripts/finalProductionAudit.ts uses — the product brief specifically asked
// for "the same canonical India eligibility implementation already used by
// the crawler", which is this one.
//
// Run with: npx vite-node scripts/jobIntegrityAudit.ts

import { createServiceSupabase } from "../src/server/supabase";
import { checkJobEligibility } from "../src/server/jobIntelligence/eligibility/jobEligibility";

const EXTENSION_SOURCES = ["linkedin", "naukri", "indeed", "unstop", "wellfound", "foundit"];
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
  company_name: string;
  location: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  tags: string[] | null;
  posted_at: string | null;
  created_at: string;
};

async function main(): Promise<void> {
  const supabase = createServiceSupabase();
  const { data, error } = await supabase
    .from("global_jobs")
    .select(
      "id, source, role, company_name, location, city, state, country, tags, posted_at, created_at",
    );
  if (error) throw error;
  const rows = (data ?? []) as Row[];

  console.log("== JOB INTEGRITY AUDIT — canonical crawler eligibility (read-only) ==\n");
  console.log(`total global_jobs: ${rows.length}`);

  const now = new Date();
  const classified = rows.map((r) => {
    const isExtension = EXTENSION_SOURCES.includes(r.source);
    const isCrawler = CRAWLER_SOURCES.includes(r.source);
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
    return { row: r, isExtension, isCrawler, decision };
  });

  const extensionRows = classified.filter((c) => c.isExtension);
  const crawlerRows = classified.filter((c) => c.isCrawler);
  const otherRows = classified.filter((c) => !c.isExtension && !c.isCrawler);

  console.log(`extension-sourced: ${extensionRows.length}`);
  console.log(`crawler-sourced: ${crawlerRows.length}`);
  if (otherRows.length > 0) {
    console.log(
      `unrecognized source: ${otherRows.length} — ${[...new Set(otherRows.map((c) => c.row.source))].join(", ")}`,
    );
  }

  const crawlerFailing = crawlerRows.filter((c) => !c.decision.eligible);
  const crawlerPassing = crawlerRows.filter((c) => c.decision.eligible);
  console.log(
    `\ncrawler-sourced PASSING canonical eligibility (India + <=30 days): ${crawlerPassing.length}`,
  );
  console.log(`crawler-sourced FAILING canonical eligibility: ${crawlerFailing.length}`);

  const crawlerFailingLocation = crawlerFailing.filter(
    (c) => !c.decision.eligible && c.decision.kind === "location",
  );
  const crawlerFailingFreshness = crawlerFailing.filter(
    (c) => !c.decision.eligible && c.decision.kind === "freshness",
  );
  console.log(`  of which failing on LOCATION (not India): ${crawlerFailingLocation.length}`);
  console.log(
    `  of which failing on FRESHNESS (>30 days or no posted date): ${crawlerFailingFreshness.length}`,
  );

  console.log("\n-- CRAWLER-SOURCED ROWS FAILING (full detail — REMOVAL CANDIDATES) --");
  for (const c of crawlerFailing) {
    const d = c.decision;
    console.log(
      `  id=${c.row.id}\n` +
        `    source=${c.row.source} title="${c.row.role}" company="${c.row.company_name}"\n` +
        `    location="${c.row.location ?? ""}" city="${c.row.city ?? ""}" state="${c.row.state ?? ""}" country="${c.row.country ?? ""}"\n` +
        `    posted_at=${c.row.posted_at ?? "NULL"} created_at=${c.row.created_at}\n` +
        `    extension_sourced=${c.isExtension} crawler_sourced=${c.isCrawler}\n` +
        `    ${d.eligible ? "" : `FAILS: ${d.kind} — ${d.reason}`}\n`,
    );
  }

  const extensionFailing = extensionRows.filter((c) => !c.decision.eligible);
  const extensionPassing = extensionRows.filter((c) => c.decision.eligible);
  console.log(
    `\n-- EXTENSION-SOURCED ROWS (never removed regardless of this result — reported only) --`,
  );
  console.log(`extension rows PASSING canonical eligibility: ${extensionPassing.length}`);
  console.log(
    `extension rows FAILING canonical eligibility (PRESERVED, not touched): ${extensionFailing.length}`,
  );
  for (const c of extensionFailing) {
    const d = c.decision;
    console.log(
      `  id=${c.row.id}\n` +
        `    source=${c.row.source} title="${c.row.role}" company="${c.row.company_name}"\n` +
        `    location="${c.row.location ?? ""}" city="${c.row.city ?? ""}" state="${c.row.state ?? ""}" country="${c.row.country ?? ""}"\n` +
        `    posted_at=${c.row.posted_at ?? "NULL"} created_at=${c.row.created_at}\n` +
        `    ${d.eligible ? "" : `FAILS: ${d.kind} — ${d.reason}`} (PRESERVED — extension-sourced)\n`,
    );
  }

  console.log("\n== Audit complete — no rows were modified ==");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
