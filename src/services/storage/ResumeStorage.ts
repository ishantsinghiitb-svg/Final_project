import { supabase } from "@/lib/supabase";
import { STORAGE_BUCKETS, FILE_LIMITS, ACCEPTED_RESUME_TYPES } from "@/constants";

export class ResumeStorage {
  async upload(userId: string, resumeId: string, file: File): Promise<string> {
    if (file.size > FILE_LIMITS.RESUME_MAX_BYTES) {
      throw new Error("Resume must be under 10 MB.");
    }
    if (!ACCEPTED_RESUME_TYPES.includes(file.type)) {
      throw new Error("Only PDF and DOCX files are allowed.");
    }

    const ext = file.name.split(".").pop() ?? "pdf";
    const path = `${userId}/${resumeId}.${ext}`;

    const { error } = await supabase.storage
      .from(STORAGE_BUCKETS.RESUMES)
      .upload(path, file, { upsert: true });

    if (error) throw error;

    const { data } = supabase.storage
      .from(STORAGE_BUCKETS.RESUMES)
      .getPublicUrl(path);

    return data.publicUrl;
  }

  async delete(userId: string, resumeId: string): Promise<void> {
    const { data: files } = await supabase.storage
      .from(STORAGE_BUCKETS.RESUMES)
      .list(userId);

    if (files) {
      const matches = files.filter((f) => f.name.startsWith(resumeId));
      if (matches.length > 0) {
        const paths = matches.map((f) => `${userId}/${f.name}`);
        await supabase.storage.from(STORAGE_BUCKETS.RESUMES).remove(paths);
      }
    }
  }
}
