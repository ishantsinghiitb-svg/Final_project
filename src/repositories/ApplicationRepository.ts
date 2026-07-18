import { supabase } from "@/lib/supabase";
import type { Application, ApplicationStatus, ApplicationTimelineEvent } from "@/types";
import type { ApplicationFilters, ApplicationSort } from "@/features/applications/types";
import type { PaginationParams, PaginatedResult } from "@/types";

const APP_COLUMNS =
  "id, user_id, job_id, company_name, role, status, applied_at, next_step, notes, location, salary_min, salary_max, salary_currency, source, url, archived, archived_at, created_via, metadata, notes_updated_at, priority, resume_id, cover_letter_id, created_at, updated_at";

const TIMELINE_COLUMNS = "id, application_id, user_id, kind, text, previous_value, new_value, metadata, created_at";

export class ApplicationRepository {
  // ── Read ──────────────────────────────────────────────────────────────────

  async findById(id: string): Promise<Application | null> {
    const { data, error } = await supabase
      .from("applications")
      .select(APP_COLUMNS)
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return data as Application | null;
  }

  /**
   * Returns a paginated, filtered, sorted list of applications for a user.
   */
  async findByUser(
    userId: string,
    filters: ApplicationFilters,
    sort: ApplicationSort,
    pagination: PaginationParams,
  ): Promise<PaginatedResult<Application>> {
    const { page, pageSize } = pagination;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let q = supabase
      .from("applications")
      .select(APP_COLUMNS, { count: "exact" })
      .eq("user_id", userId)
      .eq("archived", filters.archived ?? false);

    // ── Keyword search across company, role, notes ──
    if (filters.q) {
      const escaped = filters.q.replace(/[%_]/g, "\\$&");
      q = q.or(`company_name.ilike.%${escaped}%,role.ilike.%${escaped}%,notes.ilike.%${escaped}%`);
    }

    // ── Status filter ──
    if (filters.status !== undefined) {
      const statuses = Array.isArray(filters.status) ? filters.status : [filters.status];
      q = q.in("status", statuses);
    }

    // ── Company filter ──
    if (filters.company) {
      q = q.ilike("company_name", `%${filters.company}%`);
    }

    // ── Source filter ──
    if (filters.source) {
      q = q.eq("source", filters.source);
    }

    // ── Date range ──
    if (filters.appliedAfter) {
      q = q.gte("applied_at", filters.appliedAfter);
    }
    if (filters.appliedBefore) {
      q = q.lte("applied_at", filters.appliedBefore);
    }

    // ── Sort + paginate ──
    // applied_at can be NULL — push nulls last when sorting descending
    const nullsLast =
      sort.field === "applied_at" && sort.direction === "desc" ? { nullsFirst: false } : {};

    q = q.order(sort.field, { ascending: sort.direction === "asc", ...nullsLast }).range(from, to);

    const { data, error, count } = await q;
    if (error) throw error;

    const total = count ?? 0;
    return {
      data: (data ?? []) as unknown as Application[],
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  /**
   * Returns ALL applications for a user, grouped by status.
   * Used by the Kanban board (no pagination needed — boards typically show all cards).
   * `archived` toggles between the active board (default) and the archive view.
   */
  async findAllByUser(userId: string, archived = false): Promise<Application[]> {
    const { data, error } = await supabase
      .from("applications")
      .select(APP_COLUMNS)
      .eq("user_id", userId)
      .eq("archived", archived)
      .order("updated_at", { ascending: false });
    if (error) throw error;
    return (data ?? []) as unknown as Application[];
  }

  async findByJobId(userId: string, jobId: string): Promise<Application | null> {
    const { data, error } = await supabase
      .from("applications")
      .select(APP_COLUMNS)
      .eq("user_id", userId)
      .eq("job_id", jobId)
      .maybeSingle();

    if (error) throw error;

    return data as Application | null;
  }

  /**
   * Returns ALL job IDs the user has a (non-archived) application for — no
   * pagination. Mirrors JobRepository.getSavedJobIds's shape: used by the UI
   * to render a "Tracked" badge per card without one query per card.
   */
  async findTrackedJobIds(userId: string): Promise<string[]> {
    const { data, error } = await supabase
      .from("applications")
      .select("job_id")
      .eq("user_id", userId)
      .eq("archived", false)
      .not("job_id", "is", null);

    if (error) throw error;
    return (data ?? []).map((r) => r.job_id as string);
  }

  /**
   * Returns the timeline for an application, newest first. Rows are written
   * automatically by the `applications_log_timeline_event` DB trigger — see
   * supabase/migrations/20260717000001_module3a_application_management.sql.
   */
  async findTimeline(applicationId: string): Promise<ApplicationTimelineEvent[]> {
    const { data, error } = await supabase
      .from("application_activity")
      .select(TIMELINE_COLUMNS)
      .eq("application_id", applicationId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map((row) => ({
      id: row.id,
      application_id: row.application_id,
      user_id: row.user_id,
      event_type: row.kind as ApplicationTimelineEvent["event_type"],
      text: row.text,
      previous_value: row.previous_value,
      new_value: row.new_value,
      metadata: row.metadata,
      created_at: row.created_at,
    }));
  }

  // ── Write ─────────────────────────────────────────────────────────────────

  async create(
    userId: string,
    payload: Omit<Application, "id" | "user_id" | "created_at" | "updated_at">,
  ): Promise<Application> {
    const { data, error } = await supabase
      .from("applications")
      .insert({ ...payload, user_id: userId })
      .select(APP_COLUMNS)
      .single();
    if (error) throw error;
    return data as unknown as Application;
  }

  async updateStatus(id: string, status: ApplicationStatus): Promise<Application> {
    const { data, error } = await supabase
      .from("applications")
      .update({ status })
      .eq("id", id)
      .select(APP_COLUMNS)
      .single();
    if (error) throw error;
    return data as unknown as Application;
  }

  async update(
    id: string,
    updates: Partial<Omit<Application, "id" | "user_id" | "created_at" | "updated_at">>,
  ): Promise<Application> {
    const { data, error } = await supabase
      .from("applications")
      .update(updates)
      .eq("id", id)
      .select(APP_COLUMNS)
      .single();
    if (error) throw error;
    return data as unknown as Application;
  }

  async delete(id: string): Promise<void> {
    const { error } = await supabase.from("applications").delete().eq("id", id);
    if (error) throw error;
  }

  // ── Counts ────────────────────────────────────────────────────────────────

  async countByUser(userId: string): Promise<number> {
    const { count, error } = await supabase
      .from("applications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId);
    if (error) throw error;
    return count ?? 0;
  }

  /** Returns per-status counts for the current user (used for Kanban headers). */
  async countByStatus(userId: string): Promise<Record<string, number>> {
    const { data, error } = await supabase
      .from("applications")
      .select("status")
      .eq("user_id", userId);
    if (error) throw error;
    const counts: Record<string, number> = {};
    for (const row of data ?? []) {
      const s = row.status as string;
      counts[s] = (counts[s] ?? 0) + 1;
    }
    return counts;
  }
}
