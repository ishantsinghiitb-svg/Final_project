import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Logo } from "@/components/site/Logo";
import { useAuth } from "@/context/AuthContext";
import { AuthCard } from "./login";
import { pageSeo } from "@/content/site";

// ── Password reset completion (Module 13 · Phase 2 · B3) ──
//
// The missing half of "forgot password": clicking the emailed link makes
// Supabase establish a real signed-in session from the recovery token
// (detectSessionInUrl: true, see src/lib/supabase.ts) — this app never
// followed that with a call to `supabase.auth.updateUser({ password })`,
// so the account's actual password was never changed. `/login`'s
// `GuestRoute` used to be the redirect target, which just saw a signed-in
// user and bounced straight to /dashboard.
//
// This route is deliberately unwrapped by ProtectedRoute/GuestRoute — it
// needs to render its OWN third state ("no session at all", i.e. an
// invalid/expired link) that both of those would hide by redirecting away
// before this page ever gets a chance to explain why.

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    ...pageSeo({
      path: "/reset-password",
      title: "Set a new password — OfferLyst",
      description: "Set a new password for your OfferLyst account.",
    }),
  }),
  component: ResetPassword,
});

/** Mirrors signup.tsx's rule exactly — a new password should meet the same bar as one set at signup. */
function validatePassword(pw: string): string | null {
  if (pw.length < 8) return "Password must be at least 8 characters.";
  if (!/[A-Z]/.test(pw)) return "Password must contain at least one uppercase letter.";
  if (!/[a-z]/.test(pw)) return "Password must contain at least one lowercase letter.";
  if (!/[0-9]/.test(pw)) return "Password must contain at least one number.";
  return null;
}

function FullScreenLoader() {
  return (
    <div className="grid min-h-screen place-items-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/10 border-t-white/40" />
    </div>
  );
}

function ResetPassword() {
  const nav = useNavigate();
  const { user, loading, updatePassword } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  if (loading) return <FullScreenLoader />;

  // No session means detectSessionInUrl found no valid recovery token — the
  // link was already used, expired, or malformed. Fails safely: this says
  // nothing about whether the underlying email/account exists.
  if (!user) {
    return (
      <section className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-6xl items-center px-6 py-32">
        <div className="mx-auto w-full max-w-md text-center">
          <div className="mb-6 flex items-center justify-center gap-2">
            <Link to="/" aria-label="OfferLyst home">
              <Logo size={32} wordmarkClassName="text-lg" />
            </Link>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-8 backdrop-blur">
            <h1 className="font-display text-2xl font-semibold tracking-tight">
              This link is invalid or has expired
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Request a new password reset link to continue.
            </p>
            <Link
              to="/forgot-password"
              className="mt-6 inline-block rounded-xl bg-white px-4 py-2.5 text-sm font-medium text-black transition-opacity hover:opacity-90"
            >
              Request a new link
            </Link>
          </div>
        </div>
      </section>
    );
  }

  async function handleSubmit(_email: string, password: string, confirm?: string) {
    setError(null);
    setPasswordError(null);

    const pwErr = validatePassword(password);
    if (pwErr) {
      setPasswordError(pwErr);
      return;
    }
    if (confirm !== password) {
      setPasswordError("Passwords do not match.");
      return;
    }

    setSubmitting(true);
    const result = await updatePassword(password);
    setSubmitting(false);

    if (result.error) {
      setError(result.error);
      toast.error(result.error);
      return;
    }
    toast.success("Password updated.");
    nav({ to: "/dashboard" });
  }

  return (
    <AuthCard
      title="Set a new password"
      subtitle="Choose a new password for your account."
      submitLabel="Update password"
      onSubmit={handleSubmit}
      loading={submitting}
      error={error}
      confirmPassword
      passwordError={passwordError}
      hideEmail
    />
  );
}
