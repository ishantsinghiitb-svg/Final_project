import { supabase } from "@/lib/supabase";
import type { GlobalJob, SavedJob, Skill, PaginationParams, PaginatedResult } from "@/types";
import type { JobFilters, JobSort } from "@/features/jobs/types";

// Select all columns that map to the GlobalJob domain type.
// `role_id` and `location_id` are DB-only FK references and are excluded
// intentionally — they are not part of the GlobalJob domain model.
const JOB_COLUMNS =
  "id, company_id, company_name, role, location, remote, work_mode, employment_type, experience_level, salary_min, salary_max, salary_currency, description, url, source, posted_at, created_at, updated_at";

const SAVED_JOB_COLUMNS = "id, user_id, job_id, notes, created_at";

export class JobRepository {
  // ── Read ──────────────────────────────────────────────────────────────────

  async findById(id: string): Promise<GlobalJob | null> {
    const { data, error } = await supabase
      .from("global_jobs")
      .select(JOB_COLUMNS)
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return data as GlobalJob | null;
  }

  /**
   * Returns a paginated, filtered, sorted list of global jobs.
   * The repository applies all filters received from the service layer;
   * it does NOT apply business rules (those live in JobService).
   */
  async findAll(
    filters: JobFilters,
    sort: JobSort,
    pagination: PaginationParams,
  ): Promise<PaginatedResult<GlobalJob>> {
    const { page, pageSize } = pagination;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    // Build the query with dynamic filters applied
    // Each Supabase filter method returns `this`, so reassignment is type-safe
    let q = supabase
      .from("global_jobs")
      .select(JOB_COLUMNS, { count: "exact" });

    // ── Keyword search ──
    // Uses OR across three text fields — extend here if more fields are needed
    if (filters.q) {
      const escaped = filters.q.replace(/[%_]/g, "\\$&");
      q = q.or(
        `role.ilike.%${escaped}%,company_name.ilike.%${escaped}%,description.ilike.%${escaped}%`,
      );
    }

    // ── Company name ──
    if (filters.company) {
      q = q.ilike("company_name", `%${filters.company}%`);
    }

    // ── Role ──
    if (filters.role) {
      q = q.ilike("role", `%${filters.role}%`);
    }

    // ── Location ──
    if (filters.location) {
      q = q.ilike("location", `%${filters.location}%`);
    }

    // ── Remote toggle ──
    if (filters.remote !== undefined) {
      q = q.eq("remote", filters.remote);
    }

    // ── Work mode (single or array) ──
    if (filters.workMode !== undefined) {
      const modes = Array.isArray(filters.workMode)
        ? filters.workMode
        : [filters.workMode];
      q = q.in("work_mode", modes);
    }

    // ── Employment type (single or array) ──
    if (filters.employmentType !== undefined) {
      const types = Array.isArray(filters.employmentType)
        ? filters.employmentType
        : [filters.employmentType];
      q = q.in("employment_type", types);
    }

    // ── Experience level (single or array) ──
    if (filters.experienceLevel !== undefined) {
      const levels = Array.isArray(filters.experienceLevel)
        ? filters.experienceLevel
        : [filters.experienceLevel];
      q = q.in("experience_level", levels);
    }

    // ── Source (single or array) ──
    if (filters.source !== undefined) {
      const sources = Array.isArray(filters.source)
        ? filters.source
        : [filters.source];
      q = q.in("source", sources);
    }

    // ── Salary range ──
    if (filters.salaryMin !== undefined) {
      q = q.gte("salary_min", filters.salaryMin);
    }
    if (filters.salaryMax !== undefined) {
      q = q.lte("salary_max", filters.salaryMax);
    }

    // ── Posted after ──
    if (filters.postedAfter) {
      q = q.gte("posted_at", filters.postedAfter);
    }

    // ── Sort and paginate ──
    q = q
      .order(sort.field, { ascending: sort.direction === "asc" })
      .range(from, to);

    const { data, error, count } = await q;
    if (error) throw error;

    const total = count ?? 0;
    return {
      data: (data ?? []) as unknown as GlobalJob[],
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  /**
   * Returns similar jobs based on role and/or location similarity.
   * Excludes the reference job itself.
   * Uses two OR conditions: same role (ilike) OR same location (ilike).
   */
  async findSimilarJobs(
    jobId: string,
    role: string,
    location: string | undefined,
    limit: number = 6,
  ): Promise<GlobalJob[]> {
    const escapedRole = role.replace(/[%_]/g, "\\$&");

    let orClause = `role.ilike.%${escapedRole}%`;
    if (location) {
      const escapedLocation = location.replace(/[%_]/g, "\\$&");
      orClause += `,location.ilike.%${escapedLocation}%`;
    }

    const { data, error } = await supabase
      .from("global_jobs")
      .select(JOB_COLUMNS)
      .neq("id", jobId)
      .or(orClause)
      .order("posted_at", { ascending: false })
      .limit(limit);

    if (error) throw error;
    return (data ?? []) as unknown as GlobalJob[];
  }

  /**
   * Returns all skills associated with a job via the job_skills junction table.
   * Returns an empty array gracefully if the table has no rows for this job.
   */
  async findSkillsForJob(jobId: string): Promise<Skill[]> {
    // Use a raw select with explicit typing — Supabase's cross-table join
    // inference can resolve to `never` without full generated types.
    const { data, error } = await supabase
      .from("job_skills")
      .select("skill_id, skills:skills(id, name, category)")
      .eq("job_id", jobId);

    if (error) throw error;

    type SkillJoinRow = {
      skill_id: string;
      skills: { id: string; name: string; category: string | null } | null;
    };

    const rows = (data ?? []) as unknown as SkillJoinRow[];

    return rows
      .map((row): Skill | null => {
        const s = row.skills;
        if (!s) return null;
        return { id: s.id, name: s.name, category: s.category ?? undefined };
      })
      .filter((s): s is Skill => s !== null);
  }

  // ── Save / Unsave ─────────────────────────────────────────────────────────

  async saveJob(
    userId: string,
    jobId: string,
    notes?: string,
  ): Promise<SavedJob> {
    const { data, error } = await supabase
      .from("saved_jobs")
      .insert({ user_id: userId, job_id: jobId, notes: notes ?? null })
      .select(SAVED_JOB_COLUMNS)
      .single();
    if (error) throw error;
    return data as unknown as SavedJob;
  }

  async unsaveJob(userId: string, jobId: string): Promise<void> {
    const { error } = await supabase
      .from("saved_jobs")
      .delete()
      .eq("user_id", userId)
      .eq("job_id", jobId);
    if (error) throw error;
  }

  // ── Saved job queries ─────────────────────────────────────────────────────

  /**
   * Returns the user's saved jobs as GlobalJob records (paginated).
   * Uses two queries to keep the implementation simple and avoid
   * complex join shapes — this is acceptable at expected save-list sizes.
   */
  async findSavedByUser(
    userId: string,
    pagination: PaginationParams,
  ): Promise<PaginatedResult<GlobalJob>> {
    const { page, pageSize } = pagination;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    // Step 1: paginate the saved_jobs table to get ordered job IDs
    const { data: savedRows, error: savedError, count } = await supabase
      .from("saved_jobs")
      .select("job_id", { count: "exact" })
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .range(from, to);

    if (savedError) throw savedError;

    const total = count ?? 0;
    const jobIds = (savedRows ?? []).map((r) => r.job_id as string);

    if (jobIds.length === 0) {
      return { data: [], total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
    }

    // Step 2: fetch full job data for the IDs on this page
    const { data: jobs, error: jobsError } = await supabase
      .from("global_jobs")
      .select(JOB_COLUMNS)
      .in("id", jobIds);

    if (jobsError) throw jobsError;

    return {
      data: (jobs ?? []) as unknown as GlobalJob[],
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  /** Returns true if the user has already saved the given job. */
  async isSaved(userId: string, jobId: string): Promise<boolean> {
    const { data, error } = await supabase
      .from("saved_jobs")
      .select("id")
      .eq("user_id", userId)
      .eq("job_id", jobId)
      .maybeSingle();
    if (error) throw error;
    return data !== null;
  }

  /**
   * Returns ALL saved job IDs for the user (no pagination).
   * Used by the UI to render saved/unsaved state on job list items
   * without an individual query per job.
   */
  async getSavedJobIds(userId: string): Promise<string[]> {
    const { data, error } = await supabase
      .from("saved_jobs")
      .select("job_id")
      .eq("user_id", userId);
    if (error) throw error;
    return (data ?? []).map((r) => r.job_id as string);
  }

  // ── Counts (sidebar badges) ───────────────────────────────────────────────

  /** Total number of jobs in the global board. */
  async countAll(): Promise<number> {
    const { count, error } = await supabase
      .from("global_jobs")
      .select("id", { count: "exact", head: true });
    if (error) throw error;
    return count ?? 0;
  }

  /** Number of jobs saved by the given user. */
  async countSavedByUser(userId: string): Promise<number> {
    const { count, error } = await supabase
      .from("saved_jobs")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId);
    if (error) throw error;
    return count ?? 0;
  }

  /** Number of applications created by the given user. */
  async countApplicationsByUser(userId: string): Promise<number> {
    const { count, error } = await supabase
      .from("applications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId);
    if (error) throw error;
    return count ?? 0;
  }
}

