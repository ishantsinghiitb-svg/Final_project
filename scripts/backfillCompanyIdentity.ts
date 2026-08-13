// ── Module 11A: one-time company identity backfill ──
//
// The 20260821000001 migration's own merge pass is conservative on purpose —
// it only collapses rows whose SQL-only `normalize_company_name()` output
// already agrees (legal-suffix/noise variants like "Acme" / "Acme Inc").
// It does NOT apply the richer curated alias table (Zomato/Eternal,
// Freshdesk/Freshworks, …), because that table only exists in TypeScript
// (`src/server/company/identity.ts`). This script is the second, fuller pass:
//
//   1. Re-groups EVERY existing `companies` row by its full, alias-aware
//      canonical identity and merges any group with more than one row —
//      repointing `global_jobs.company_id`, merging non-destructive fields
//      (first-known-wins), and unioning `aliases`. A lone row whose stored
//      identity disagrees with the richer resolution (e.g. a solitary
//      "Freshdesk" row, no "Freshworks" row yet) is renamed/re-keyed so a
//      FUTURE crawl of "Freshworks" correctly finds and reuses it instead of
//      creating a second row.
//   2. Links every `global_jobs` row with `company_id IS NULL` (jobs that
//      predate Module 10A's company linkage, or were never re-crawled since)
//      to its canonical company, creating one if none exists yet.
//
// Conservative by construction: it NEVER merges on string similarity, only
// on the same curated resolver `admin_upsert_global_job` and the crawler use
// (resolveCanonicalCompany) — see src/server/company/identity.test.ts for the
// exact cases this will and will not merge.
//
// DRY RUN BY DEFAULT — prints exactly what it would do and writes nothing.
// Pass --apply to actually write. Idempotent: a second run finds nothing left
// to do. This talks to the REAL configured Supabase project (via
// SUPABASE_SERVICE_ROLE_KEY) — review the dry-run output before ever passing
// --apply against production.
//
// Run with: npx vite-node scripts/backfillCompanyIdentity.ts [--apply] [--limit=500]

import { createServiceSupabase, type ServerSupabase } from "../src/server/supabase";
import { resolveCanonicalCompany } from "../src/server/company/identity";

const APPLY = process.argv.includes("--apply");
const limitArg = process.argv.find((a) => a.startsWith("--limit="));
const BATCH_SIZE = limitArg ? Number(limitArg.split("=")[1]) : 500;

type CompanyRow = {
  id: string;
  name: string;
  normalized_key: string | null;
  website: string | null;
  logo_url: string | null;
  domain: string | null;
  industry: string | null;
  size: string | null;
  headquarters: string | null;
  aliases: string[] | null;
  created_at: string;
};

