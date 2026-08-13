// ── Module 11C-1: company identity & logo cleanup ──
//
// Four data passes, in an order that is NOT interchangeable:
//
//   1. Remove fabricated seed postings (and any company row they orphan).
//   2. Correct proven identity errors — split the two homonyms, re-canonicalize
//      Razorpay's legal-entity row.
//   3. Promote stranded posting logos to their canonical company row.
//   4. Establish employer domains from trusted evidence.
//
// Step 2 must precede step 3 or a logo scraped for one employer is promoted
// onto the row it currently shares with an unrelated employer of the same name
// (the Slice case exactly). Step 2 must precede step 4 for the same reason, and
// step 3 precedes step 4 so a company that already has a real scraped logo is
// never given a domain-derived favicon it does not need. Step 5 — resolving
// favicons for the domains step 4 establishes — is the EXISTING, unmodified
// scripts/resolveCompanyLogos.ts, run afterwards.
//
// ── Why every pass runs against an in-memory model ──
//
// Each step's input is the PREVIOUS step's output, so a dry run that re-read
// the database between steps would report each pass against unmodified data and
// silently misdescribe the plan. It did, on the first run: step 3 announced it
// would put a LinkedIn-scraped logo on all 44 "Slice" postings, which is only
// true if step 2's split had not happened. So `World` below holds companies and
// postings in memory, every mutation is applied to it (and additionally written
// to the database only under --apply), and the AFTER snapshot is computed from
// it. Dry run and apply therefore execute the SAME decision sequence, and the
// printed plan is what --apply will do.
//
// The model mirrors one piece of database behaviour deliberately:
// `companies_propagate_logo_trigger` (Module 11A) fans a company's logo out to
// its postings on a logo CHANGE. `setCompanyLogo` reproduces that in memory so
// projected posting counts are honest. It does NOT fire on a posting being
// repointed, which is why `repointJobs` sets the logo explicitly — the same
// caveat scripts/backfillCompanyIdentity.ts documents.
//
// DRY RUN BY DEFAULT. Prints exactly what it would do and writes nothing. Pass
// --apply to write. Idempotent: a second run finds nothing left to do, in
// either mode. This talks to the REAL configured Supabase project via
// SUPABASE_SERVICE_ROLE_KEY — review the dry-run output before ever passing
// --apply against production.
//
// Run with:
//   npx vite-node scripts/module11c1Cleanup.ts [--apply] [--only=1,2,3,4]

import { createServiceSupabase, type ServerSupabase } from "../src/server/supabase";
import { resolveCanonicalCompany } from "../src/server/company/identity";
import { isFabricatedSeedJob } from "../src/server/company/fabricatedSeed";
import {
  isHomonymKey,
  resolveHomonym,
  validateHomonymTable,
  type HomonymEntity,
} from "../src/server/company/homonyms";
import { pickPromotableLogo } from "../src/server/company/logoPromotion";
import { sqlNormalizeCompanyName } from "../src/server/jobIntelligence/normalize/company";
import { decideEmployerDomain, type DomainCandidate } from "../src/server/company/domainEvidence";
import { COMPANY_CANDIDATES } from "./companyCandidates";

const APPLY = process.argv.includes("--apply");
const onlyArg = process.argv.find((a) => a.startsWith("--only="));
const STEPS = new Set(
  (onlyArg ? onlyArg.split("=")[1].split(",") : ["1", "2", "3", "4"]).map((s) => s.trim()),
);

type CompanyRow = {
  id: string;
  name: string;
  normalized_key: string | null;
  website: string | null;
  logo_url: string | null;
  logo_source: string | null;
  domain: string | null;
  industry: string | null;
  size: string | null;
  headquarters: string | null;
  aliases: string[] | null;
  created_at: string;
};

type JobRow = {
  id: string;
  company_id: string | null;
  company_name: string;
  role: string;
  location: string | null;
  url: string | null;
  source_url: string | null;
  company_url: string | null;
  company_career_url: string | null;
  company_logo_url: string | null;
  source: string;
  description: string | null;
  created_at: string;
};

const COMPANY_COLUMNS =
  "id, name, normalized_key, website, logo_url, logo_source, domain, industry, size, headquarters, aliases, created_at";
