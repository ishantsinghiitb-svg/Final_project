import { supabase } from "@/lib/supabase";
import type { Profile, ProfileUpdate } from "@/types";
import type { ProfileInsert } from "@/types/database";

const TABLE = "profiles";
const COLUMNS =
  "id, full_name, email, location, target_role, avatar_url, created_at, updated_at";

export class ProfileRepository {
  async findById(id: string): Promise<Profile | null> {
    const { data, error } = await supabase
      .from(TABLE)
      .select(COLUMNS)
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return data as Profile | null;
  }

  async create(profile: ProfileInsert): Promise<Profile | null> {
    const { data, error } = await supabase
      .from(TABLE)
      .insert(profile)
      .select(COLUMNS)
      .maybeSingle();
    if (error) throw error;
    return data as Profile | null;
  }

  async update(id: string, updates: ProfileUpdate): Promise<Profile | null> {
    const { data, error } = await supabase
      .from(TABLE)
      .update(updates)
      .eq("id", id)
      .select(COLUMNS)
      .maybeSingle();
    if (error) throw error;
    return data as Profile | null;
  }

  async upsert(profile: ProfileInsert): Promise<Profile | null> {
    const { data, error } = await supabase
      .from(TABLE)
      .upsert(profile)
      .select(COLUMNS)
      .maybeSingle();
    if (error) throw error;
    return data as Profile | null;
  }
}
