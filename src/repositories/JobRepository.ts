import { supabase } from "@/lib/supabase";
import type { GlobalJob, SavedJob, Skill, PaginationParams, PaginatedResult } from "@/types";
import type { Json } from "@/types/database";
import type { JobFilters, JobSort, RoleCategory } from "@/features/jobs/types";
import { roleMatchesAnyCategory, extractRoleKeywords } from "@/features/jobs/utils";

// Select all columns that map to the GlobalJob domain type.
// `role_id` and `location_id` are DB-only FK references and are excluded
// intentionally — they are not part of the GlobalJob domain model.
const JOB_COLUMNS =
  "id, company_id, company_name, role, location, remote, work_mode, employment_type, experience_level, salary_min, salary_max, salary_currency, description, url, source, posted_at, source_job_id, fingerprint, company_logo_url, is_closed, source_url, company_url, city, country, posted_ago, applicant_count, hiring_insights, easy_apply, promoted, reposted, responses_managed, industry, job_function, benefits, description_html, state, department, company_career_url, salary_period, salary_text, responsibilities, requirements, preferred_qualifications, technologies, languages, expiry_date, hiring_team, recruiter_name, recruiter_profile, company_size, parser_version, parser_confidence, extraction_warnings, is_manual_import, created_at, updated_at";

