import { supabase } from "@/lib/supabase";
import type { GlobalJob, SavedJob, Skill, PaginationParams, PaginatedResult } from "@/types";
import type { Json } from "@/types/database";
import type { JobFilters, JobSort, RoleCategory } from "@/features/jobs/types";
import { roleMatchesAnyCategory } from "@/features/jobs/utils";

// Select all columns that map to the GlobalJob domain type.
// `role_id` and `location_id` are DB-only FK references and are excluded
// intentionally — they are not part of the GlobalJob domain model.
const JOB_COLUMNS =
  "id, company_id, company_name, role, location, remote, work_mode, employment_type, experience_level, salary_min, salary_max, salary_currency, description, url, source, posted_at, source_job_id, fingerprint, company_logo_url, is_closed, source_url, company_url, city, country, posted_ago, applicant_count, hiring_insights, easy_apply, promoted, reposted, responses_managed, industry, job_function, benefits, description_html, state, department, company_career_url, salary_period, salary_text, responsibilities, requirements, preferred_qualifications, technologies, languages, expiry_date, hiring_team, recruiter_name, recruiter_profile, company_size, parser_version, parser_confidence, extraction_warnings, is_manual_import, created_at, updated_at";

const SAVED_JOB_COLUMNS = "id, user_id, job_id, notes, created_at";

/**
 * Minimal structural view of the two chainable Supabase filter-builder methods
 * the discovery-feed rule needs. The builder's full generic type differs
 * between the list `select` (all columns, rows returned) and the head-only
 * count `select` (`head: true`), so `applyDiscoveryVisibility` narrows to this
 * to stay reusable across both call sites without re-implementing the rule.
 */
