import type { User } from "@supabase/supabase-js";
import type { Profile, ProfileUpdate } from "@/types";
import { ProfileRepository } from "@/repositories/ProfileRepository";
import { AvatarStorage } from "@/services/storage/AvatarStorage";

const repo = new ProfileRepository();
const avatarStorage = new AvatarStorage();

export class ProfileService {
  async getProfile(userId: string): Promise<Profile | null> {
    return repo.findById(userId);
  }

  async ensureProfile(user: User): Promise<Profile | null> {
    const existing = await repo.findById(user.id);
    if (existing) return existing;

    const fullName =
      (user.user_metadata?.full_name as string | undefined) ??
      (user.user_metadata?.name as string | undefined) ??
      null;
    const avatarUrl =
      (user.user_metadata?.avatar_url as string | undefined) ??
      (user.user_metadata?.picture as string | undefined) ??
      null;

    return repo.create({
      id: user.id,
      full_name: fullName,
      email: user.email ?? null,
      avatar_url: avatarUrl,
    });
  }

  async updateProfile(userId: string, updates: ProfileUpdate): Promise<Profile | null> {
    return repo.update(userId, updates);
  }

  async uploadAvatar(userId: string, file: File): Promise<string> {
    return avatarStorage.upload(userId, file);
  }
}

export const profileService = new ProfileService();
