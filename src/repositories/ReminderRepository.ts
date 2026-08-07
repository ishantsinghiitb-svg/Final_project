import { supabase } from "@/lib/supabase";
import type { ApplicationReminder, ApplicationReminderType } from "@/types";

const REMINDER_COLUMNS =
  "id, application_id, interview_id, user_id, type, title, remind_at, note, completed, completed_at, source_suggestion_id, created_at, updated_at";

export class ReminderRepository {
  async findByApplication(applicationId: string): Promise<ApplicationReminder[]> {
    const { data, error } = await supabase
      .from("application_reminders")
      .select(REMINDER_COLUMNS)
      .eq("application_id", applicationId)
      .order("remind_at", { ascending: true });
    if (error) throw error;
    return (data ?? []) as unknown as ApplicationReminder[];
  }

  /** Module 9B — reminders on a standalone (non-application-linked) interview. */
  async findByInterview(interviewId: string): Promise<ApplicationReminder[]> {
    const { data, error } = await supabase
      .from("application_reminders")
      .select(REMINDER_COLUMNS)
      .eq("interview_id", interviewId)
      .order("remind_at", { ascending: true });
    if (error) throw error;
    return (data ?? []) as unknown as ApplicationReminder[];
  }

  /**
   * Interviews page's "next reminder" card indicator — one bulk query for
   * every visible card instead of one query per card. Matches a reminder to
   * an interview by `interview_id` when set (a standalone interview's own
   * reminder), falling back to `application_id` for an application-linked
   * interview — reminders don't carry a specific round on an application-
   * linked row (see GmailService's createInterviewReminders), so this is the
   * same soonest-upcoming-for-that-application approximation used elsewhere.
   */
  async findUpcomingForOwners(
    applicationIds: string[],
    interviewIds: string[],
  ): Promise<ApplicationReminder[]> {
    const filters: string[] = [];
    if (applicationIds.length > 0) filters.push(`application_id.in.(${applicationIds.join(",")})`);
    if (interviewIds.length > 0) filters.push(`interview_id.in.(${interviewIds.join(",")})`);
    if (filters.length === 0) return [];

    const { data, error } = await supabase
      .from("application_reminders")
      .select(REMINDER_COLUMNS)
      .eq("completed", false)
      .gte("remind_at", new Date().toISOString())
      .or(filters.join(","))
      .order("remind_at", { ascending: true });
    if (error) throw error;
    return (data ?? []) as unknown as ApplicationReminder[];
  }

  /** Dashboard's "Next reminder" — the single soonest upcoming, incomplete reminder across every application/interview this user has, regardless of which one it's attached to. */
  async findNextUpcomingByUser(userId: string): Promise<ApplicationReminder | null> {
    const { data, error } = await supabase
      .from("application_reminders")
      .select(REMINDER_COLUMNS)
      .eq("user_id", userId)
      .eq("completed", false)
      .gte("remind_at", new Date().toISOString())
      .order("remind_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data as unknown as ApplicationReminder | null;
  }

  async create(
    userId: string,
    input: {
      application_id?: string | null;
      interview_id?: string | null;
      type: ApplicationReminderType;
      title: string;
      remind_at: string;
      note?: string | null;
      /** Module 9A/9B — set when this reminder was created by accepting a suggestion (Gmail- or Calendar-derived). */
      source_suggestion_id?: string | null;
    },
  ): Promise<ApplicationReminder> {
    const { data, error } = await supabase
      .from("application_reminders")
      .insert({ ...input, user_id: userId })
      .select(REMINDER_COLUMNS)
      .single();
    if (error) throw error;
    return data as unknown as ApplicationReminder;
  }

  async setCompleted(id: string, completed: boolean): Promise<ApplicationReminder> {
    const { data, error } = await supabase
      .from("application_reminders")
      .update({ completed, completed_at: completed ? new Date().toISOString() : null })
      .eq("id", id)
      .select(REMINDER_COLUMNS)
      .single();
    if (error) throw error;
    return data as unknown as ApplicationReminder;
  }

  async delete(id: string): Promise<void> {
    const { error } = await supabase.from("application_reminders").delete().eq("id", id);
    if (error) throw error;
  }
}