type DiscoveryFilterable = {
  eq(column: string, value: boolean): DiscoveryFilterable;
  or(filters: string): DiscoveryFilterable;
};

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

  // ── Write (manual import) ───────────────────────────────────────────────────

  /**
   * The single write path for global_jobs — the SECURITY DEFINER
   * `upsert_global_job` RPC (see supabase/migrations/20260716000001_* and
   * 20260720000001_*). Resolves by (source, source_job_id) then fingerprint and
   * creates or updates in place, so callers never insert a duplicate. Shared by
   * the manual URL importer; the Chrome extension calls the same RPC from its
   * own bundle.
   */
  async upsertGlobalJob(payload: Json): Promise<GlobalJob> {
    const { data, error } = await supabase.rpc("upsert_global_job", { payload });
    if (error) throw error;
    return data as unknown as GlobalJob;
  }

  // ── Discovery-feed visibility (single source of truth) ──────────────────────

  /**
   * Applies the Global Jobs *discovery-feed* visibility rule to a query
   * builder. This is the ONE canonical definition of "which rows the discovery
   * feed shows"; both the list (`findAll`, with its exact `count`) and the
   * sidebar badge (`countDiscoverable`) run their query through here, so the
   * two can never disagree. Mirrors features/jobs/utils#isJobExpired /
   * getJobBadges so a job hidden here shows the matching badge wherever it
   * still appears (Applications, Saved Jobs, direct job-detail links).
   *
   * A row is hidden ONLY if it is a manual import, is closed, or carries an
   * explicit `expiry_date` that has already passed. Freshness is deliberately
   * NOT judged by `posted_at` age: LinkedIn's structured `posted_at` (JSON-LD
   * `datePosted`) is the ORIGINAL post date, so a still-open, freshly captured
   * *reposted* listing legitimately carries a `posted_at` months old — a hard
   * age ceiling on that column silently dropped those valid, newly-parsed rows
   * from the feed even though they were open and not expired (they still
   * appeared under Applications / Saved / Job Detail, which don't apply this
   * filter — exactly the reported regression). Expiry is instead driven by the
   * reliable signals: `is_closed` (LinkedIn's own "no longer accepting" / past
   * `validThrough` — see LinkedInParser.readIsClosed) and an explicit past
   * `expiry_date`. `is_closed` / `is_manual_import` are both `NOT NULL DEFAULT
   * false`, so `.eq(…, false)` can never wrongly drop a valid row on a NULL.
   */
  private applyDiscoveryVisibility<T>(query: T): T {
    const nowIso = new Date().toISOString();
    return (query as unknown as DiscoveryFilterable)
      .eq("is_manual_import", false)
      .eq("is_closed", false)
      .or(`expiry_date.is.null,expiry_date.gte.${nowIso}`) as unknown as T;
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

    // ── Discovery-feed visibility ──
    // The Jobs page is a discovery feed, not a dump of every global_jobs row.
    // Manually-imported, closed, and expired jobs stay in the table
    // (Applications, Saved Jobs, and direct job-detail links still show them)
    // but are excluded here. Applied as a WHERE clause (not a client-side
    // filter after fetching) so the `count` and pagination stay accurate — the
    // SAME helper backs the sidebar badge (countDiscoverable), so the two can
    // never disagree. See applyDiscoveryVisibility for the exact rule.
    q = this.applyDiscoveryVisibility(q);

    // ── Keyword search ──
    // Matches against role, company, description, job function, and industry
    // directly, plus skills — which live in a join table, so matching job IDs
    // are resolved separately and folded into the same `.or()` as `id.in.(...)`.
    if (filters.q) {
      const escaped = filters.q.replace(/[%_]/g, "\\$&");
      const orParts = [
        `role.ilike.%${escaped}%`,
        `company_name.ilike.%${escaped}%`,
        `description.ilike.%${escaped}%`,
        `job_function.ilike.%${escaped}%`,
        `industry.ilike.%${escaped}%`,
      ];

      const { data: skillMatches, error: skillError } = await supabase
        .from("job_skills")
        .select("job_id, skills!inner(name)")
        .ilike("skills.name", `%${escaped}%`);
      if (skillError) throw skillError;

      const skillJobIds = Array.from(new Set((skillMatches ?? []).map((r) => r.job_id as string)));
      if (skillJobIds.length > 0) {
        orParts.push(`id.in.(${skillJobIds.join(",")})`);
      }

      q = q.or(orParts.join(","));
    }

    // ── Company name ──
    if (filters.company) {
      q = q.ilike("company_name", `%${filters.company}%`);
    }

    // ── Role ──
    if (filters.role) {
      q = q.ilike("role", `%${filters.role}%`);
    }

    // ── Role category ──
    // Not a DB column — resolved to matching IDs first (via the same
    // roleMatchesAnyCategory used by the Applications Role filter) so
    // pagination and the total count stay accurate.
    if (filters.roleCategory) {
      const ids = await this.findJobIdsByRoleCategory(filters.roleCategory);
      if (ids.length === 0) {
        return { data: [], total: 0, page, pageSize, totalPages: 0 };
      }
      q = q.in("id", ids);
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
    // A unique `id` tiebreaker after the caller's sort column keeps ordering
    // deterministic across page requests. Without it, rows sharing the same
    // sort value (e.g. the many jobs with an equal or NULL `posted_at`) can be
    // returned in a different relative order on each query, letting a row slip
    // across a page boundary and appear to "vanish" from the paginated feed.
    q = q
      .order(sort.field, { ascending: sort.direction === "asc" })
      .order("id", { ascending: true })
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
   * Resolves the IDs of jobs whose role matches any of the given categories
   * (OR). `role_category` isn't a DB column — matching runs client-side via
   * roleMatchesAnyCategory() over a lightweight (id, role) projection, so
   * this stays in sync with the Applications Role filter without
   * duplicating the matching logic in SQL.
   */
  async findJobIdsByRoleCategory(categories: RoleCategory | RoleCategory[]): Promise<string[]> {
    const wanted = Array.isArray(categories) ? categories : [categories];
    const { data, error } = await supabase.from("global_jobs").select("id, role");
    if (error) throw error;
    return (data ?? [])
      .filter((row) => roleMatchesAnyCategory(row.role as string, wanted))
      .map((row) => row.id as string);
  }

  /**
   * Looks for an existing global_jobs row matching a company + role (and,
   * if given, location) exactly (case-insensitive). Used when creating a
   * manual application so it can reuse the GlobalJob instead of never
   * linking one — see ApplicationService.createManual.
   */
  async findMatchingJob(
    companyName: string,
    role: string,
    location?: string,
  ): Promise<GlobalJob | null> {
    const escape = (s: string) => s.trim().replace(/[%_]/g, "\\$&");

    let q = supabase
      .from("global_jobs")
      .select(JOB_COLUMNS)
      .ilike("company_name", escape(companyName))
      .ilike("role", escape(role));

    if (location?.trim()) {
      q = q.ilike("location", escape(location));
    }

    const { data, error } = await q.limit(1).maybeSingle();
    if (error) throw error;
    return data as GlobalJob | null;
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

  /**
   * Number of jobs visible in the Global Jobs *discovery feed* — the value
   * behind the sidebar "Jobs" badge. Applies the EXACT same visibility rule as
   * `findAll` (via the shared applyDiscoveryVisibility), so the badge always
   * equals the number of jobs the Jobs page actually lists. (A raw, unfiltered
   * `count(*)` was the count/list mismatch: it also counted manually-imported,
   * closed, expired, and >90-day-old rows that the list correctly hides.)
   */
  async countDiscoverable(): Promise<number> {
    const base = supabase
      .from("global_jobs")
      .select("id", { count: "exact", head: true });
    const { count, error } = await this.applyDiscoveryVisibility(base);
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

