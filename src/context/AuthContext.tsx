import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { getCurrentUser, getSession, signIn, signInWithGoogle, signOut, signUp, resetPassword } from "@/lib/auth";

type AuthContextValue = {
  user: User | null;
  session: Session | null;
  loading: boolean;
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

  useEffect(() => {
    let mounted = true;

    (async () => {
      const existingSession = await getSession();
      if (!mounted) return;
      setSession(existingSession);
      setUser(existingSession?.user ?? null);
      setLoading(false);
    })();

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      (async () => {
        if (!mounted) return;
        setSession(newSession);
        setUser(newSession?.user ?? null);
        setLoading(false);
      })();
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, session, loading, signIn, signInWithGoogle, signUp, signOut, resetPassword }),
    [user, session, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