const JOB_COLUMNS =
  "id, company_id, company_name, role, location, url, source_url, company_url, company_career_url, company_logo_url, source, description, created_at";

async function pageAll<T>(supabase: ServerSupabase, table: string, columns: string): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .range(from, from + 999)
      .order("id", { ascending: true });
    if (error) throw error;
    const rows = (data ?? []) as unknown as T[];
    out.push(...rows);
    if (rows.length < 1000) break;
  }
  return out;
}

function heading(title: string): void {
  console.log(`\n${"─".repeat(74)}\n${title}\n${"─".repeat(74)}`);
}

/** Every URL a posting carries that could identify which employer it belongs to. */
function evidenceUrlsOf(job: JobRow): (string | null)[] {
  return [job.url, job.source_url, job.company_url, job.company_career_url];
}

// ── The in-memory world ───────────────────────────────────────────────────────

class World {
  readonly companies = new Map<string, CompanyRow>();
  readonly jobs = new Map<string, JobRow>();
  private syntheticIds = 0;

  constructor(
    private readonly supabase: ServerSupabase,
    private readonly apply: boolean,
  ) {}

  static async load(supabase: ServerSupabase, apply: boolean): Promise<World> {
    const world = new World(supabase, apply);
    for (const company of await pageAll<CompanyRow>(supabase, "companies", COMPANY_COLUMNS)) {
      world.companies.set(company.id, company);
    }
    for (const job of await pageAll<JobRow>(supabase, "global_jobs", JOB_COLUMNS)) {
      world.jobs.set(job.id, job);
    }
    return world;
  }

  jobsOf(companyId: string): JobRow[] {
    return [...this.jobs.values()].filter((job) => job.company_id === companyId);
  }

  companyByKey(normalizedKey: string): CompanyRow | undefined {
    return [...this.companies.values()].find((c) => (c.normalized_key ?? "") === normalizedKey);
  }

  async deleteJobs(ids: readonly string[]): Promise<void> {
    if (ids.length === 0) return;
    if (this.apply) {
      const { error } = await this.supabase
        .from("global_jobs")
        .delete()
        .in("id", [...ids]);
      if (error) throw error;
    }
    for (const id of ids) this.jobs.delete(id);
  }

  async deleteCompanies(ids: readonly string[]): Promise<void> {
    if (ids.length === 0) return;
    if (this.apply) {
      const { error } = await this.supabase
        .from("companies")
        .delete()
        .in("id", [...ids]);
      if (error) throw error;
    }
    for (const id of ids) {
      this.companies.delete(id);
      // Mirrors the schema's ON DELETE SET NULL on global_jobs.company_id.
      for (const job of this.jobs.values()) {
        if (job.company_id === id) job.company_id = null;
      }
    }
  }

  async createCompany(fields: {
    name: string;
    normalized_key: string;
    domain: string | null;
  }): Promise<CompanyRow> {
    const existing = this.companyByKey(fields.normalized_key);
    if (existing) return existing;

    let id = `dry-run-${(this.syntheticIds += 1)}`;
    if (this.apply) {
      const { data, error } = await this.supabase
        .from("companies")
        .insert(fields)
        .select("id")
        .single();
      if (error) throw error;
      id = data.id as string;
    }
    const row: CompanyRow = {
      id,
      name: fields.name,
      normalized_key: fields.normalized_key,
      website: null,
      logo_url: null,
      logo_source: null,
      domain: fields.domain,
      industry: null,
      size: null,
      headquarters: null,
      aliases: [],
      created_at: new Date().toISOString(),
    };
    this.companies.set(id, row);
    return row;
  }

  async updateCompany(id: string, patch: Partial<CompanyRow>): Promise<void> {
    if (this.apply) {
      const { error } = await this.supabase.from("companies").update(patch).eq("id", id);
      if (error) throw error;
    }
    Object.assign(this.companies.get(id) ?? {}, patch);
  }

  /** Writing a company's logo fires 11A's propagation trigger; mirrored here. */
  async setCompanyLogo(id: string, logoUrl: string, logoSource: string): Promise<void> {
    await this.updateCompany(id, { logo_url: logoUrl, logo_source: logoSource });
    for (const job of this.jobs.values()) {
      if (job.company_id === id) job.company_logo_url = logoUrl;
    }
  }

