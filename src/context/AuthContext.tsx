import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import {
  getCurrentUser,
  getSession,
  ensureProfile,
  getProfile,
  signIn,
  signInWithGoogle,
  signOut,
  signUp,
  resetPassword,
  updateProfile,
  uploadAvatar,
  type Profile,
} from "@/lib/auth";

type AuthContextValue = {
  user: User | null;
  session: Session | null;
  loading: boolean;
  profile: Profile | null;
  profileLoading: boolean;
  refreshProfile: () => Promise<void>;
  updateProfileData: (
    updates: Partial<Pick<Profile, "full_name" | "location" | "target_role" | "avatar_url">>,
  ) => Promise<{ error: string | null }>;
  uploadProfileAvatar: (file: File) => Promise<{ url: string | null; error: string | null }>;
  signIn: typeof signIn;
  signInWithGoogle: typeof signInWithGoogle;
  signUp: typeof signUp;
  signOut: typeof signOut;
  resetPassword: typeof resetPassword;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);

  async function loadProfile(u: User) {
    setProfileLoading(true);
    const p = await ensureProfile(u);
    setProfile(p);
    setProfileLoading(false);
  }

  async function refreshProfile() {
    if (!user) return;
    const p = await getProfile(user.id);
    setProfile(p);
  }

  async function updateProfileData(
    updates: Partial<Pick<Profile, "full_name" | "location" | "target_role" | "avatar_url">>,
  ) {
    if (!user) return { error: "Not authenticated" };
    const { profile: updated, error } = await updateProfile(user.id, updates);
    if (updated) setProfile(updated);
    return { error };
  }

  async function uploadProfileAvatar(file: File) {
    if (!user) return { url: null, error: "Not authenticated" };
    const { url, error } = await uploadAvatar(user.id, file);
    if (url) {
      const { error: dbErr } = await updateProfileData({ avatar_url: url });
      if (dbErr) return { url, error: dbErr };
    }
    return { url, error };
  }

  useEffect(() => {
    let mounted = true;

    (async () => {
      const existingSession = await getSession();
      if (!mounted) return;
      setSession(existingSession);
      setUser(existingSession?.user ?? null);
      setLoading(false);
      if (existingSession?.user) {
        loadProfile(existingSession.user);
      }
    })();

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      (async () => {
        if (!mounted) return;
        setSession(newSession);
        setUser(newSession?.user ?? null);
        setLoading(false);
        if (newSession?.user) {
          loadProfile(newSession.user);
        } else {
          setProfile(null);
        }
      })();
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      session,
      loading,
      profile,
      profileLoading,
      refreshProfile,
      updateProfileData,
      uploadProfileAvatar,
      signIn,
      signInWithGoogle,
      signUp,
      signOut,
      resetPassword,
    }),
    [user, session, loading, profile, profileLoading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
