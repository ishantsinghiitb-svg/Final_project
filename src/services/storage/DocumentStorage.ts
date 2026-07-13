import { supabase } from "@/lib/supabase";
import { STORAGE_BUCKETS, FILE_LIMITS } from "@/constants";

export class DocumentStorage {
  async upload(userId: string, docId: string, file: File): Promise<string> {
    if (file.size > FILE_LIMITS.DOCUMENT_MAX_BYTES) {
      throw new Error("Document must be under 20 MB.");
    }

    const ext = file.name.split(".").pop() ?? "txt";
    const path = `${userId}/${docId}.${ext}`;

    const { error } = await supabase.storage
      .from(STORAGE_BUCKETS.DOCUMENTS)
      .upload(path, file, { upsert: true });

    if (error) throw error;

    const { data } = supabase.storage
      .from(STORAGE_BUCKETS.DOCUMENTS)
      .getPublicUrl(path);

    return data.publicUrl;
  }

  async delete(userId: string, docId: string): Promise<void> {
    const { data: files } = await supabase.storage
      .from(STORAGE_BUCKETS.DOCUMENTS)
      .list(userId);

    if (files) {
      const matches = files.filter((f) => f.name.startsWith(docId));
      if (matches.length > 0) {
        const paths = matches.map((f) => `${userId}/${f.name}`);
        await supabase.storage.from(STORAGE_BUCKETS.DOCUMENTS).remove(paths);
      }
    }
  }
}