  async repointJobs(
    jobIds: readonly string[],
    targetCompanyId: string,
    targetLogoUrl: string | null,
  ): Promise<void> {
    if (jobIds.length === 0) return;
    if (this.apply) {
      const { error } = await this.supabase
        .from("global_jobs")
        .update({
          company_id: targetCompanyId,
          ...(targetLogoUrl ? { company_logo_url: targetLogoUrl } : {}),
        })
        .in("id", [...jobIds]);
      if (error) throw error;
    }
    for (const id of jobIds) {
      const job = this.jobs.get(id);
      if (!job) continue;
      job.company_id = targetCompanyId;
      if (targetLogoUrl) job.company_logo_url = targetLogoUrl;
    }
  }

  /**
   * Corrects the posting-level employer name after a split has established who
   * the postings actually belong to.
   *
   * `companies.name` is not what the product renders — every UI surface reads
   * `global_jobs.company_name` — so repointing `company_id` alone would leave
   * four postings still displaying "Zomato" for a US athletics company and
   * eleven still displaying "Fi Money" for Tetriz. `normalized_company` is
   * written alongside it, via the SQL-mirroring normalizer, because that column
   * is the cross-platform dedup grouping key: leaving it stale would keep these
   * postings grouped with the company they do not belong to. Correcting both is
   * what makes the dedup key agree with reality, not a change to any dedup
   * logic.
   */
  async retitleJobs(jobs: readonly JobRow[], canonicalName: string): Promise<number> {
    const stale = jobs.filter((job) => job.company_name !== canonicalName);
    if (stale.length === 0) return 0;
    if (this.apply) {
      const { error } = await this.supabase
        .from("global_jobs")
        .update({
          company_name: canonicalName,
          normalized_company: sqlNormalizeCompanyName(canonicalName),
        })
        .in(
          "id",
          stale.map((job) => job.id),
        );
      if (error) throw error;
    }
    for (const job of stale) job.company_name = canonicalName;
    return stale.length;
  }

  snapshot(): Snapshot {
    const companies = [...this.companies.values()];
    const jobs = [...this.jobs.values()];
    const logoById = new Map(companies.map((c) => [c.id, c.logo_url]));
    return {
      companies: companies.length,
      jobs: jobs.length,
      companiesWithLogo: companies.filter((c) => c.logo_url).length,
      companiesWithDomain: companies.filter((c) => c.domain).length,
      jobsWithLogo: jobs.filter((j) => j.company_logo_url).length,
      jobsAtLogoCompany: jobs.filter((j) => j.company_id && logoById.get(j.company_id)).length,
    };
  }
}

type Snapshot = {
  companies: number;
  jobs: number;
  companiesWithLogo: number;
  companiesWithDomain: number;
  jobsWithLogo: number;
  jobsAtLogoCompany: number;
};

function printSnapshot(snap: Snapshot): void {
  console.log(`  companies                         ${snap.companies}`);
  console.log(`  global_jobs                       ${snap.jobs}`);
  console.log(`  companies with a logo             ${snap.companiesWithLogo}`);
  console.log(`  companies with a domain           ${snap.companiesWithDomain}`);
  console.log(`  postings whose company has a logo ${snap.jobsAtLogoCompany}`);
  console.log(`  postings carrying a logo          ${snap.jobsWithLogo}`);
}

// ── Step 1 ────────────────────────────────────────────────────────────────────

type Step1Result = { jobsRemoved: number; companiesRemoved: number };

