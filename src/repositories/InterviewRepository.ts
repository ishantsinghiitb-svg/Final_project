import { supabase } from "@/lib/supabase";
import type { Interview, InterviewStatus } from "@/types";

// `prep` (the original placeholder notes column) is intentionally excluded —
// superseded by `notes`, see supabase/migrations/20260801000001_module7a_interview_workspace.sql.
const INTERVIEW_COLUMNS =
  "id, user_id, application_id, company_name, role, scheduled_at, interviewer, type, status, link, mode, location, resume_id, resume_name_snapshot, job_id, notes, source_suggestion_id, calendar_event_id, source, calendar_fields_locked, last_calendar_sync_at, created_at, updated_at";

export class InterviewRepository {
  // ── Read ──────────────────────────────────────────────────────────────────

  async findById(id: string): Promise<Interview | null> {
    const { data, error } = await supabase
      .from("interviews")
      .select(INTERVIEW_COLUMNS)
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    const interview = data as Interview | null;
    return interview ? (await this.attachDerivedFields([interview]))[0] : null;
  }

  /**
   * Returns ALL interviews for a user, earliest first. Unpaginated — mirrors
   * ApplicationRepository.findAllByUser (the Interviews page filters/sorts
   * client-side over this, same choice Applications made for its board/list).
   */
  async findAllByUser(userId: string): Promise<Interview[]> {
    const { data, error } = await supabase
      .from("interviews")
      .select(INTERVIEW_COLUMNS)
      .eq("user_id", userId)
      .order("scheduled_at", { ascending: true });
    if (error) throw error;
    return this.attachDerivedFields((data ?? []) as unknown as Interview[]);
  }

  /** Interviews linked to a specific application, earliest first. */
  async findByApplicationId(applicationId: string): Promise<Interview[]> {
    const { data, error } = await supabase
      .from("interviews")
      .select(INTERVIEW_COLUMNS)
      .eq("application_id", applicationId)
      .order("scheduled_at", { ascending: true });
    if (error) throw error;
    return this.attachDerivedFields((data ?? []) as unknown as Interview[]);
  }

  /**
   * Enriches interviews with two read-time-only derived fields, neither a
   * persisted `interviews` column:
   *   - `company_logo_url` — the linked global_job's stored logo (mirrors
   *     ApplicationRepository's own attachLogos so the same job's logo
   *     renders consistently across Applications and Interviews).
   *   - `is_calendar_event_stale` (Module 9B) — true when this interview's
   *     linked calendar_events row has been cancelled or dismissed on the
   *     Google side. The interview itself is never auto-deleted (Q50); this
   *     only drives the "Removed from your calendar" card treatment.
   */
  private async attachDerivedFields(interviews: Interview[]): Promise<Interview[]> {
    const jobIds = [
      ...new Set(interviews.map((i) => i.job_id).filter((id): id is string => Boolean(id))),
    ];
    const calendarEventIds = [
      ...new Set(
        interviews.map((i) => i.calendar_event_id).filter((id): id is string => Boolean(id)),
      ),
    ];

    const [logosResult, calendarEventsResult] = await Promise.all([
      jobIds.length > 0
        ? supabase.from("global_jobs").select("id, company_logo_url").in("id", jobIds)
        : Promise.resolve({
            data: [] as { id: string; company_logo_url: string | null }[],
            error: null,
          }),
      calendarEventIds.length > 0
        ? supabase
            .from("calendar_events")
            .select("id, google_status, ignored_at")
            .in("id", calendarEventIds)
        : Promise.resolve({
            data: [] as { id: string; google_status: string; ignored_at: string | null }[],
            error: null,
          }),
    ]);
    if (logosResult.error) throw logosResult.error;
    if (calendarEventsResult.error) throw calendarEventsResult.error;

    const logos = new Map(
      (logosResult.data ?? []).map((r) => [r.id, r.company_logo_url] as [string, string | null]),
    );
    const staleEventIds = new Set(
      (calendarEventsResult.data ?? [])
        .filter((e) => e.google_status === "cancelled" || Boolean(e.ignored_at))
        .map((e) => e.id),
    );

    return interviews.map((interview) => ({
      ...interview,
      company_logo_url: interview.job_id ? (logos.get(interview.job_id) ?? null) : null,
      is_calendar_event_stale: interview.calendar_event_id
        ? staleEventIds.has(interview.calendar_event_id)
        : false,
    }));
  }

  // ── Write ─────────────────────────────────────────────────────────────────

  async create(
    userId: string,
    // `company_logo_url`/`is_calendar_event_stale` are read-time-only derived fields (see attachDerivedFields), never columns — excluded from writes.
    payload: Omit<
      Interview,
      | "id"
      | "user_id"
      | "created_at"
      | "updated_at"
      | "company_logo_url"
      | "is_calendar_event_stale"
    >,
  ): Promise<Interview> {
    const { data, error } = await supabase
      .from("interviews")
      .insert({ ...payload, user_id: userId })
      .select(INTERVIEW_COLUMNS)
      .single();
    if (error) throw error;
    return data as unknown as Interview;
  }

  async update(
    id: string,
    updates: Partial<
      Omit<
        Interview,
        | "id"
        | "user_id"
        | "created_at"
        | "updated_at"
        | "company_logo_url"
        | "is_calendar_event_stale"
      >
    >,
  ): Promise<Interview> {
    const { data, error } = await supabase
      .from("interviews")
      .update(updates)
      .eq("id", id)
      .select(INTERVIEW_COLUMNS)
      .single();
    if (error) throw error;
    return data as unknown as Interview;
  }

  async updateStatus(id: string, status: InterviewStatus): Promise<Interview> {
    const { data, error } = await supabase
      .from("interviews")
      .update({ status })
      .eq("id", id)
      .select(INTERVIEW_COLUMNS)
      .single();
    if (error) throw error;
    return data as unknown as Interview;
  }

  async delete(id: string): Promise<void> {
    const { error } = await supabase.from("interviews").delete().eq("id", id);
    if (error) throw error;
  }
}
