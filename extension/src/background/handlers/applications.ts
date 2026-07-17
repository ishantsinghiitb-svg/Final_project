import type { AuthUser, TrackApplicationResult } from "../../shared/messaging/types";
import { getSupabaseClient } from "../../shared/supabase/client";
import {
  createApplicationFromJob,
  findApplicationByJob,
  type GlobalJobRecord,
} from "../../shared/supabase/jobs-api";

/**
 * Reuses the Module 2A duplicate-prevention rule: look up an existing
 * application for this (user, job) pair before creating one. If found,
 * report it back instead of inserting a second row.
 */
export async function trackApplication(
  globalJobId: string,
  user: AuthUser,
): Promise<TrackApplicationResult> {
  const existing = await findApplicationByJob(user.id, globalJobId);
  if (existing) {
    return { application: existing, alreadyTracked: true };
  }

  const { data, error } = await getSupabaseClient()
    .from("global_jobs")
    .select(
      "id, company_name, role, location, salary_min, salary_max, salary_currency, source, url, is_closed",
    )
    .eq("id", globalJobId)
    .single();
  if (error) throw error;

  const application = await createApplicationFromJob(user.id, data as unknown as GlobalJobRecord);
  return { application, alreadyTracked: false };
}
