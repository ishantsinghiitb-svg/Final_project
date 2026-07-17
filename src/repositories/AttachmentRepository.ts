import { supabase } from "@/lib/supabase";
import type { ApplicationAttachment, ApplicationAttachmentKind } from "@/types";

const ATTACHMENT_COLUMNS =
  "id, application_id, user_id, kind, name, file_path, size_bytes, mime_type, reminder_id, created_at";

export class AttachmentRepository {
  /** General application attachments only — excludes reminder-scoped ones, see findByReminder. */
  async findByApplication(applicationId: string): Promise<ApplicationAttachment[]> {
    const { data, error } = await supabase
      .from("application_attachments")
      .select(ATTACHMENT_COLUMNS)
      .eq("application_id", applicationId)
      .is("reminder_id", null)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []) as unknown as ApplicationAttachment[];
  }

  async findByReminder(reminderId: string): Promise<ApplicationAttachment[]> {
    const { data, error } = await supabase
      .from("application_attachments")
      .select(ATTACHMENT_COLUMNS)
      .eq("reminder_id", reminderId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []) as unknown as ApplicationAttachment[];
  }

  async create(
    userId: string,
    input: {
      id: string;
      application_id: string;
      kind: ApplicationAttachmentKind;
      name: string;
      file_path: string;
      size_bytes?: number | null;
      mime_type?: string | null;
      reminder_id?: string | null;
    },
  ): Promise<ApplicationAttachment> {
    const { data, error } = await supabase
      .from("application_attachments")
      .insert({ ...input, user_id: userId })
      .select(ATTACHMENT_COLUMNS)
      .single();
    if (error) throw error;
    return data as unknown as ApplicationAttachment;
  }

  async delete(id: string): Promise<void> {
    const { error } = await supabase.from("application_attachments").delete().eq("id", id);
    if (error) throw error;
  }
}