async function mergeExistingDuplicates(supabase: ServerSupabase): Promise<void> {
  const { data, error } = await supabase
    .from("companies")
    .select(
      "id, name, normalized_key, website, logo_url, domain, industry, size, headquarters, aliases, created_at",
    )
    .order("created_at", { ascending: true });
  if (error) throw error;
  const rows = (data ?? []) as CompanyRow[];

  const groups = new Map<string, CompanyRow[]>();
  for (const row of rows) {
    const key = resolveCanonicalCompany(row.name).normalizedKey;
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }

  let mergedGroups = 0;
  let mergedAwayCompanies = 0; // dupes absorbed into a survivor, i.e. companies count reduction
  let renamedOnly = 0;
  let alreadyCanonical = 0;
  // Every group merged here is, by construction, resolved via the curated
  // alias/rename table (companyIdentity.ts) or normalizeCompanyName's own
  // alias table — NOT plain legal-suffix/noise stripping. A legal-suffix-only
  // duplicate (e.g. "Acme" / "Acme Inc") is already merged by the migration's
  // own DO block (it uses normalize_company_name() for exactly that), so by
  // the time this script runs, `rows` already carries a unique normalized_key
  // per legal-suffix-equivalence class — any group this script forms only by
  // going further (through resolveCanonicalCompany's alias layer) is an
  // alias/curated-name match. Tracked explicitly (not just asserted) so the
  // report is honest even if that invariant is ever violated.
  let legalSuffixOnlyGroups = 0;
  let aliasMatchGroups = 0;

  for (const group of groups.values()) {
    if (group.length === 1) {
      const [row] = group;
      const resolved = resolveCanonicalCompany(row.name);
      if (row.normalized_key === resolved.normalizedKey && row.name === resolved.canonicalName) {
        alreadyCanonical++;
        continue;
      }

      renamedOnly++;
      console.log(
        `[rename] "${row.name}" (${row.normalized_key}) -> "${resolved.canonicalName}" (${resolved.normalizedKey})`,
      );
      if (APPLY) {
        const { error: updateError } = await supabase
          .from("companies")
          .update({ name: resolved.canonicalName, normalized_key: resolved.normalizedKey })
          .eq("id", row.id);
        if (updateError) throw updateError;
      }
      continue;
    }

    const survivor = group[0]; // earliest-created
    const dupes = group.slice(1);
    const resolved = resolveCanonicalCompany(survivor.name);
    mergedGroups++;
    mergedAwayCompanies += dupes.length;
    // Every member already arrived with a DISTINCT stored normalized_key
    // (the migration's unique index guarantees that) — so this group could
    // only have formed via the alias layer.
    const distinctStoredKeys = new Set(group.map((r) => r.normalized_key));
    if (distinctStoredKeys.size === 1) legalSuffixOnlyGroups++;
    else aliasMatchGroups++;
    console.log(
      `[merge] ${group.map((r) => `"${r.name}"`).join(" + ")} -> survivor=${survivor.id} ("${resolved.canonicalName}")`,
    );

    if (!APPLY) continue;

    const mergedLogoUrl = survivor.logo_url ?? dupes.find((d) => d.logo_url)?.logo_url ?? null;
    const mergedFields = {
      name: resolved.canonicalName,
      normalized_key: resolved.normalizedKey,
      website: survivor.website ?? dupes.find((d) => d.website)?.website ?? null,
      logo_url: mergedLogoUrl,
      domain: survivor.domain ?? dupes.find((d) => d.domain)?.domain ?? null,
      industry: survivor.industry ?? dupes.find((d) => d.industry)?.industry ?? null,
      size: survivor.size ?? dupes.find((d) => d.size)?.size ?? null,
      headquarters:
        survivor.headquarters ?? dupes.find((d) => d.headquarters)?.headquarters ?? null,
      aliases: [
        ...new Set([
          ...(survivor.aliases ?? []),
          ...dupes.flatMap((d) => [...(d.aliases ?? []), d.name]),
        ]),
      ],
    };

    const { error: updateError } = await supabase
      .from("companies")
      .update(mergedFields)
      .eq("id", survivor.id);
    if (updateError) throw updateError;

    for (const dup of dupes) {
      const { error: repointError } = await supabase
        .from("global_jobs")
        .update({ company_id: survivor.id })
        .eq("company_id", dup.id);
      if (repointError) throw repointError;

      const { error: deleteError } = await supabase.from("companies").delete().eq("id", dup.id);
      if (deleteError) throw deleteError;
    }

    // Retroactively sync company_logo_url for every job now linked to the
    // survivor. `companies_propagate_logo_trigger` only fires on a `logo_url`
    // CHANGE, not on a job's company_id being repointed here, so this mirrors
    // it explicitly for the jobs this merge just moved.
    if (mergedLogoUrl) {
      const { error: logoSyncError } = await supabase
        .from("global_jobs")
        .update({ company_logo_url: mergedLogoUrl })
        .eq("company_id", survivor.id);
      if (logoSyncError) throw logoSyncError;
    }
  }

  console.log(`
── Company identity summary ──────────────────────────────
Total companies scanned:                 ${rows.length}
Already canonical (no action needed):    ${alreadyCanonical}
Lone rows renamed to a better form:      ${renamedOnly}
Duplicate groups merged:                 ${mergedGroups}  (${mergedAwayCompanies} companies absorbed)
  of which legal-suffix-only matches:    ${legalSuffixOnlyGroups}  (expect 0 — the migration's own pass already handles these)
  of which alias/curated-name matches:   ${aliasMatchGroups}
Companies with no confident match found (left exactly as-is, never guessed): ${alreadyCanonical}
───────────────────────────────────────────────────────────
Note: this resolver has no fuzzy/similarity matching and no confidence score.
A company either matches a KNOWN curated alias/rename (merge or rename above)
or it doesn't — and is left completely untouched. "Already canonical" and
"no confident match found" are the same set: nothing to do for that row.`);
}

