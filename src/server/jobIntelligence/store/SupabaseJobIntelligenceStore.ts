import { createServiceSupabase, type ServerSupabase } from "@/server/supabase";
import { resolveCanonicalCompany } from "@/server/company/identity";
import type { Json } from "@/types/database";
import type { DedupCandidate } from "../dedup/DeduplicationEngine";
import type { NormalizedJobPosting } from "../types";
import type {
  DedupCandidateQuery,
  JobIntelligenceStore,
  UpsertOutcome,
} from "./JobIntelligenceStore";

// ── Module 10A: Supabase-backed store (admin/service-role path) ──
//
// Writes go through `admin_upsert_global_job` — a SECURITY DEFINER function
// granted ONLY to `service_role` (see the Module 10A migration). It is a
// deliberate near-duplicate of the existing `upsert_global_job` RPC (the
// user/extension write path, gated on `auth.uid()`) rather than a shared
// code path: admin crawling has no authenticated end-user request to attach
// to, and the codebase's own invariant is that `upsert_global_job` is "the
// single write path" for the user-facing surfaces — this module intentionally
// does not touch or reuse that function's auth-gated body, it calls the
// sibling. Both share the same underlying dedup helpers
// (`normalize_company_name`, `normalize_role_text`, `find_cross_platform_match`),
// so the two paths make identical merge decisions.
//
// Reads (`findDedupCandidates`) use the SAME service-role client — this
// entire store is only ever constructed for the admin manual-crawl flow
// (see ../CrawlRunner.ts + ../adminAuth.ts), never on a request driven by an
// ordinary authenticated user.

type CandidateRow = {
  id: string;
  source: string;
  source_job_id: string | null;
  fingerprint: string | null;
  normalized_company: string | null;
  normalized_role: string | null;
  work_mode: string | null;
  employment_type: string | null;
  posted_at: string | null;
  salary_min: number | null;
  salary_max: number | null;
  city: string | null;
  location: string | null;
};

function toCandidate(
  row: CandidateRow,
  normalizedLocationOf: (row: CandidateRow) => string | null,
): DedupCandidate {
  return {
    id: row.id,
    source: row.source,
    sourceJobId: row.source_job_id,
    fingerprint: row.fingerprint,
    normalizedCompany: row.normalized_company ?? "",
    normalizedRole: row.normalized_role ?? "",
    normalizedLocation: normalizedLocationOf(row),
    workMode: row.work_mode,
    employmentType: row.employment_type,
    postedAt: row.posted_at,
    salaryMin: row.salary_min,
    salaryMax: row.salary_max,
  };
}

const CANDIDATE_COLUMNS =
  "id, source, source_job_id, fingerprint, normalized_company, normalized_role, work_mode, employment_type, posted_at, salary_min, salary_max, city, location";

export class SupabaseJobIntelligenceStore implements JobIntelligenceStore {
  constructor(private readonly supabase: ServerSupabase = createServiceSupabase()) {}

  async findDedupCandidates(query: DedupCandidateQuery): Promise<DedupCandidate[]> {
    // normalize_location_text() semantics: lowercase + whitespace-collapsed
    // city (falling back to location), or null — mirrored here so a stored
    // row's derived location matches ../normalize/location.ts's output.
    const normalizedLocationOf = (row: CandidateRow): string | null => {
      const raw = (row.city ?? row.location ?? "").trim().toLowerCase().replace(/\s+/g, " ");
      return raw || null;
    };

    const byId = new Map<string, DedupCandidate>();

    if (query.sourceJobId) {
      const { data, error } = await this.supabase
        .from("global_jobs")
        .select(CANDIDATE_COLUMNS)
        .eq("source", query.source)
        .eq("source_job_id", query.sourceJobId)
        .limit(5);
      if (error) throw error;
      for (const row of (data ?? []) as unknown as CandidateRow[]) {
        byId.set(row.id, toCandidate(row, normalizedLocationOf));
      }
    }

    {
      const { data, error } = await this.supabase
        .from("global_jobs")
        .select(CANDIDATE_COLUMNS)
        .eq("fingerprint", query.fingerprint)
        .limit(5);
      if (error) throw error;
      for (const row of (data ?? []) as unknown as CandidateRow[]) {
        byId.set(row.id, toCandidate(row, normalizedLocationOf));
      }
    }

    if (query.normalizedCompany && query.normalizedRole) {
      const { data, error } = await this.supabase
        .from("global_jobs")
        .select(CANDIDATE_COLUMNS)
        .eq("normalized_company", query.normalizedCompany)
        .eq("normalized_role", query.normalizedRole)
        .limit(20);
      if (error) throw error;
      for (const row of (data ?? []) as unknown as CandidateRow[]) {
        byId.set(row.id, toCandidate(row, normalizedLocationOf));
      }
    }

    return [...byId.values()];
  }

