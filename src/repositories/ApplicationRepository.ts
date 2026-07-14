import { supabase } from "@/lib/supabase";
import type { Application, ApplicationStatus } from "@/types";
import type { ApplicationFilters, ApplicationSort } from "@/features/applications/types";
import type { PaginationParams, PaginatedResult } from "@/types";

const APP_COLUMNS =
  "id, user_id, job_id, company_name, role, status, applied_at, next_step, notes, location, salary_min, salary_max, salary_currency, source, url, created_at, updated_at";

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
      .eq("user_id", userId);

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
   */
  async findAllByUser(userId: string): Promise<Application[]> {
    const { data, error } = await supabase
      .from("applications")
      .select(APP_COLUMNS)
      .eq("user_id", userId)
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
