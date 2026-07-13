import { supabase } from "@/lib/supabase";
import { STORAGE_BUCKETS, FILE_LIMITS, ACCEPTED_IMAGE_TYPES } from "@/constants";

export class AvatarStorage {
  async upload(userId: string, file: File): Promise<string> {
    if (file.size > FILE_LIMITS.AVATAR_MAX_BYTES) {
      throw new Error("Image must be under 5 MB.");
    }
    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      throw new Error("Only PNG, JPEG, and WebP images are allowed.");
    }

    const ext = file.name.split(".").pop() ?? "png";
    const path = `${userId}/avatar.${ext}`;

    const { error } = await supabase.storage
      .from(STORAGE_BUCKETS.AVATARS)
      .upload(path, file, { upsert: true });

    if (error) throw error;

    const { data } = supabase.storage
      .from(STORAGE_BUCKETS.AVATARS)
      .getPublicUrl(path);

    return data.publicUrl;
  }

  async delete(userId: string): Promise<void> {
    const { data: files } = await supabase.storage
      .from(STORAGE_BUCKETS.AVATARS)
      .list(userId);

    if (files && files.length > 0) {
      const paths = files.map((f) => `${userId}/${f.name}`);
      await supabase.storage.from(STORAGE_BUCKETS.AVATARS).remove(paths);
    }
  }
}
