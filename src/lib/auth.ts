import { supabase } from "./supabase";
import type { User, Session } from "@supabase/supabase-js";

export type AuthResult =
  | { user: User; session: Session | null; error: null }
  | { user: null; session: null; error: string };

export async function signUp(email: string, password: string, fullName?: string): Promise<AuthResult> {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: fullName ? { data: { full_name: fullName } } : undefined,
  });
  if (error) return { user: null, session: null, error: error.message };
  if (!data.user) return { user: null, session: null, error: "Sign-up failed. Please try again." };
  return { user: data.user, session: data.session, error: null };
}

export async function signIn(email: string, password: string): Promise<AuthResult> {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { user: null, session: null, error: error.message };
  if (!data.user) return { user: null, session: null, error: "Sign-in failed. Please try again." };
  return { user: data.user, session: data.session, error: null };
}

export async function signOut(): Promise<{ error: string | null }> {
  const { error } = await supabase.auth.signOut();
  return { error: error?.message ?? null };
}

export async function signInWithGoogle(): Promise<{ error: string | null }> {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${window.location.origin}/dashboard`,
    },
  });
  return { error: error?.message ?? null };
}

export async function resetPassword(email: string): Promise<{ error: string | null }> {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/login`,
  });
  return { error: error?.message ?? null };
}

export type Profile = {
  id: string;
  full_name: string | null;
  email: string | null;
  location: string | null;
  target_role: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
};

export async function getCurrentUser(): Promise<User | null> {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function getSession(): Promise<Session | null> {
  const { data: { session } } = await supabase.auth.getSession();
  return session;
}

export async function getProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, email, location, target_role, avatar_url, created_at, updated_at")
    .eq("id", userId)
    .maybeSingle();
  if (error) return null;
  return data as Profile | null;
}

export async function ensureProfile(user: User): Promise<Profile | null> {
  const existing = await getProfile(user.id);
  if (existing) return existing;

  const fullName =
    (user.user_metadata?.full_name as string | undefined) ??
    (user.user_metadata?.name as string | undefined) ??
    null;
  const avatarUrl =
    (user.user_metadata?.avatar_url as string | undefined) ??
    (user.user_metadata?.picture as string | undefined) ??
    null;

  const { data, error } = await supabase
    .from("profiles")
    .insert({
      id: user.id,
      full_name: fullName,
      email: user.email ?? null,
      avatar_url: avatarUrl,
    })
    .select("id, full_name, email, location, target_role, avatar_url, created_at, updated_at")
    .maybeSingle();

  if (error) return null;
  return data as Profile | null;
}

export async function updateProfile(
  userId: string,
  updates: Partial<Pick<Profile, "full_name" | "location" | "target_role" | "avatar_url">>,
): Promise<{ profile: Profile | null; error: string | null }> {
  const { data, error } = await supabase
    .from("profiles")
    .update(updates)
    .eq("id", userId)
    .select("id, full_name, email, location, target_role, avatar_url, created_at, updated_at")
    .maybeSingle();

  if (error) return { profile: null, error: error.message };
  return { profile: data as Profile | null, error: null };
}

export async function uploadAvatar(
  userId: string,
  file: File,
): Promise<{ url: string | null; error: string | null }> {
  const ext = file.name.split(".").pop() ?? "png";
  const path = `${userId}/avatar.${ext}`;

  const { error: upErr } = await supabase.storage
    .from("avatars")
    .upload(path, file, { upsert: true });

  if (upErr) return { url: null, error: upErr.message };

  const { data } = supabase.storage.from("avatars").getPublicUrl(path);
  return { url: data.publicUrl, error: null };
}