  async upsertCanonicalJob(
    job: NormalizedJobPosting,
    _matchId: string | null,
  ): Promise<UpsertOutcome> {
    const payload = toAdminUpsertPayload(job);
    const { data, error } = await this.supabase.rpc("admin_upsert_global_job", {
      payload: payload as unknown as Json,
    });
    if (error) throw error;
    const row = data as unknown as { id: string; created: boolean };
    return { jobId: row.id, created: row.created };
  }
}

/** Exported for testing (see SupabaseJobIntelligenceStore.test.ts) — pure, no I/O. */
export function toAdminUpsertPayload(job: NormalizedJobPosting): Record<string, unknown> {
  // ── Module 11A: canonical company identity ──
  // Resolved here (once, at the ingestion boundary) rather than in SQL, so
  // the curated alias tables (normalize/company.ts + registry/companyIdentity.ts)
  // stay the single, testable source of truth. Purely additive on the RPC
  // side (see 20260821000001) — omitting these fields reproduces the RPC's
  // pre-Module-11A behavior exactly, so this can never regress a crawl.
  //
  // ── Module 11C-1: homonym evidence ──
  // The posting's own board/apply URLs are passed as evidence so that the two
  // proven name collisions (Slice, Porter — see server/company/homonyms.ts)
  // keep resolving to the right employer on every future crawl, instead of
  // re-merging into the single shared row the 11C audit found. For every other
  // company these arguments are inert: the homonym table is consulted only for
  // names already on it, and it can only ever select between entities it
  // already declares.
  const canonicalCompany = resolveCanonicalCompany(job.companyName, job.companyUrl, [
    job.sourceUrl,
    job.url,
    job.companyCareerUrl,
  ]);
  // Module 11C-1: `company_canonical_name` is what `admin_upsert_global_job`
  // writes into `companies.name` (see 20260821000001's `v_company_display_name`)
  // — a column `companies_name_unique` constrains globally. `displayName`, not
  // `canonicalName`, is the value that respects that constraint for a homonym
  // entity (Slice's two entities are both plainly "Slice"/"slice" as
  // `canonicalName`; only `displayName` disambiguates). Using `canonicalName`
  // here is exactly what raised the 23505 during the first cleanup apply.
  // Inert for every non-homonym company: `displayName === canonicalName` there.

  return {
    source: job.source,
    source_job_id: job.sourceJobId ?? null,
    fingerprint: job.fingerprint,
    company_name: job.companyName,
    role: job.role,
    normalized_company: job.normalizedCompany,
    normalized_role: job.normalizedRole,
    company_canonical_name: canonicalCompany.displayName,
    company_normalized_key: canonicalCompany.normalizedKey,
    company_domain: canonicalCompany.domain,
    location: job.location ?? null,
    city: job.city ?? null,
    state: job.state ?? null,
    country: job.country ?? null,
    remote: job.remote ?? null,
    work_mode: job.workMode ?? null,
    employment_type: job.employmentType ?? null,
    experience_level: job.experienceLevel ?? null,
    department: job.department ?? null,
    job_function: job.jobFunction ?? null,
    industry: job.industry ?? null,
    salary_min: job.salaryMin ?? null,
    salary_max: job.salaryMax ?? null,
    salary_currency: job.salaryCurrency ?? null,
    salary_period: job.salaryPeriod ?? null,
    salary_text: job.salaryText ?? null,
    description: job.description ?? null,
    description_html: job.descriptionHtml ?? null,
    responsibilities: job.responsibilities ?? null,
    requirements: job.requirements ?? null,
    preferred_qualifications: job.preferredQualifications ?? null,
    benefits: job.benefits ?? null,
    skills: job.skills ?? null,
    technologies: job.technologies ?? null,
    languages: job.languages ?? null,
    tags: job.tags ?? null,
    url: job.url ?? null,
    source_url: job.sourceUrl ?? null,
    company_url: job.companyUrl ?? null,
    company_career_url: job.companyCareerUrl ?? null,
    company_logo_url: job.companyLogoUrl ?? null,
    company_size: job.companySize ?? null,
    posted_at: job.postedAt ?? null,
    posted_ago: job.postedAgo ?? null,
    expiry_date: job.expiryDate ?? null,
    is_closed: job.isClosed ?? null,
    applicant_count: job.applicantCount ?? null,
    hiring_insights: job.hiringInsights ?? null,
    hiring_team: job.hiringTeam ?? null,
    recruiter_name: job.recruiterName ?? null,
    recruiter_profile: job.recruiterProfile ?? null,
    easy_apply: job.easyApply ?? null,
    promoted: job.promoted ?? null,
    reposted: job.reposted ?? null,
    responses_managed: job.responsesManaged ?? null,
    parser_version: job.parserVersion,
    parser_confidence: job.parserConfidence ?? null,
    extraction_warnings: job.extractionWarnings ?? null,
  };
}
