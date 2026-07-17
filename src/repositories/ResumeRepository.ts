import { supabase } from "@/lib/supabase";
import type { Resume, ResumeVersion } from "@/types";

const RESUME_COLUMNS =
  "id, user_id, name, tailored_for, file_url, score, keywords_count, times_used, created_at, updated_at";

const RESUME_VERSION_COLUMNS = "id, resume_id, version_number, content, created_at";

/**
 * ResumeRepository
 *
 * First real (non-mock) data access for the `resumes` / `resume_versions`
 * tables — the standalone Resumes page (dashboard.resumes.tsx) still renders
 * mock data and is untouched; this repository exists to power the Resume
 * Association picker on the Application Detail page.
 */
export class ResumeRepository {
  async findAllByUser(userId: string): Promise<Resume[]> {
    const { data, error } = await supabase
      .from("resumes")
      .select(RESUME_COLUMNS)
      .eq("user_id", userId)
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
    return data as Resume | null;
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

  async create(userId: string, input: { name: string; file_url?: string | null }): Promise<Resume> {
    const { data, error } = await supabase
      .from("resumes")
      .insert({ user_id: userId, name: input.name, file_url: input.file_url ?? null })
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
}
