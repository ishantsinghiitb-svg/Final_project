import { supabase } from "@/lib/supabase";
import type { ApplicationReminder, ApplicationReminderType } from "@/types";

const REMINDER_COLUMNS =
  "id, application_id, user_id, type, title, remind_at, note, completed, completed_at, created_at, updated_at";

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

  async create(
    userId: string,
    input: {
      application_id: string;
      type: ApplicationReminderType;
      title: string;
      remind_at: string;
      note?: string | null;
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
