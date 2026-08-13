// ── Module 11A: domain-based logo fallback (priority #2) ──
//
// For every company with a known `domain` but no `logo_url` yet, fetches
// Google's favicon-by-domain endpoint (see src/server/company/logo.ts for
// why this and not a paid/scraping alternative) and stores it. Deliberately
// separate from crawl ingestion — this never runs during a crawl, so a slow
// or unreachable favicon fetch can never affect crawl latency or success
// (see the migration's own header for the same point).
//
// Writing only ever touches `companies.logo_url` / `logo_source` /
// `logo_checked_at`. `companies_propagate_logo_trigger` (Module 11A
// migration) then fans each new logo out to every `global_jobs` row already
// linked to that company — this script never touches `global_jobs` itself.
//
// A "likely placeholder" (Google's generic globe icon, byte-size heuristic —
// see isLikelyPlaceholderFavicon) is still stored: a real, if generic, image
// is what CompanyMark already renders gracefully, and `logo_checked_at` stops
// this script from re-fetching the same domain on every future run. A human
// can always override `companies.logo_url` later; there is no destructive
// step here.
//
// DRY RUN BY DEFAULT — prints exactly what it would do and writes nothing.
// Pass --apply to actually write. Idempotent: companies already checked
// (`logo_checked_at IS NOT NULL`) are skipped on every subsequent run.
//
// Run with: npx vite-node scripts/resolveCompanyLogos.ts [--apply] [--limit=200]

import { createServiceSupabase } from "../src/server/supabase";
import { googleFaviconUrl, isLikelyPlaceholderFavicon } from "../src/server/company/logo";

const APPLY = process.argv.includes("--apply");
const limitArg = process.argv.find((a) => a.startsWith("--limit="));
const LIMIT = limitArg ? Number(limitArg.split("=")[1]) : 200;

async function main(): Promise<void> {
  console.log(
    APPLY
      ? "Running in APPLY mode — this WILL write to the database."
      : "Running in DRY RUN mode — no writes will be made. Pass --apply to write.",
  );
  const supabase = createServiceSupabase();

  const { data, error } = await supabase
    .from("companies")
    .select("id, name, domain")
    .is("logo_url", null)
    .is("logo_checked_at", null)
    .not("domain", "is", null)
    .limit(LIMIT);
  if (error) throw error;
  const companies = data ?? [];

  console.log(`${companies.length} companies have a known domain but no logo yet.`);

  let resolved = 0;
  let placeholder = 0;
  let failed = 0;

  for (const company of companies) {
    const domain = company.domain as string;
    const url = googleFaviconUrl(domain);
    if (!url) continue;

    let byteLength = 0;
    let ok = false;
    try {
      const res = await fetch(url);
      ok = res.ok;
      byteLength = (await res.arrayBuffer()).byteLength;
    } catch (err) {
      console.log(`[fail] ${company.name} (${domain}): ${(err as Error).message}`);
      failed++;
      continue;
    }

    if (!ok) {
      console.log(`[fail] ${company.name} (${domain}): favicon endpoint returned an error status`);
      failed++;
      continue;
    }

    const likelyPlaceholder = isLikelyPlaceholderFavicon(byteLength);
    if (likelyPlaceholder) placeholder++;
    else resolved++;
    console.log(
      `[${likelyPlaceholder ? "placeholder" : "ok"}] ${company.name} (${domain}) -> ${url} (${byteLength} bytes)`,
    );

    if (!APPLY) continue;

    const { error: updateError } = await supabase
      .from("companies")
      .update({
        logo_url: url,
        logo_source: "domain_favicon",
        logo_checked_at: new Date().toISOString(),
      })
      .eq("id", company.id);
    if (updateError) throw updateError;
  }

  console.log(
    `\nResolved: ${resolved}. Likely placeholder (still stored): ${placeholder}. Failed to fetch: ${failed}.`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
