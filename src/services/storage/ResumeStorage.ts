import { supabase } from "@/lib/supabase";
import { STORAGE_BUCKETS, FILE_LIMITS, ACCEPTED_RESUME_TYPES } from "@/constants";

// Signed URL expiry for resume downloads (1 hour).
// Regenerate on every download rather than storing the URL.
const RESUME_SIGNED_URL_EXPIRY_SECONDS = 3_600;

export class ResumeStorage {
  /**
   * Uploads a resume file to the private resumes bucket.
   *
   * Returns the **storage path** (e.g. `<userId>/<resumeId>.pdf`).
   * Store this path in `resumes.file_url` — NOT a URL.
   * Call `getSignedUrl(path)` whenever you need a temporary download link.
   */
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

    // Return the path, not a URL.
    // The resumes bucket is private; generate download links with getSignedUrl().
    return path;
  }

  /**
   * Generates a temporary signed URL for downloading a resume.
   *
   * @param path       Storage path as returned by `upload()`.
   * @param expiresIn  Expiry in seconds (default: 1 hour).
   */
  async getSignedUrl(
    path: string,
    expiresIn = RESUME_SIGNED_URL_EXPIRY_SECONDS,
  ): Promise<string> {
    const { data, error } = await supabase.storage
      .from(STORAGE_BUCKETS.RESUMES)
      .createSignedUrl(path, expiresIn);

    if (error) throw error;
    return data.signedUrl;
  }

  async delete(userId: string, resumeId: string): Promise<void> {
    const { data: files } = await supabase.storage
      .from(STORAGE_BUCKETS.RESUMES)
      .list(userId);

    if (files && files.length > 0) {
      const matches = files.filter((f) => f.name.startsWith(resumeId));
      if (matches.length > 0) {
        const paths = matches.map((f) => `${userId}/${f.name}`);
        await supabase.storage.from(STORAGE_BUCKETS.RESUMES).remove(paths);
      }
    }
  }
}
