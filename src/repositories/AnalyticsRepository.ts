import { supabase } from "@/lib/supabase";
import type { ApplicationStatus } from "@/types";

const APP_COLUMNS = "id, resume_id, status";
const ACTIVITY_COLUMNS = "application_id, kind, new_value, created_at";
const RESUME_COLUMNS = "id, name";
const INTERVIEW_COLUMNS = "application_id, status, scheduled_at";

export type AnalyticsApplicationRow = {
  id: string;
  resume_id: string | null;
  status: ApplicationStatus;
};

export type AnalyticsActivityRow = {
  application_id: string;
  kind: string;
  new_value: string | null;
  created_at: string;
};

export type AnalyticsInterviewRow = {
  application_id: string;
  status: string;
  scheduled_at: string | null;
};

export type AnalyticsResumeRow = { id: string; name: string };

export class AnalyticsRepository {
  /**
   * No `archived` filter — analytics reflects true historical performance,
   * so tidying old applications off the Kanban board never silently shifts
   * a rate. `applied_at` is filtered on but not selected back — nothing
   * downstream needs the raw timestamp anymore.
   */
  async findApplicationsInRange(
    userId: string,
    after?: string,
    before?: string,
  ): Promise<AnalyticsApplicationRow[]> {
    let q = supabase.from("applications").select(APP_COLUMNS).eq("user_id", userId);
    if (after) q = q.gte("applied_at", after);
    if (before) q = q.lte("applied_at", before);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as AnalyticsApplicationRow[];
  }

  /**
   * Only the events needed to reconstruct "every status this application
   * ever reached" — see features/analytics/utils.ts#buildStatusHistory.
   * Scoped to the exact application ids already resolved by
   * findApplicationsInRange, so status changes on out-of-range applications
   * never leak in.
   */
  async findStatusEvents(
    userId: string,
    applicationIds: string[],
  ): Promise<AnalyticsActivityRow[]> {
    if (applicationIds.length === 0) return [];
    const { data, error } = await supabase
      .from("application_activity")
      .select(ACTIVITY_COLUMNS)
      .eq("user_id", userId)
      .in("application_id", applicationIds)
      .in("kind", ["application_created", "manual_application_created", "status_changed"]);
    if (error) throw error;
    return (data ?? []) as AnalyticsActivityRow[];
  }

  /**
   * Real interview events (Module 7A's `interviews` table) for the given
   * applications — the source of truth for "interview opportunities
   * earned", scheduled and completed both included. Filtering by
   * `application_id in (...)` naturally excludes standalone interviews
   * (application_id null) — those aren't attributable to any tracked
   * application, so they don't belong in an applications-based funnel.
   */
  async findInterviews(userId: string, applicationIds: string[]): Promise<AnalyticsInterviewRow[]> {
    if (applicationIds.length === 0) return [];
    const { data, error } = await supabase
      .from("interviews")
      .select(INTERVIEW_COLUMNS)
      .eq("user_id", userId)
      .in("application_id", applicationIds);
    if (error) throw error;
    return (data ?? []) as AnalyticsInterviewRow[];
  }

  async findResumeNames(userId: string): Promise<AnalyticsResumeRow[]> {
    const { data, error } = await supabase
      .from("resumes")
      .select(RESUME_COLUMNS)
      .eq("user_id", userId);
    if (error) throw error;
    return data ?? [];
  }
}
