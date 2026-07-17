import { supabase } from "@/lib/supabase";
import type { CoverLetter } from "@/types";

const COVER_LETTER_COLUMNS = "id, user_id, name, version_number, file_url, created_at, updated_at";

export class CoverLetterRepository {
  async findAllByUser(userId: string): Promise<CoverLetter[]> {
    const { data, error } = await supabase
      .from("cover_letters")
      .select(COVER_LETTER_COLUMNS)
      .eq("user_id", userId)
      .order("updated_at", { ascending: false });
    if (error) throw error;
    return (data ?? []) as unknown as CoverLetter[];
  }

  async findById(id: string): Promise<CoverLetter | null> {
    const { data, error } = await supabase
      .from("cover_letters")
      .select(COVER_LETTER_COLUMNS)
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return data as CoverLetter | null;
  }

  async create(
    userId: string,
    input: { name: string; version_number?: number; file_url?: string | null },
  ): Promise<CoverLetter> {
    const { data, error } = await supabase
      .from("cover_letters")
      .insert({
        user_id: userId,
        name: input.name,
        version_number: input.version_number ?? 1,
        file_url: input.file_url ?? null,
      })
      .select(COVER_LETTER_COLUMNS)
      .single();
    if (error) throw error;
    return data as unknown as CoverLetter;
  }

  /** file_url stores the documents-bucket storage path, not a URL — see DocumentStorage.upload. */
  async updateFileUrl(id: string, path: string): Promise<CoverLetter> {
    const { data, error } = await supabase
      .from("cover_letters")
      .update({ file_url: path })
      .eq("id", id)
      .select(COVER_LETTER_COLUMNS)
      .single();
    if (error) throw error;
    return data as unknown as CoverLetter;
  }

  async delete(id: string): Promise<void> {
    const { error } = await supabase.from("cover_letters").delete().eq("id", id);
    if (error) throw error;
  }
}