async function step1PruneFabricatedSeeds(world: World): Promise<Step1Result> {
  heading("STEP 1 — remove fabricated seed postings");

  const fabricated = [...world.jobs.values()].filter((job) =>
    isFabricatedSeedJob({ url: job.url, sourceUrl: job.source_url }),
  );
  console.log(`Postings whose URL is an RFC 2606 reserved host: ${fabricated.length}`);
  for (const job of fabricated) {
    console.log(`  [delete job] "${job.company_name}" / "${job.role}" — ${job.url}`);
  }
  if (fabricated.length === 0) {
    console.log("Nothing to do.");
    return { jobsRemoved: 0, companiesRemoved: 0 };
  }

  // A company is removed ONLY when this deletion empties it. Companies that
  // keep at least one genuine posting are untouched.
  const removedIds = new Set(fabricated.map((j) => j.id));
  const touched = new Set(
    fabricated.map((j) => j.company_id).filter((id): id is string => Boolean(id)),
  );
  const orphaned: CompanyRow[] = [];
  for (const companyId of touched) {
    const company = world.companies.get(companyId);
    if (!company) continue;
    const owned = world.jobsOf(companyId);
    if (owned.length > 0 && owned.every((job) => removedIds.has(job.id))) orphaned.push(company);
  }

  console.log(`\nCompany rows this empties (and would therefore remove): ${orphaned.length}`);
  for (const company of orphaned) {
    console.log(`  [delete company] "${company.name}" (${company.normalized_key})`);
  }
  for (const companyId of touched) {
    if (orphaned.some((c) => c.id === companyId)) continue;
    const company = world.companies.get(companyId);
    const remaining = world.jobsOf(companyId).filter((j) => !removedIds.has(j.id)).length;
    console.log(
      `  [keep company]   "${company?.name}" — still has ${remaining} genuine posting(s)`,
    );
  }

  await world.deleteJobs([...removedIds]);
  await world.deleteCompanies(orphaned.map((c) => c.id));
  return { jobsRemoved: fabricated.length, companiesRemoved: orphaned.length };
}

// ── Step 2 ────────────────────────────────────────────────────────────────────

type Step2Result = {
  splits: number;
  rowsCreated: number;
  renames: number;
  merges: number;
  postingsRetitled: number;
};

