import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Profile, ProfileUpdate } from "@/types";
import { profileService } from "@/services/ProfileService";
import { useAuth } from "@/context/AuthContext";
import { getErrorMessage } from "@/utils";

type ProfileContextValue = {
  profile: Profile | null;
  loading: boolean;
  refresh: () => Promise<void>;
  update: (updates: ProfileUpdate) => Promise<{ error: string | null }>;
  uploadAvatar: (file: File) => Promise<{ url: string | null; error: string | null }>;
};

const ProfileContext = createContext<ProfileContextValue | undefined>(undefined);

export function ProfileProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user) {
      setProfile(null);
      return;
    }

    let cancelled = false;
    setLoading(true);

    (async () => {
      const p = await profileService.ensureProfile(user);
      if (!cancelled) {
        setProfile(p);
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user]);

  // ── Stable callbacks — each re-creates only when `user` changes ──────────

  const refresh = useCallback(async () => {
    if (!user) return;
    const p = await profileService.getProfile(user.id);
    setProfile(p);
  }, [user]);

  const update = useCallback(
    async (updates: ProfileUpdate): Promise<{ error: string | null }> => {
      if (!user) return { error: "Not authenticated" };
      try {
        const updated = await profileService.updateProfile(user.id, updates);
        if (updated) setProfile(updated);
        return { error: null };
      } catch (err) {
        return { error: getErrorMessage(err) };
      }
    },
    [user],
  );

  // `uploadAvatar` calls `update` — list it in deps to avoid a stale closure
  const uploadAvatar = useCallback(
    async (file: File): Promise<{ url: string | null; error: string | null }> => {
      if (!user) return { url: null, error: "Not authenticated" };
      try {
        const url = await profileService.uploadAvatar(user.id, file);
        const { error } = await update({ avatar_url: url });
        if (error) return { url, error };
        return { url, error: null };
      } catch (err) {
        return { url: null, error: getErrorMessage(err) };
      }
    },
    [user, update],
  );

  // ── Context value — re-computes only when deps actually change ─────────────

  const value = useMemo<ProfileContextValue>(
    () => ({ profile, loading, refresh, update, uploadAvatar }),
    [profile, loading, refresh, update, uploadAvatar],
  );

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
}

export function useProfile(): ProfileContextValue {
  const ctx = useContext(ProfileContext);
  if (!ctx) throw new Error("useProfile must be used within a ProfileProvider");
  return ctx;
}
