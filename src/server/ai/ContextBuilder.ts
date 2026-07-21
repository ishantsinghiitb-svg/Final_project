import type { ServerSupabase } from "@/server/supabase";
import { StructuredResumeSchema } from "@/features/ai/schemas";
import type { JobContext, JobSnapshot, ResumeContext, UserContext } from "@/features/ai/types";
import { hashObject } from "./hash";

// ── ContextBuilder (Module 6A) ──
//
// Assembles the reusable AIContext primitives from existing tables + the
// deterministic resume_parsed output. Every AI capability (Match / ATS /
// Cover Letter / Interview Prep) composes the SAME primitives — this is what
// makes context reuse + caching cheap. All reads go through the caller's authed
// Supabase client, so RLS applies.

export class ContextBuilder {
  constructor(private readonly sb: ServerSupabase) {}

  async buildResumeContext(resumeId: string): Promise<ResumeContext | undefined> {
    const { data, error } = await this.sb
      .from("resume_parsed")
      .select("resume_id, resume_file_hash, parser_version, raw_text, structured")
      .eq("resume_id", resumeId)
      .maybeSingle();
    if (error) throw error;
    if (!data || !data.structured) return undefined;

    const structured = StructuredResumeSchema.parse(data.structured);
    return {
      resumeId,
      fileHash: data.resume_file_hash,
      parserVersion: data.parser_version,
      structured,
      rawText: data.raw_text ?? "",
    };
  }

  async buildJobContext(jobId: string): Promise<JobContext | undefined> {
    const { data, error } = await this.sb
      .from("global_jobs")
      .select(
        "id, role, company_name, location, employment_type, work_mode, experience_level, description, requirements, responsibilities, technologies",
      )
      .eq("id", jobId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return undefined;

    const snapshot: JobSnapshot = {
      role: data.role ?? null,
      companyName: data.company_name ?? null,
      location: data.location ?? null,
      employmentType: data.employment_type ?? null,
      workMode: data.work_mode ?? null,
      experienceLevel: data.experience_level ?? null,
      description: data.description ?? null,
      requirements: data.requirements ?? [],
      responsibilities: data.responsibilities ?? [],
      skills: data.technologies ?? [],
    };

    // Job hash is derived from the SNAPSHOT captured now — later edits to the
    // global_jobs row do not invalidate or mutate historical analyses.
    const jobHash = await hashObject(snapshot);
    return { jobId, jobHash, snapshot };
  }

  async buildUserContext(userId: string): Promise<UserContext> {
    const { data } = await this.sb
      .from("profiles")
      .select("target_role, location")
      .eq("id", userId)
      .maybeSingle();
    return {
      userId,
      targetRole: data?.target_role ?? null,
      location: data?.location ?? null,
    };
  }
}
