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

  /**
   * All of a user's contacts with this email, across every application —
   * unlike findByApplication, not scoped to one application. Used by
   * Module 9A's ApplicationMatcher to match an inbound Gmail sender address
   * to existing applications via their recruiter/hiring-manager contact.
   * Case-insensitive exact match (no wildcards) — mirrors
   * CompanyRepository.findByName's `.ilike(col, value)` convention.
   */
  async findByEmail(userId: string, email: string): Promise<ApplicationContact[]> {
    const { data, error } = await supabase
      .from("application_contacts")
      .select(CONTACT_COLUMNS)
      .eq("user_id", userId)
      .ilike("email", email)
      .order("created_at", { ascending: false });
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
