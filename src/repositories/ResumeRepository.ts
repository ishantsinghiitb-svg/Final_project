import { supabase } from "@/lib/supabase";
import type { Resume, ResumeVersion } from "@/types";

// Includes Module 6A additive columns (metadata, file hash, parse status).
const RESUME_COLUMNS =
  "id, user_id, name, tailored_for, file_url, score, keywords_count, times_used, created_at, updated_at, " +
  "is_default, file_name, file_hash, file_size_bytes, mime_type, page_count, parse_status, parse_error, parsed_at";

const RESUME_VERSION_COLUMNS = "id, resume_id, version_number, content, created_at";

export type ResumeCreateInput = {
  name: string;
  file_url?: string | null;
  file_name?: string | null;
  file_hash?: string | null;
  file_size_bytes?: number | null;
  mime_type?: string | null;
  is_default?: boolean;
  parse_status?: string;
};

/**
 * ResumeRepository
 *
 * Data access for the `resumes` / `resume_versions` tables. Extended in Module
 * 6A with resume-management metadata, file hashing, default handling, and
 * deletes — all additive. The Module 3B resume-association picker (findAllByUser
 * / findById / findVersions) is unchanged.
 */
export class ResumeRepository {
  async findAllByUser(userId: string): Promise<Resume[]> {
    const { data, error } = await supabase
      .from("resumes")
      .select(RESUME_COLUMNS)
      .eq("user_id", userId)
      .order("is_default", { ascending: false })
      .order("updated_at", { ascending: false });
    if (error) throw error;
    return (data ?? []) as unknown as Resume[];
  }

  async findById(id: string): Promise<Resume | null> {
    const { data, error } = await supabase
      .from("resumes")
      .select(RESUME_COLUMNS)
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return data as unknown as Resume | null;
  }

  async countByUser(userId: string): Promise<number> {
    const { count, error } = await supabase
      .from("resumes")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId);
    if (error) throw error;
    return count ?? 0;
  }

  /** Finds an existing resume for this user with an identical file hash (duplicate-upload detection). */
  async findByUserAndHash(userId: string, fileHash: string): Promise<Resume | null> {
    const { data, error } = await supabase
      .from("resumes")
      .select(RESUME_COLUMNS)
      .eq("user_id", userId)
      .eq("file_hash", fileHash)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data as unknown as Resume | null;
  }

  /** Returns all versions for a resume, newest first. */
  async findVersions(resumeId: string): Promise<ResumeVersion[]> {
    const { data, error } = await supabase
      .from("resume_versions")
      .select(RESUME_VERSION_COLUMNS)
      .eq("resume_id", resumeId)
      .order("version_number", { ascending: false });
    if (error) throw error;
    return (data ?? []) as unknown as ResumeVersion[];
  }

  async create(userId: string, input: ResumeCreateInput): Promise<Resume> {
    const { data, error } = await supabase
      .from("resumes")
      .insert({
        user_id: userId,
        name: input.name,
        file_url: input.file_url ?? null,
        file_name: input.file_name ?? null,
        file_hash: input.file_hash ?? null,
        file_size_bytes: input.file_size_bytes ?? null,
        mime_type: input.mime_type ?? null,
        is_default: input.is_default ?? false,
        parse_status: input.parse_status ?? "pending",
      })
      .select(RESUME_COLUMNS)
      .single();
    if (error) throw error;
    return data as unknown as Resume;
  }

  /** file_url stores the resumes-bucket storage path, not a URL — see ResumeStorage.upload. */
  async updateFileUrl(id: string, path: string): Promise<Resume> {
    const { data, error } = await supabase
      .from("resumes")
      .update({ file_url: path })
      .eq("id", id)
      .select(RESUME_COLUMNS)
      .single();
    if (error) throw error;
    return data as unknown as Resume;
  }

  async rename(id: string, name: string): Promise<Resume> {
    const { data, error } = await supabase
      .from("resumes")
      .update({ name })
      .eq("id", id)
      .select(RESUME_COLUMNS)
      .single();
    if (error) throw error;
    return data as unknown as Resume;
  }

  /** Atomically move the default flag to one resume (see set_default_resume RPC). */
  async setDefault(resumeId: string): Promise<void> {
    const { error } = await supabase.rpc("set_default_resume", { p_resume_id: resumeId });
    if (error) throw error;
  }

  async delete(id: string): Promise<void> {
    const { error } = await supabase.from("resumes").delete().eq("id", id);
    if (error) throw error;
  }
}
