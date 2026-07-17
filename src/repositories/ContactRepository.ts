import { supabase } from "@/lib/supabase";
import type { ApplicationContact, ApplicationContactType } from "@/types";

const CONTACT_COLUMNS =
  "id, application_id, user_id, type, name, email, linkedin_url, notes, created_at, updated_at";

export class ContactRepository {
  async findByApplication(applicationId: string): Promise<ApplicationContact[]> {
    const { data, error } = await supabase
      .from("application_contacts")
      .select(CONTACT_COLUMNS)
      .eq("application_id", applicationId)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return (data ?? []) as unknown as ApplicationContact[];
  }

  async create(
    userId: string,
    input: {
      application_id: string;
      type: ApplicationContactType;
      name: string;
      email?: string | null;
      linkedin_url?: string | null;
      notes?: string | null;
    },
  ): Promise<ApplicationContact> {
    const { data, error } = await supabase
      .from("application_contacts")
      .insert({ ...input, user_id: userId })
      .select(CONTACT_COLUMNS)
      .single();
    if (error) throw error;
    return data as unknown as ApplicationContact;
  }

  async update(
    id: string,
    updates: Partial<
      Pick<ApplicationContact, "type" | "name" | "email" | "linkedin_url" | "notes">
    >,
  ): Promise<ApplicationContact> {
    const { data, error } = await supabase
      .from("application_contacts")
      .update(updates)
      .eq("id", id)
      .select(CONTACT_COLUMNS)
      .single();
    if (error) throw error;
    return data as unknown as ApplicationContact;
  }

  async delete(id: string): Promise<void> {
    const { error } = await supabase.from("application_contacts").delete().eq("id", id);
    if (error) throw error;
  }
}