async function step2FixIdentityErrors(world: World): Promise<Step2Result> {
  heading("STEP 2 — correct proven company-identity errors");

  const tableProblems = validateHomonymTable();
  if (tableProblems.length > 0) {
    throw new Error(`Homonym table is inconsistent:\n  ${tableProblems.join("\n  ")}`);
  }

  const result: Step2Result = {
    splits: 0,
    rowsCreated: 0,
    renames: 0,
    merges: 0,
    postingsRetitled: 0,
  };

  // ── 2a. Split the declared homonyms ──
  console.log("2a. Homonym splits");
  for (const company of [...world.companies.values()]) {
    const key = (company.normalized_key ?? "").toLowerCase();
    if (!isHomonymKey(key)) continue;

    const owned = world.jobsOf(company.id);
    const buckets = new Map<string, { entity: HomonymEntity; jobs: JobRow[] }>();
    const unresolved: JobRow[] = [];
    for (const job of owned) {
      const entity = resolveHomonym(key, evidenceUrlsOf(job));
      if (!entity) {
        unresolved.push(job);
        continue;
      }
      const bucket = buckets.get(entity.normalizedKey) ?? { entity, jobs: [] };
      bucket.jobs.push(job);
      buckets.set(entity.normalizedKey, bucket);
    }

    console.log(
      `\n  "${company.name}" (${key}) — ${owned.length} posting(s) currently share this row`,
    );
    for (const bucket of buckets.values()) {
      console.log(
        `     -> ${bucket.jobs.length} posting(s) to "${bucket.entity.canonicalName}" (${bucket.entity.normalizedKey})`,
      );
      console.log(`        ${bucket.entity.note}`);
    }
    if (unresolved.length > 0) {
      console.log(
        `     -> ${unresolved.length} posting(s) UNATTRIBUTABLE — kept on the original plain-keyed row, never assigned to either employer:`,
      );
      for (const job of unresolved) {
        console.log(`           "${job.role}" (${job.source}) ${job.url}`);
      }
    }
    if (buckets.size === 0) {
      console.log("     -> no posting carries evidence for any declared entity; leaving as-is.");
      continue;
    }

    result.splits += 1;

    // The largest bucket takes over the EXISTING row when nothing is left
    // behind on it — that preserves the row's id, created_at and aliases for
    // the majority of postings instead of orphaning it.
    const ordered = [...buckets.values()].sort((a, b) => b.jobs.length - a.jobs.length);
    const inheritor = unresolved.length === 0 ? ordered[0] : null;

    for (const bucket of ordered) {
      if (bucket === inheritor) {
        console.log(
          `     [rekey]  existing row -> name="${bucket.entity.displayName}" key=${bucket.entity.normalizedKey}`,
        );
        // companies.name gets displayName (companies_name_unique target), NOT
        // canonicalName — see homonyms.ts's header for why the two differ.
        await world.updateCompany(company.id, {
          name: bucket.entity.displayName,
          normalized_key: bucket.entity.normalizedKey,
          domain: company.domain ?? bucket.entity.domain,
        });
      } else {
        console.log(
          `     [create] new row name="${bucket.entity.displayName}" key=${bucket.entity.normalizedKey} for ${bucket.jobs.length} posting(s)`,
        );
        result.rowsCreated += 1;
        const target = await world.createCompany({
          name: bucket.entity.displayName,
          normalized_key: bucket.entity.normalizedKey,
          domain: bucket.entity.domain,
        });
        await world.repointJobs(
          bucket.jobs.map((j) => j.id),
          target.id,
          target.logo_url,
        );
      }

      // The postings themselves still name whoever the row used to claim to
      // be. Nothing is deleted here — only the employer name and its dedup
      // key are corrected; source_job_id, url, source_url, last_seen_at and
      // every job_sources row are untouched.
      const previousName = bucket.jobs[0]?.company_name;
      const retitled = await world.retitleJobs(bucket.jobs, bucket.entity.canonicalName);
      if (retitled > 0) {
        result.postingsRetitled += retitled;
        console.log(
          `     [retitle] ${retitled} posting(s) company_name "${previousName}" -> "${bucket.entity.canonicalName}"`,
        );
      }
    }
  }
  if (result.splits === 0) console.log("  Nothing to split.");

  // ── 2b. Re-canonicalize rows whose stored key no longer matches resolution ──
  console.log("\n2b. Re-canonicalization against the curated alias table");
  let drift = 0;

  for (const company of [...world.companies.values()]) {
    if (!world.companies.has(company.id)) continue; // absorbed by an earlier merge
    const storedKey = company.normalized_key ?? "";
    // Disambiguated homonym rows are owned by 2a and must never be re-resolved
    // by name here — that would undo the split.
    if (storedKey.includes("#") || isHomonymKey(storedKey)) continue;

    // resolveCanonicalCompany is called with NO evidence here, so it can never
    // resolve to a homonym entity (resolveHomonym requires evidence — see
    // identity.ts) — every row reaching this branch is a plain company, for
    // which displayName === canonicalName always. Using displayName for the
    // companies.name writes below is simply consistent with that invariant.
    const resolved = resolveCanonicalCompany(company.name);
    if (resolved.normalizedKey === storedKey && resolved.displayName === company.name) continue;

    drift += 1;
    const target = world.companyByKey(resolved.normalizedKey);

    if (!target || target.id === company.id) {
      console.log(
        `  [rename] "${company.name}" (${storedKey}, ${world.jobsOf(company.id).length} posting(s)) -> "${resolved.displayName}" (${resolved.normalizedKey})`,
      );
      result.renames += 1;
      await world.updateCompany(company.id, {
        name: resolved.displayName,
        normalized_key: resolved.normalizedKey,
      });
      continue;
    }

    // Survivor = earliest-created, matching Module 11A's own merge rule.
    const [survivor, absorbed] =
      target.created_at <= company.created_at ? [target, company] : [company, target];
    console.log(
      `  [merge]  "${absorbed.name}" (${absorbed.normalized_key}, ${world.jobsOf(absorbed.id).length} posting(s))` +
        ` into "${survivor.name}" (${survivor.normalized_key}, ${world.jobsOf(survivor.id).length} posting(s))` +
        ` -> "${resolved.displayName}" (${resolved.normalizedKey})`,
    );
    result.merges += 1;

    const mergedLogo = survivor.logo_url ?? absorbed.logo_url ?? null;
    await world.updateCompany(survivor.id, {
      name: resolved.displayName,
      normalized_key: resolved.normalizedKey,
      website: survivor.website ?? absorbed.website,
      logo_url: mergedLogo,
      logo_source: survivor.logo_url
        ? survivor.logo_source
        : (absorbed.logo_source ?? survivor.logo_source),
      domain: survivor.domain ?? absorbed.domain,
      industry: survivor.industry ?? absorbed.industry,
      size: survivor.size ?? absorbed.size,
      headquarters: survivor.headquarters ?? absorbed.headquarters,
      aliases: [
        ...new Set([...(survivor.aliases ?? []), ...(absorbed.aliases ?? []), absorbed.name]),
      ],
    });
    await world.repointJobs(
      world.jobsOf(absorbed.id).map((j) => j.id),
      survivor.id,
      mergedLogo,
    );
    await world.deleteCompanies([absorbed.id]);
  }

  if (drift === 0) console.log("  Every company row already matches its canonical resolution.");
  return result;
}

