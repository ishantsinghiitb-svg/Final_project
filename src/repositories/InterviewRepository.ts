import { supabase } from "@/lib/supabase";
import type { Interview, InterviewStatus } from "@/types";

// `prep` (the original placeholder notes column) is intentionally excluded —
// superseded by `notes`, see supabase/migrations/20260801000001_module7a_interview_workspace.sql.
const INTERVIEW_COLUMNS =
  "id, user_id, application_id, company_name, role, scheduled_at, interviewer, type, status, link, mode, location, resume_id, resume_name_snapshot, job_id, notes, source_gmail_suggestion_id, created_at, updated_at";

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
    return interview ? (await this.attachLogos([interview]))[0] : null;
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
    return this.attachLogos((data ?? []) as unknown as Interview[]);
  }

  /** Interviews linked to a specific application, earliest first. */
  async findByApplicationId(applicationId: string): Promise<Interview[]> {
    const { data, error } = await supabase
      .from("interviews")
      .select(INTERVIEW_COLUMNS)
      .eq("application_id", applicationId)
      .order("scheduled_at", { ascending: true });
    if (error) throw error;
    return this.attachLogos((data ?? []) as unknown as Interview[]);
  }

  /**
   * Enriches interviews with the linked global_job's stored `company_logo_url`
   * (read-time-only, never a persisted column) — mirrors
   * ApplicationRepository.attachLogos so the same job's logo renders
   * consistently across Applications and Interviews. Interviews with no
   * `job_id` (fully standalone) simply get `null` and fall back to initials.
   */
  private async attachLogos(interviews: Interview[]): Promise<Interview[]> {
    const jobIds = [
      ...new Set(interviews.map((i) => i.job_id).filter((id): id is string => Boolean(id))),
    ];
    if (jobIds.length === 0) return interviews;

    const { data, error } = await supabase
      .from("global_jobs")
      .select("id, company_logo_url")
      .in("id", jobIds);
    if (error) throw error;

    const logos = new Map(
      (data ?? []).map((r) => [r.id, r.company_logo_url] as [string, string | null]),
    );
    return interviews.map((interview) => ({
      ...interview,
      company_logo_url: interview.job_id ? (logos.get(interview.job_id) ?? null) : null,
    }));
  }

  // ── Write ─────────────────────────────────────────────────────────────────

  async create(
    userId: string,
    // `company_logo_url` is a read-time-only derived field (see attachLogos), never a column — excluded from writes.
    payload: Omit<Interview, "id" | "user_id" | "created_at" | "updated_at" | "company_logo_url">,
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
      Omit<Interview, "id" | "user_id" | "created_at" | "updated_at" | "company_logo_url">
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