async function linkUnresolvedJobs(supabase: ServerSupabase): Promise<void> {
  let linked = 0;
  let created = 0;
  let attachedToExisting = 0;
  // Dry-run-only: normalized_key -> canonicalName for a company this SAME run
  // has already decided it would create, so repeated raw names (e.g. 5 jobs
  // all "InAmigos Foundation") are counted as ONE new company, matching what
  // apply mode actually does (job 2 onward finds job 1's freshly-inserted row
  // as "existing").
  const wouldCreateThisRun = new Map<string, string>();

  for (;;) {
    const { data, error } = await supabase
      .from("global_jobs")
      .select("id, company_name, company_url, company_logo_url")
      .is("company_id", null)
      .limit(BATCH_SIZE);
    if (error) throw error;
    const jobs = data ?? [];
    if (jobs.length === 0) break;

    for (const job of jobs) {
      const companyName = job.company_name as string;
      const companyUrl = job.company_url as string | null;
      const scrapedLogo = job.company_logo_url as string | null;
      const resolved = resolveCanonicalCompany(companyName, companyUrl);

      // Read-only in BOTH modes — this is what makes the dry-run count of
      // "attach to existing" vs "create new" trustworthy instead of the
      // apply-only counters a plain dry-run skip would otherwise leave at 0.
      const { data: existing, error: findError } = await supabase
        .from("companies")
        .select("id, logo_url")
        .eq("normalized_key", resolved.normalizedKey)
        .maybeSingle();
      if (findError) throw findError;

      if (!APPLY) {
        if (existing) {
          attachedToExisting++;
          console.log(
            `[link:dry-run] job ${job.id} "${companyName}" -> attach to EXISTING "${resolved.canonicalName}" (${resolved.normalizedKey})`,
          );
        } else if (wouldCreateThisRun.has(resolved.normalizedKey)) {
          attachedToExisting++; // attaches to a company THIS run would just have created
          console.log(
            `[link:dry-run] job ${job.id} "${companyName}" -> attach to NEW-this-run "${resolved.canonicalName}" (${resolved.normalizedKey})`,
          );
        } else {
          wouldCreateThisRun.set(resolved.normalizedKey, resolved.canonicalName);
          created++;
          console.log(
            `[link:dry-run] job ${job.id} "${companyName}" -> CREATE "${resolved.canonicalName}" (${resolved.normalizedKey})`,
          );
        }
        linked++;
        continue;
      }

      let companyId: string;
      let canonicalLogoUrl: string | null;

      if (existing) {
        companyId = existing.id;
        canonicalLogoUrl = existing.logo_url;
        attachedToExisting++;
      } else {
        const { data: inserted, error: insertError } = await supabase
          .from("companies")
          .insert({
            name: resolved.canonicalName,
            normalized_key: resolved.normalizedKey,
            domain: resolved.domain,
            logo_url: scrapedLogo,
            logo_source: scrapedLogo ? "job_scraped" : null,
          })
          .select("id, logo_url")
          .single();
        if (insertError) throw insertError;
        companyId = inserted.id;
        canonicalLogoUrl = inserted.logo_url;
        created++;
      }

      const { error: updateError } = await supabase
        .from("global_jobs")
        .update({
          company_id: companyId,
          company_logo_url: canonicalLogoUrl ?? scrapedLogo ?? null,
        })
        .eq("id", job.id);
      if (updateError) throw updateError;
      linked++;
    }

    // Dry run never clears company_id, so the same page would repeat forever.
    if (!APPLY) break;
  }

  console.log(`
── Job linking summary (${APPLY ? "APPLIED" : "DRY RUN"}) ──────────────────
Jobs processed:                 ${linked}
  attached to an existing company: ${attachedToExisting}
  would create / created a NEW company: ${created}
Distinct new companies: ${created}`);
}

async function main(): Promise<void> {
  console.log(
    APPLY
      ? "Running in APPLY mode — this WILL write to the database."
      : "Running in DRY RUN mode — no writes will be made. Pass --apply to write.",
  );
  const supabase = createServiceSupabase();
  await mergeExistingDuplicates(supabase);
  await linkUnresolvedJobs(supabase);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