// Deliberately excludes archived/archived_at: the save (insert-return) path
// must not depend on the Module 5A archive migration having been applied, so
// saving keeps working even when those columns don't exist yet. The archive
// columns are only read/written through the archive-aware methods below, each
// of which feature-detects support first (see supportsArchive).
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
  // ── Saved-job archive capability probe ──────────────────────────────────────
  // The Module 5A archive migration (saved_jobs.archived/archived_at) may not
  // be applied in every environment yet. Rather than let a pending migration
  // hard-break Save / the Saved list (which is what happened when the archive
  // code shipped ahead of the migration), every archive-aware method first
  // feature-detects the columns. Memoized for the session, so it costs at most
  // one lightweight head request. When unsupported, Saved surfaces behave
  // exactly as they did before the archive feature existed.
  private archiveSupport?: Promise<boolean>;

  private supportsArchive(): Promise<boolean> {
    if (!this.archiveSupport) {
      this.archiveSupport = (async () => {
        const { error } = await supabase
          .from("saved_jobs")
          .select("archived", { head: true, count: "exact" });
        // A missing column surfaces as a PostgREST error; RLS on an existing
        // column returns no error (just an empty/So count), so "no error" ⇒
        // the column exists.
        return !error;
      })();
    }
    return this.archiveSupport;
  }

  /** Public accessor so the UI can hide archive controls until the migration lands. */
  async isArchiveEnabled(): Promise<boolean> {
    return this.supportsArchive();
  }

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
   * Fetches full GlobalJob rows for a batch of ids in one query (order not
   * guaranteed — callers that need a specific order, e.g. a collection's
   * added_at order, re-sort the result). Added for Module 5B (Collections) so
   * CollectionRepository can hydrate its (collection_id → job_id) membership
   * rows into full jobs without duplicating JOB_COLUMNS in a second repository.
   */
  async findByIds(ids: string[]): Promise<GlobalJob[]> {
    if (ids.length === 0) return [];
    const { data, error } = await supabase
      .from("global_jobs")
      .select(JOB_COLUMNS)
      .in("id", ids);
    if (error) throw error;
    return (data ?? []) as unknown as GlobalJob[];
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
    // Keyword searches go through the relevance-ranked path so results are
    // ordered by how well they match (exact title → starts-with → company →
    // skills → location → employment type → description) instead of every
    // field being weighted equally. The plain, no-keyword feed keeps its
    // straight server-side filter+sort+paginate below.
    if (filters.q && filters.q.trim()) {
      return this.findAllRanked(filters, sort, pagination);
    }

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

    // (Keyword search is handled by findAllRanked — see the early return above.)

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
   * Relevance-ranked keyword search. Selects candidate rows with the SAME
   * discovery-visibility + filters as `findAll`, then scores and orders them by
   * how well they match the query (see `relevanceScore`) before paginating.
   *
   * Ranking (highest first): exact title → title starts-with → title contains
   * → company → skills → location → employment type → description/other. This
   * follows the existing "resolve a lightweight projection, then fetch the full
   * rows for the page" pattern already used by `findJobIdsByRoleCategory`, so
   * pagination and the total count stay accurate without a new DB function.
   */
  private async findAllRanked(
    filters: JobFilters,
    sort: JobSort,
    pagination: PaginationParams,
  ): Promise<PaginatedResult<GlobalJob>> {
    const { page, pageSize } = pagination;
    const query = filters.q!.trim();
    const qLower = query.toLowerCase();
    const escaped = query.replace(/[%_]/g, "\\$&");

    // Skills live in a join table — resolve matching job IDs first so they can
    // both widen the candidate set and score as a distinct (priority-4) tier.
    const { data: skillMatches, error: skillError } = await supabase
      .from("job_skills")
      .select("job_id, skills!inner(name)")
      .ilike("skills.name", `%${escaped}%`);
    if (skillError) throw skillError;
    const skillJobIds = new Set((skillMatches ?? []).map((r) => r.job_id as string));

    // Lightweight candidate projection — just the columns needed to score.
    let c = supabase
      .from("global_jobs")
      .select("id, role, company_name, location, city, employment_type, posted_at, created_at");

    c = this.applyDiscoveryVisibility(c);

    const orParts = [
      `role.ilike.%${escaped}%`,
      `company_name.ilike.%${escaped}%`,
      `location.ilike.%${escaped}%`,
      `city.ilike.%${escaped}%`,
      `employment_type.ilike.%${escaped}%`,
      `description.ilike.%${escaped}%`,
      `job_function.ilike.%${escaped}%`,
      `industry.ilike.%${escaped}%`,
    ];
    if (skillJobIds.size > 0) {
      orParts.push(`id.in.(${[...skillJobIds].join(",")})`);
    }
    c = c.or(orParts.join(","));

    // ── Same non-keyword filters as findAll ──
    if (filters.roleCategory) {
      const ids = await this.findJobIdsByRoleCategory(filters.roleCategory);
      if (ids.length === 0) {
        return { data: [], total: 0, page, pageSize, totalPages: 0 };
      }
      c = c.in("id", ids);
    }
    if (filters.company) c = c.ilike("company_name", `%${filters.company}%`);
    if (filters.role) c = c.ilike("role", `%${filters.role}%`);
    if (filters.location) c = c.ilike("location", `%${filters.location}%`);
    if (filters.remote !== undefined) c = c.eq("remote", filters.remote);
    if (filters.workMode !== undefined) {
      c = c.in("work_mode", Array.isArray(filters.workMode) ? filters.workMode : [filters.workMode]);
    }
    if (filters.employmentType !== undefined) {
      c = c.in(
        "employment_type",
        Array.isArray(filters.employmentType) ? filters.employmentType : [filters.employmentType],
      );
    }
    if (filters.experienceLevel !== undefined) {
      c = c.in(
        "experience_level",
        Array.isArray(filters.experienceLevel) ? filters.experienceLevel : [filters.experienceLevel],
      );
    }
    if (filters.source !== undefined) {
      c = c.in("source", Array.isArray(filters.source) ? filters.source : [filters.source]);
    }
    if (filters.salaryMin !== undefined) c = c.gte("salary_min", filters.salaryMin);
    if (filters.salaryMax !== undefined) c = c.lte("salary_max", filters.salaryMax);
    if (filters.postedAfter) c = c.gte("posted_at", filters.postedAfter);

    const { data: candidates, error } = await c;
    if (error) throw error;

    type Candidate = {
      id: string;
      role: string | null;
      company_name: string | null;
      location: string | null;
      city: string | null;
      employment_type: string | null;
      posted_at: string | null;
      created_at: string | null;
    };

    const recency = (row: Candidate) =>
      Date.parse(row.posted_at ?? row.created_at ?? "") || 0;

    // Score, then order by (relevance desc, recency desc, id asc) — the id
    // tiebreaker keeps pagination deterministic across requests.
    const ranked = ((candidates ?? []) as Candidate[])
      .map((row) => ({ row, score: this.relevanceScore(qLower, row, skillJobIds) }))
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        const rd = recency(b.row) - recency(a.row);
        if (rd !== 0) return rd;
        return a.row.id < b.row.id ? -1 : a.row.id > b.row.id ? 1 : 0;
      });

    const total = ranked.length;
    const from = (page - 1) * pageSize;
    const pageIds = ranked.slice(from, from + pageSize).map((r) => r.row.id);

    if (pageIds.length === 0) {
      return { data: [], total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
    }

    // Fetch full rows for this page, then restore the ranked order (`.in` does
    // not preserve the order of the id list).
    const { data: rows, error: rowsError } = await supabase
      .from("global_jobs")
      .select(JOB_COLUMNS)
      .in("id", pageIds);
    if (rowsError) throw rowsError;

    const byId = new Map((rows ?? []).map((r) => [(r as { id: string }).id, r]));
    const ordered = pageIds
      .map((id) => byId.get(id))
      .filter((r): r is NonNullable<typeof r> => r != null);

    return {
      data: ordered as unknown as GlobalJob[],
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  /**
   * Relevance tier for one candidate against a lowercased query. Higher wins.
   * Mirrors the required priority order; a row that only matched via
   * description / job function / industry (none of the ranked fields) lands in
   * the lowest tier rather than being dropped.
   */
  private relevanceScore(
    qLower: string,
    row: {
      id: string;
      role: string | null;
      company_name: string | null;
      location: string | null;
      city: string | null;
      employment_type: string | null;
    },
    skillJobIds: Set<string>,
  ): number {
    const role = (row.role ?? "").toLowerCase();
    const company = (row.company_name ?? "").toLowerCase();
    const location = `${row.location ?? ""} ${row.city ?? ""}`.toLowerCase();
    const employment = (row.employment_type ?? "").toLowerCase();

    if (role === qLower) return 100; // 1. exact title
    if (role.startsWith(qLower)) return 85; // 2. title starts-with
    if (role.split(/\s+/).some((w) => w.startsWith(qLower))) return 75; // starts-with a title word
    if (role.includes(qLower)) return 65; // title contains
    if (company.includes(qLower)) return 50; // 3. company
    if (skillJobIds.has(row.id)) return 40; // 4. skills
    if (location.includes(qLower)) return 30; // 5. location
    if (employment.includes(qLower)) return 20; // 6. employment type
    return 10; // 7. description / job function / industry
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
   * Returns jobs genuinely related to a reference job, ranked by relevance.
   *
   * The candidate pool is jobs that share at least one significant title
   * keyword with the reference (so "Product Manager" pulls other Product/Manager
   * roles, never "Graphic Designer"). Candidates are then scored on overlapping
   * signals — shared title keywords (dominant), job function, experience level,
   * employment type, industry, and shared skills — and the top `limit` are
   * returned. Excludes the reference job and respects discovery visibility.
   * Reuses global_jobs only — no external calls.
   */
  async findSimilarJobs(job: GlobalJob, limit: number = 6): Promise<GlobalJob[]> {
    const refKeywords = extractRoleKeywords(job.role);

    // Candidate OR: one title-keyword match per token. If the title yields no
    // usable keywords, fall back to job function / industry so we still return
    // something relevant rather than nothing.
    const orParts: string[] = refKeywords.map((t) => `role.ilike.%${t}%`);
    if (orParts.length === 0) {
      if (job.job_function) orParts.push(`job_function.ilike.%${job.job_function.replace(/[%_]/g, "\\$&")}%`);
      if (job.industry) orParts.push(`industry.ilike.%${job.industry.replace(/[%_]/g, "\\$&")}%`);
    }
    if (orParts.length === 0) return [];

    let c = supabase.from("global_jobs").select(JOB_COLUMNS);
    c = this.applyDiscoveryVisibility(c);
    const { data: candidates, error } = await c
      .neq("id", job.id)
      .or(orParts.join(","))
      .order("posted_at", { ascending: false })
      .limit(120);
    if (error) throw error;

    const pool = (candidates ?? []) as unknown as GlobalJob[];
    if (pool.length === 0) return [];

    // Skills overlap — reference + all candidates, resolved in two queries.
    const refSkills = new Set(
      (await this.findSkillsForJob(job.id)).map((s) => s.name.toLowerCase()),
    );
    const candidateSkills = await this.skillsByJobIds(pool.map((p) => p.id));

    const refKeywordSet = new Set(refKeywords);
    const eqi = (a?: string | null, b?: string | null) =>
      Boolean(a && b && a.toLowerCase() === b.toLowerCase());

    const scored = pool
      .map((cand) => {
        let score = 0;

        // Shared title keywords — the dominant signal.
        const candKeywords = extractRoleKeywords(cand.role);
        const sharedKeywords = candKeywords.filter((k) => refKeywordSet.has(k)).length;
        score += sharedKeywords * 12;

        if (eqi(job.job_function, cand.job_function)) score += 8;
        if (eqi(job.experience_level, cand.experience_level)) score += 5;
        if (eqi(job.employment_type, cand.employment_type)) score += 4;
        if (eqi(job.industry, cand.industry)) score += 3;

        const candSkills = candidateSkills.get(cand.id);
        if (candSkills && refSkills.size > 0) {
          let overlap = 0;
          for (const s of refSkills) if (candSkills.has(s)) overlap++;
          score += Math.min(overlap, 5) * 2;
        }

        return { cand, score };
      })
      .filter((s) => s.score > 0)
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        const ra = Date.parse(a.cand.posted_at ?? a.cand.created_at ?? "") || 0;
        const rb = Date.parse(b.cand.posted_at ?? b.cand.created_at ?? "") || 0;
        return rb - ra;
      });

    return scored.slice(0, limit).map((s) => s.cand);
  }

  /** Map of job_id → lowercased skill-name set, for a batch of jobs (one query). */
  private async skillsByJobIds(jobIds: string[]): Promise<Map<string, Set<string>>> {
    const map = new Map<string, Set<string>>();
    if (jobIds.length === 0) return map;

    const { data, error } = await supabase
      .from("job_skills")
      .select("job_id, skills:skills(name)")
      .in("job_id", jobIds);
    if (error) throw error;

    type Row = { job_id: string; skills: { name: string } | null };
    for (const row of (data ?? []) as unknown as Row[]) {
      const name = row.skills?.name?.toLowerCase();
      if (!name) continue;
      if (!map.has(row.job_id)) map.set(row.job_id, new Set());
      map.get(row.job_id)!.add(name);
    }
    return map;
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
   * Returns the user's ACTIVE (non-archived) saved jobs as GlobalJob records
   * (paginated). Uses two queries to keep the implementation simple and avoid
   * complex join shapes — this is acceptable at expected save-list sizes.
   */
  async findSavedByUser(
    userId: string,
    pagination: PaginationParams,
  ): Promise<PaginatedResult<GlobalJob>> {
    return this.findSavedByUserFiltered(userId, pagination, false);
  }

  /**
   * Returns the user's ARCHIVED saved jobs as GlobalJob records (paginated) —
   * the "archive instead of delete" partition (product decision #7). Same
   * two-step shape as findSavedByUser; only the archived flag differs.
   */
  async findArchivedSavedByUser(
    userId: string,
    pagination: PaginationParams,
  ): Promise<PaginatedResult<GlobalJob>> {
    return this.findSavedByUserFiltered(userId, pagination, true);
  }

  /**
   * Shared implementation behind findSavedByUser / findArchivedSavedByUser.
   * `archived` selects which partition of the user's saves to page over.
   */
  private async findSavedByUserFiltered(
    userId: string,
    pagination: PaginationParams,
    archived: boolean,
  ): Promise<PaginatedResult<GlobalJob>> {
    const { page, pageSize } = pagination;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    // When the archive migration isn't applied, the archived partition simply
    // can't exist yet — return empty for it — while the active list falls back
    // to "all saves" (its pre-archive behavior), so Saved never breaks.
    const supportsArchive = await this.supportsArchive();
    if (!supportsArchive && archived) {
      return { data: [], total: 0, page, pageSize, totalPages: 0 };
    }

    // Step 1: paginate the saved_jobs table to get ordered job IDs
    let savedQuery = supabase
      .from("saved_jobs")
      .select("job_id", { count: "exact" })
      .eq("user_id", userId);
    if (supportsArchive) {
      savedQuery = savedQuery.eq("archived", archived);
    }
    const { data: savedRows, error: savedError, count } = await savedQuery
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

  /** Archives a saved job (soft — keeps the bookmark, hides it from the active list). */
  async archiveSavedJob(userId: string, jobId: string): Promise<void> {
    if (!(await this.supportsArchive())) {
      throw new Error(
        "Saved-job archive is unavailable until the pending database migration is applied.",
      );
    }
    const { error } = await supabase
      .from("saved_jobs")
      .update({ archived: true, archived_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("job_id", jobId);
    if (error) throw error;
  }

  /** Restores an archived saved job back into the active list. */
  async unarchiveSavedJob(userId: string, jobId: string): Promise<void> {
    if (!(await this.supportsArchive())) {
      throw new Error(
        "Saved-job archive is unavailable until the pending database migration is applied.",
      );
    }
    const { error } = await supabase
      .from("saved_jobs")
      .update({ archived: false, archived_at: null })
      .eq("user_id", userId)
      .eq("job_id", jobId);
    if (error) throw error;
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
   * Returns ALL saved job IDs for the user (no pagination), INCLUDING archived
   * saves. Used by the UI to render saved/unsaved state on job list items
   * without an individual query per job. Archived saves are intentionally kept
   * here: their saved_jobs row still exists, so the bookmark must read as
   * "saved" — otherwise a re-save would violate the UNIQUE(user_id, job_id).
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

  /**
   * Number of ACTIVE (non-archived) jobs saved by the given user — the value
   * behind the sidebar "Saved" badge, so it matches the default Saved list
   * (which hides archived saves).
   */
  async countSavedByUser(userId: string): Promise<number> {
    const supportsArchive = await this.supportsArchive();
    let q = supabase
      .from("saved_jobs")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId);
    if (supportsArchive) {
      q = q.eq("archived", false);
    }
    const { count, error } = await q;
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

