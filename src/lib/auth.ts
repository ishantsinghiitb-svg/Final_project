import { supabase } from "./supabase";
import type { User, Session } from "@supabase/supabase-js";

export type AuthResult =
  | { user: User; session: Session | null; error: null }
  | { user: null; session: null; error: string };

export async function signUp(email: string, password: string): Promise<AuthResult> {
  const { data, error } = await supabase.auth.signUp({ email, password });
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

export async function resetPassword(email: string): Promise<{ error: string | null }> {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/login`,
  });
  return { error: error?.message ?? null };
}

export async function getCurrentUser(): Promise<User | null> {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function getSession(): Promise<Session | null> {
  const { data: { session } } = await supabase.auth.getSession();
  return session;
}
