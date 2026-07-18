import type { UniversalJob } from "../../core/parsers/types";
import type { ApplicationSummary } from "../messaging/types";
import { getSupabaseClient } from "./client";

/**
 * Extension-local mirror of the main app's `JobRepository` /
 * `ApplicationRepository` (see `src/repositories/*.ts`). Kept as a small,
 * separate implementation rather than importing those files directly —
 * the extension is its own Vite bundle, and pulling in the web app's module
 * graph would drag in unrelated app-only dependencies for a handful of
 * simple table calls.
 */

export type GlobalJobRecord = {
  id: string;
  company_name: string;
  role: string;
  location: string | null;
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string | null;
  source: string;
  url: string | null;
  is_closed: boolean;
};

/**
 * The only write path for global_jobs — resolves by (source, source_job_id)
 * then by fingerprint and creates or updates in place. Never inserts a
 * duplicate for a job identity that already exists (see
 * supabase/migrations/20260716150000_expand_global_job_metadata.sql).
 */
export async function upsertGlobalJob(job: UniversalJob): Promise<GlobalJobRecord> {
  const { data, error } = await getSupabaseClient().rpc("upsert_global_job", {
    payload: {
      source: job.source,
      source_job_id: job.sourceJobId,
      fingerprint: job.fingerprint,
      company_name: job.companyName,
      role: job.title,
      location: job.location,
      city: job.city,
      state: job.state,
      country: job.country,
      remote: job.remote,
      work_mode: job.workMode,
      employment_type: job.employmentType,
      experience_level: job.experienceLevel,
      department: job.department,
      salary_min: job.salaryMin,
      salary_max: job.salaryMax,
      salary_currency: job.salaryCurrency,
      salary_period: job.salaryPeriod,
      salary_text: job.salaryText,
      description: job.description,
      description_html: job.descriptionHtml,
      responsibilities: job.responsibilities,
      requirements: job.requirements,
      preferred_qualifications: job.preferredQualifications,
      url: job.applyUrl ?? job.sourceUrl,
      source_url: job.sourceUrl,
      company_url: job.companyUrl,
      company_career_url: job.companyCareerUrl,
      posted_at: job.postedAt,
      posted_ago: job.postedAgo,
      expiry_date: job.expiryDate,
      applicant_count: job.applicantCount,
      hiring_insights: job.hiringInsights,
      hiring_team: job.hiringTeam,
      recruiter_name: job.recruiterName,
      recruiter_profile: job.recruiterProfile,
      company_size: job.companySize,
      easy_apply: job.easyApply,
      promoted: job.promoted,
      reposted: job.reposted,
      responses_managed: job.responsesManaged,
      industry: job.industry,
      job_function: job.jobFunction,
      benefits: job.benefits,
      company_logo_url: job.companyLogoUrl,
      is_closed: job.isClosed,
      // Always sent explicitly (never omitted) — a real capture must always
      // assert `false` here so a previously manual-only row gets promoted
      // back to visible. See upsert_global_job's promotion semantics.
      is_manual_import: job.isManualImport,
      skills: job.skills,
      technologies: job.technologies,
      languages: job.languages,
      parser_version: job.parserVersion,
      parser_confidence: job.parserConfidence,
      extraction_warnings: job.extractionWarnings,
    },
  });

  if (error) throw error;
  return data as unknown as GlobalJobRecord;
}

export async function isJobSaved(userId: string, jobId: string): Promise<boolean> {
  const { data, error } = await getSupabaseClient()
    .from("saved_jobs")
    .select("id")
    .eq("user_id", userId)
    .eq("job_id", jobId)
    .maybeSingle();
  if (error) throw error;
  return data !== null;
}

/** Idempotent — reuses the `saved_jobs.unique(user_id, job_id)` constraint, never duplicates a save. */
export async function saveJob(userId: string, jobId: string): Promise<void> {
  const { error } = await getSupabaseClient()
    .from("saved_jobs")
    .upsert(
      { user_id: userId, job_id: jobId },
      { onConflict: "user_id,job_id", ignoreDuplicates: true },
    );
  if (error) throw error;
}

export async function findApplicationByJob(
  userId: string,
  jobId: string,
): Promise<ApplicationSummary | null> {
  const { data, error } = await getSupabaseClient()
    .from("applications")
    .select("id, status")
    .eq("user_id", userId)
    .eq("job_id", jobId)
    .maybeSingle();
  if (error) throw error;
  return data ? { id: data.id as string, status: data.status as string } : null;
}

/** Mirrors `ApplicationService.createFromJob` — inherits fields from the resolved Global Job, never from user input. */
export async function createApplicationFromJob(
  userId: string,
  job: GlobalJobRecord,
): Promise<ApplicationSummary> {
  const { data, error } = await getSupabaseClient()
    .from("applications")
    .insert({
      user_id: userId,
      job_id: job.id,
      company_name: job.company_name,
      role: job.role,
      status: "applied",
      applied_at: new Date().toISOString(),
      location: job.location,
      salary_min: job.salary_min,
      salary_max: job.salary_max,
      salary_currency: job.salary_currency,
      source: job.source,
      url: job.url,
    })
    .select("id, status")
    .single();

  if (error) throw error;
  return { id: data.id as string, status: data.status as string };
}