// ── Step 3 ────────────────────────────────────────────────────────────────────

type Step3Result = { companiesGivenLogo: number; postingsAffected: number; contested: number };

async function step3PromoteLogos(world: World): Promise<Step3Result> {
  heading("STEP 3 — promote stranded posting logos to their company row");

  const result: Step3Result = { companiesGivenLogo: 0, postingsAffected: 0, contested: 0 };
  for (const company of [...world.companies.values()]) {
    // An established logo is never touched, by the picker and again here.
    if (company.logo_url) continue;
    const owned = world.jobsOf(company.id);
    const promotion = pickPromotableLogo(
      owned.map((job) => ({
        companyLogoUrl: job.company_logo_url,
        source: job.source,
        createdAt: job.created_at,
      })),
      company.logo_url,
    );
    if (!promotion) continue;

    result.companiesGivenLogo += 1;
    result.postingsAffected += owned.length;
    if (promotion.contested) result.contested += 1;
    console.log(
      `  [promote] "${company.name}" <- ${promotion.logoUrl}` +
        `\n            ${promotion.votes}/${promotion.candidates} posting(s) carry it` +
        `${promotion.contested ? " (CONTESTED — majority wins)" : ""}` +
        `, via ${promotion.sources.join("/")}; ${owned.length} posting(s) will show it`,
    );
    await world.setCompanyLogo(company.id, promotion.logoUrl, "job_scraped");
  }

  if (result.companiesGivenLogo === 0) console.log("  No stranded logos left to promote.");
  return result;
}

// ── Step 4 ────────────────────────────────────────────────────────────────────

type Step4Result = { assigned: number; byTier: Map<string, number>; refused: number };

/** identity key -> the domain `companyCandidates.ts` asserts for it. */
function buildCuratedDomains(): Map<string, string> {
  const curated = new Map<string, string>();
  for (const candidate of COMPANY_CANDIDATES) {
    let domain = candidate.domain ?? null;
    if (!domain) {
      for (const url of candidate.careerUrls ?? []) {
        try {
          domain = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
          break;
        } catch {
          /* ignore an unparseable curated URL */
        }
      }
    }
    if (!domain) continue;
    // A curated "A / B" entry names one company two ways; index both halves.
    for (const part of candidate.name
      .split("/")
      .map((p) => p.trim())
      .filter(Boolean)) {
      const key = resolveCanonicalCompany(part).normalizedKey;
      if (!curated.has(key)) curated.set(key, domain);
    }
  }
  return curated;
}

/** Posting text the Module 11B guard reads, capped so one huge company cannot dominate memory. */
const MAX_POSTING_TEXT = 200_000;

