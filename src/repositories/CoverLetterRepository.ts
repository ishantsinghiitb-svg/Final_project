import { supabase } from "@/lib/supabase";
import type { CoverLetter, CoverLetterVersion } from "@/types";

// ── Cover Letter data access ──
//
// Module 3B shipped the upload-only shape (name + version_number + file_url).
// Module 6E promoted the same table into the Cover Letter Studio DOCUMENT and
// added `cover_letter_versions` for append-only history. The original methods
// (findAllByUser / findById / create / updateFileUrl / delete) are unchanged —
// only the selected column list grew, so uploaded letters keep working exactly
// as before.

const COVER_LETTER_COLUMNS =
  "id, user_id, name, version_number, file_url, created_at, updated_at, " +
  "source, content, job_id, resume_id, company_name, role_title, tone, length, " +
  "custom_instructions, status, current_version_id, word_count, last_edited_at, downloaded_at, " +
  "ai_session_id, ai_session_started_at";

const VERSION_COLUMNS =
  "id, cover_letter_id, user_id, version_number, content, label, source, ai_action, " +
  "tone, length, custom_instructions, analysis_id, model, prompt_version, analysis_version, " +
  "word_count, created_at";

/** Fields the Studio may patch on a document. */
export type CoverLetterUpdateInput = Partial<{
  name: string;
  content: string;
  tone: string;
  length: string;
  custom_instructions: string | null;
  status: string;
  current_version_id: string | null;
  word_count: number;
  last_edited_at: string | null;
  downloaded_at: string | null;
}>;

export type StudioCoverLetterCreateInput = {
  name: string;
  content: string;
  job_id: string | null;
  resume_id: string | null;
  company_name: string | null;
  role_title: string | null;
  tone: string;
  length: string;
  custom_instructions: string | null;
  word_count: number;
  /** The editing session opened by the generation that produced this document. */
  ai_session_id: string;
};

export type CoverLetterVersionCreateInput = {
  content: string;
  label?: string | null;
  source: string;
  ai_action?: string | null;
  tone?: string | null;
  length?: string | null;
  custom_instructions?: string | null;
  analysis_id?: string | null;
  model?: string | null;
  prompt_version?: string | null;
  analysis_version?: string | null;
  word_count?: number | null;
};

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
    return data as unknown as CoverLetter | null;
  }

  /** Studio letters written for a specific job (the job-detail entry point). */
  async findByJob(userId: string, jobId: string): Promise<CoverLetter[]> {
    const { data, error } = await supabase
      .from("cover_letters")
      .select(COVER_LETTER_COLUMNS)
      .eq("user_id", userId)
      .eq("job_id", jobId)
      .order("updated_at", { ascending: false });
    if (error) throw error;
    return (data ?? []) as unknown as CoverLetter[];
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

  /** Creates a Studio document (Module 6E) — always source = 'studio', status = 'draft'. */
  async createStudioDocument(
    userId: string,
    input: StudioCoverLetterCreateInput,
  ): Promise<CoverLetter> {
    const { data, error } = await supabase
      .from("cover_letters")
      .insert({
        user_id: userId,
        name: input.name,
        version_number: 1,
        source: "studio",
        status: "draft",
        content: input.content,
        job_id: input.job_id,
        resume_id: input.resume_id,
        company_name: input.company_name,
        role_title: input.role_title,
        tone: input.tone,
        length: input.length,
        custom_instructions: input.custom_instructions,
        word_count: input.word_count,
        last_edited_at: new Date().toISOString(),
        ai_session_id: input.ai_session_id,
        ai_session_started_at: new Date().toISOString(),
      })
      .select(COVER_LETTER_COLUMNS)
      .single();
    if (error) throw error;
    return data as unknown as CoverLetter;
  }

  async update(id: string, patch: CoverLetterUpdateInput): Promise<CoverLetter> {
    const { data, error } = await supabase
      .from("cover_letters")
      .update(patch)
      .eq("id", id)
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

  // ── Versions (Module 6E) ────────────────────────────────────────────────

  /** A document's versions, newest first — the version switcher's data source. */
  async findVersions(coverLetterId: string): Promise<CoverLetterVersion[]> {
    const { data, error } = await supabase
      .from("cover_letter_versions")
      .select(VERSION_COLUMNS)
      .eq("cover_letter_id", coverLetterId)
      .order("version_number", { ascending: false });
    if (error) throw error;
    return (data ?? []) as unknown as CoverLetterVersion[];
  }

  /**
   * Appends a version. Never overwrites the document or an earlier version —
   * the next version_number is computed from the current maximum, and the
   * (cover_letter_id, version_number) unique index is the backstop if two
   * saves ever race.
   */
  async createVersion(
    coverLetterId: string,
    userId: string,
    input: CoverLetterVersionCreateInput,
  ): Promise<CoverLetterVersion> {
    const { data: latest, error: latestError } = await supabase
      .from("cover_letter_versions")
      .select("version_number")
      .eq("cover_letter_id", coverLetterId)
      .order("version_number", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latestError) throw latestError;

    const nextNumber = (latest?.version_number ?? 0) + 1;

    const { data, error } = await supabase
      .from("cover_letter_versions")
      .insert({
        cover_letter_id: coverLetterId,
        user_id: userId,
        version_number: nextNumber,
        content: input.content,
        label: input.label ?? null,
        source: input.source,
        ai_action: input.ai_action ?? null,
        tone: input.tone ?? null,
        length: input.length ?? null,
        custom_instructions: input.custom_instructions ?? null,
        analysis_id: input.analysis_id ?? null,
        model: input.model ?? null,
        prompt_version: input.prompt_version ?? null,
        analysis_version: input.analysis_version ?? null,
        word_count: input.word_count ?? null,
      })
      .select(VERSION_COLUMNS)
      .single();
    if (error) throw error;
    return data as unknown as CoverLetterVersion;
  }

  /** Renaming a version is the only mutation allowed on history. */
  async renameVersion(versionId: string, label: string | null): Promise<CoverLetterVersion> {
    const { data, error } = await supabase
      .from("cover_letter_versions")
      .update({ label })
      .eq("id", versionId)
      .select(VERSION_COLUMNS)
      .single();
    if (error) throw error;
    return data as unknown as CoverLetterVersion;
  }
}
