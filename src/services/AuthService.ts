import { supabase } from "@/lib/supabase";
import type { User, Session } from "@supabase/supabase-js";

export type AuthResult =
  | { user: User; session: Session | null; error: null }
  | { user: null; session: null; error: string };

export class AuthService {
  async signUp(email: string, password: string, fullName?: string): Promise<AuthResult> {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: fullName ? { data: { full_name: fullName } } : undefined,
    });
    if (error) return { user: null, session: null, error: error.message };
    if (!data.user) return { user: null, session: null, error: "Sign-up failed. Please try again." };
    return { user: data.user, session: data.session, error: null };
  }

  async signIn(email: string, password: string): Promise<AuthResult> {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { user: null, session: null, error: error.message };
    if (!data.user) return { user: null, session: null, error: "Sign-in failed. Please try again." };
    return { user: data.user, session: data.session, error: null };
  }

  async signOut(): Promise<{ error: string | null }> {
    const { error } = await supabase.auth.signOut();
    return { error: error?.message ?? null };
  }

  async signInWithGoogle(): Promise<{ error: string | null }> {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/dashboard` },
    });
    return { error: error?.message ?? null };
  }

  async resetPassword(email: string): Promise<{ error: string | null }> {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/login`,
    });
    return { error: error?.message ?? null };
  }

  async getCurrentUser(): Promise<User | null> {
    const { data: { user } } = await supabase.auth.getUser();
    return user;
  }

  async getSession(): Promise<Session | null> {
    const { data: { session } } = await supabase.auth.getSession();
    return session;
  }
}

export const authService = new AuthService();