async function step4BackfillDomains(world: World): Promise<Step4Result> {
  heading("STEP 4 — establish employer domains from trusted evidence");

  const curated = buildCuratedDomains();
  console.log(`Curated identity keys carrying an asserted domain: ${curated.size}`);

  const result: Step4Result = { assigned: 0, byTier: new Map(), refused: 0 };
  const refusals: string[] = [];

  for (const company of [...world.companies.values()]) {
    if (company.domain) continue; // never overwrite an established domain

    const owned = world.jobsOf(company.id);
    const candidates: DomainCandidate[] = [];
    for (const job of owned) candidates.push({ url: job.company_url, field: "company_url" });
    for (const job of owned) candidates.push({ url: job.url, field: "url" });
    for (const job of owned) {
      candidates.push({ url: job.company_career_url, field: "company_career_url" });
    }
    for (const job of owned) candidates.push({ url: job.source_url, field: "source_url" });

    let postingText = "";
    for (const job of owned) {
      if (!job.description) continue;
      postingText += `${job.description}\n`;
      if (postingText.length >= MAX_POSTING_TEXT) break;
    }

    const decision = decideEmployerDomain({
      companyName: company.name,
      normalizedKey: company.normalized_key ?? "",
      curatedDomain: curated.get(company.normalized_key ?? "") ?? null,
      candidates,
      postingText,
    });

    if (!decision.ok) {
      result.refused += 1;
      if (refusals.length < 30) refusals.push(`  [refuse] ${decision.reason}`);
      continue;
    }

    result.assigned += 1;
    result.byTier.set(decision.tier, (result.byTier.get(decision.tier) ?? 0) + 1);
    console.log(
      `  [domain] "${company.name}" <- ${decision.domain}  (${decision.tier}, ${owned.length} posting(s), logo=${company.logo_url ? "already set" : "none yet"})`,
    );
    await world.updateCompany(company.id, { domain: decision.domain });
  }

  console.log(`\nRefused (left with no domain, which is always safe): ${result.refused}`);
  console.log("Sample of refusals and why:");
  refusals.forEach((line) => console.log(line));
  if (result.refused > refusals.length) {
    console.log(`  ... and ${result.refused - refusals.length} more`);
  }
  return result;
}

// ── Entry point ───────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log(
    APPLY
      ? "Running in APPLY mode — this WILL write to the database."
      : "Running in DRY RUN mode — no writes will be made. Pass --apply to write.",
  );
  console.log(`Steps selected: ${[...STEPS].sort().join(", ")}`);

  const supabase = createServiceSupabase();
  const world = await World.load(supabase, APPLY);

  const before = world.snapshot();
  heading("BEFORE");
  printSnapshot(before);

  const step1 = STEPS.has("1")
    ? await step1PruneFabricatedSeeds(world)
    : { jobsRemoved: 0, companiesRemoved: 0 };
  const step2 = STEPS.has("2")
    ? await step2FixIdentityErrors(world)
    : { splits: 0, rowsCreated: 0, renames: 0, merges: 0, postingsRetitled: 0 };
  const step3 = STEPS.has("3")
    ? await step3PromoteLogos(world)
    : { companiesGivenLogo: 0, postingsAffected: 0, contested: 0 };
  const step4 = STEPS.has("4")
    ? await step4BackfillDomains(world)
    : { assigned: 0, byTier: new Map<string, number>(), refused: 0 };

  const after = world.snapshot();
  heading(APPLY ? "AFTER (applied)" : "AFTER (projected — nothing was written)");
  printSnapshot(after);

  heading("SUMMARY");
  console.log(`fabricated postings removed          ${step1.jobsRemoved}`);
  console.log(`company rows removed as orphaned     ${step1.companiesRemoved}`);
  console.log(`homonym rows split                   ${step2.splits}`);
  console.log(`  new company rows created           ${step2.rowsCreated}`);
  console.log(`  postings retitled to the right employer ${step2.postingsRetitled}`);
  console.log(`company rows renamed                 ${step2.renames}`);
  console.log(`company rows merged                  ${step2.merges}`);
  console.log(`logos promoted to a company row      ${step3.companiesGivenLogo}`);
  console.log(`  of which contested (majority won)  ${step3.contested}`);
  console.log(`  postings that would then show one  ${step3.postingsAffected}`);
  console.log(`employer domains established         ${step4.assigned}`);
  for (const [tier, count] of [...step4.byTier].sort()) {
    console.log(`    ${tier.padEnd(26)} ${count}`);
  }
  console.log(`domains refused for lack of evidence ${step4.refused}`);
  console.log(
    `\ncompanies still without a logo       ${after.companies - after.companiesWithLogo}` +
      ` (of ${after.companies}); step 5 can reach the ${step4.assigned} with a domain`,
  );

  if (!APPLY) {
    console.log(
      "\nDRY RUN — nothing was written. The AFTER block is the projected result of --apply.\n" +
        "Step 5 (favicon resolution for the domains above) is the existing, unmodified\n" +
        "scripts/resolveCompanyLogos.ts and must be run AFTER this script is applied.",
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
