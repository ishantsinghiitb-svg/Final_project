// ── Post-deployment final production audit (read-only) ──
// Covers: totals, freshness buckets, location eligibility, source breakdown,
// logo breakdown, duplicate fingerprints, security tokens, and the critical
// India-substring-collision spot check. No writes anywhere in this file.
//
// Run with: npx vite-node scripts/finalProductionAudit.ts

import { createServiceSupabase } from "../src/server/supabase";
import { freshnessCutoffIso } from "../src/features/jobs/postedWindow";
import { matchesIndiaDiscoveryFilter, indiaDiscoveryFilter } from "../src/features/jobs/indiaPlaces";
import { isGenericPlatformImage } from "../src/server/jobIntelligence/logo/companyLogo";

type Row = {
  id: string;
  source: string | null;
  posted_at: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  location: string | null;
  company_logo_url: string | null;
  is_manual_import: boolean | null;
  is_closed: boolean | null;
  fingerprint: string | null;
  description_html: string | null;
};

async function fetchAllRows(supabase: ReturnType<typeof createServiceSupabase>): Promise<Row[]> {
  const pageSize = 1000;
  let from = 0;
  const all: Row[] = [];
  for (;;) {
    const { data, error } = await supabase
      .from("global_jobs")
      .select(
        "id, source, posted_at, city, state, country, location, company_logo_url, is_manual_import, is_closed, fingerprint, description_html",
      )
      .range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...(data as Row[]));
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

async function main(): Promise<void> {
  const supabase = createServiceSupabase();
  const now = new Date();
  const cutoff30 = freshnessCutoffIso(now);
  const cutoff7 = new Date(now.getTime() - 7 * 24 * 3600 * 1000).toISOString();

  const rows = await fetchAllRows(supabase);
  console.log("== FINAL PRODUCTION AUDIT (read-only) ==");
  console.log(`Generated at: ${now.toISOString()}\n`);

  // TOTAL
  console.log("-- TOTAL --");
  console.log(`total global_jobs: ${rows.length}`);

  const visibleCandidates = rows.filter(
    (r) => !r.is_manual_import && !r.is_closed && r.posted_at && r.posted_at >= cutoff30,
  );
  const visible = visibleCandidates.filter((r) =>
    matchesIndiaDiscoveryFilter({
      country: r.country,
      location: r.location,
      city: r.city,
      state: r.state,
    }),
  );
  console.log(`total visible on Jobs page (JS-mirror of the real filter): ${visible.length}`);

  // FRESHNESS
  console.log("\n-- FRESHNESS --");
  const within7 = rows.filter((r) => r.posted_at && r.posted_at >= cutoff7).length;
  const within30not7 = rows.filter(
    (r) => r.posted_at && r.posted_at < cutoff7 && r.posted_at >= cutoff30,
  ).length;
  const older30 = rows.filter((r) => r.posted_at && r.posted_at < cutoff30).length;
  const nullPosted = rows.filter((r) => !r.posted_at).length;
  console.log(`<=7 days: ${within7}`);
  console.log(`8-30 days: ${within30not7}`);
  console.log(`>30 days: ${older30}`);
  console.log(`NULL posted_at: ${nullPosted}`);

  // LOCATION
  console.log("\n-- LOCATION --");
  let indiaEligible = 0;
  let nonIndia = 0;
  for (const r of rows) {
    const fields = { country: r.country, location: r.location, city: r.city, state: r.state };
    if (matchesIndiaDiscoveryFilter(fields)) indiaEligible++;
    else nonIndia++;
  }
  console.log(`India eligible (matches the two-sided rule): ${indiaEligible}`);
  console.log(`non-India / no India signal: ${nonIndia}`);

  // SOURCE
  console.log("\n-- SOURCE --");
  const sources = ["linkedin", "internshala", "foundit", "lever", "ashby", "greenhouse", "smartrecruiters", "workable", "weworkremotely"];
  const sourceCounts = new Map<string, number>();
  for (const r of rows) sourceCounts.set(r.source ?? "null", (sourceCounts.get(r.source ?? "null") ?? 0) + 1);
  for (const s of sources) console.log(`${s}: ${sourceCounts.get(s) ?? 0}`);
  const others = [...sourceCounts.entries()].filter(([k]) => !sources.includes(k));
  if (others.length > 0) console.log("other sources:", JSON.stringify(others));

  // LOGOS
  console.log("\n-- LOGOS --");
  const withLogo = rows.filter((r) => r.company_logo_url);
  const nullLogo = rows.filter((r) => !r.company_logo_url).length;
  const generic = withLogo.filter((r) => isGenericPlatformImage(r.company_logo_url));
  const favicon = withLogo.filter((r) => /favicon/i.test(r.company_logo_url ?? ""));
  const domainFavicon = withLogo.filter((r) => /google\.com\/s2\/favicons/i.test(r.company_logo_url ?? ""));
  console.log(`genuine employer logos: ${withLogo.length - generic.length}`);
  console.log(`NULL logos: ${nullLogo}`);
  console.log(`generic/vendor logos: ${generic.length}`);
  console.log(`favicon-pattern logos: ${favicon.length}`);
  console.log(`Google-favicon-service logos: ${domainFavicon.length}`);
  if (generic.length > 0) {
    for (const r of generic.slice(0, 10)) console.log(`  [BAD] ${r.id} (${r.source}): ${r.company_logo_url}`);
  }

  // DUPLICATES
  console.log("\n-- DUPLICATES --");
  const fpCounts = new Map<string, number>();
  for (const r of rows) {
    if (!r.fingerprint) continue;
    fpCounts.set(r.fingerprint, (fpCounts.get(r.fingerprint) ?? 0) + 1);
  }
  const dupeFps = [...fpCounts.entries()].filter(([, n]) => n > 1);
  console.log(`duplicate fingerprints (appearing >1 time): ${dupeFps.length}`);
  if (dupeFps.length > 0) console.log(dupeFps.slice(0, 5));

  // SECURITY
  console.log("\n-- SECURITY --");
  const dangerousPattern = /<script|onerror=|onload=|javascript:|<iframe|<object|<embed/i;
  const dangerous = rows.filter((r) => r.description_html && dangerousPattern.test(r.description_html));
  console.log(`rows with description_html: ${rows.filter((r) => r.description_html).length}`);
  console.log(`rows with a dangerous HTML token: ${dangerous.length}`);

  const { data: wwrEntries } = await supabase
    .from("crawl_company_registry")
    .select("id, enabled")
    .eq("platform", "weworkremotely");
  const enabledWwr = (wwrEntries ?? []).filter((e) => e.enabled).length;
  console.log(`WWR registry entries enabled: ${enabledWwr} (must be 0)`);

  // CRITICAL INDIA AUDIT — the exact suspicious/legitimate cases named.
  console.log("\n-- CRITICAL INDIA AUDIT --");
  const suspiciousCases: Array<{ city?: string; state?: string; country?: string; location?: string }> = [
    { city: "Indianapolis" },
    { state: "Indiana" },
    { location: "India/US" },
    { location: "India/United States" },
    { city: "Hyderabad", country: "Pakistan" },
    { city: "Salem", state: "Oregon" },
    { city: "Mumbai", location: "Mumbai, New York" },
  ];
  for (const c of suspiciousCases) {
    const result = matchesIndiaDiscoveryFilter(c);
    console.log(`  ${JSON.stringify(c)} -> visible=${result} (must be false)`);
  }
  const legitimateCases: Array<{ city?: string; location?: string }> = [
    { city: "Mumbai" },
    { city: "Bengaluru" },
    { city: "Delhi" },
    { city: "Hyderabad", location: "Hyderabad, India" },
    { location: "Remote, India" },
  ];
  for (const c of legitimateCases) {
    const result = matchesIndiaDiscoveryFilter(c);
    console.log(`  ${JSON.stringify(c)} -> visible=${result} (must be true)`);
  }

  // Scan ACTUAL production rows for any suspicious location text.
  console.log("\n-- Scanning actual production rows for suspicious location text --");
  const suspiciousTextPattern = /indianapolis|\bindiana\b|pakistan|salem.*oregon|new york/i;
  const suspiciousRows = rows.filter((r) => {
    const blob = `${r.city ?? ""} ${r.state ?? ""} ${r.location ?? ""}`;
    return suspiciousTextPattern.test(blob);
  });
  console.log(`Rows with suspicious location text: ${suspiciousRows.length}`);
  for (const r of suspiciousRows) {
    const eligible = matchesIndiaDiscoveryFilter({
      country: r.country,
      location: r.location,
      city: r.city,
      state: r.state,
    });
    console.log(
      `  id=${r.id} source=${r.source} city=${r.city} state=${r.state} country=${r.country} location=${r.location} -> india-eligible=${eligible}`,
    );
  }

  console.log("\n== Audit complete — no rows were modified ==");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
