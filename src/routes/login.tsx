import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/site/PrimaryButton";
import { Logo } from "@/components/site/Logo";
import { useAuth } from "@/context/AuthContext";
import { GuestRoute } from "@/components/auth/RouteGuards";
import { pageSeo } from "@/content/site";

export const Route = createFileRoute("/login")({
  head: () => ({
    ...pageSeo({ path: "/login", title: "Log in — OfferLyst", description: "Sign in to OfferLyst." }),
  }),
  component: Login,
});

function Login() {
  const nav = useNavigate();
  const { signIn } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLogin(email: string, password: string) {
    setError(null);
    setLoading(true);
    const result = await signIn(email, password);
    setLoading(false);
    if (result.error) {
      setError(result.error);
      toast.error(result.error);
      return;
    }
    toast.success("Welcome back!");
    nav({ to: "/dashboard" });
  }

  return (
    <GuestRoute>
      <AuthCard
        title="Welcome back"
        subtitle="Log in to your OfferLyst workspace."
        submitLabel="Log in"
        onSubmit={handleLogin}
        loading={loading}
        error={error}
        showForgotPassword
        alt={
          <p className="text-sm text-muted-foreground">
            New here?{" "}
            <Link to="/signup" className="text-foreground underline underline-offset-4">
              Create account
            </Link>
          </p>
        }
      />
    </GuestRoute>
  );
}

export function AuthCard({
  title,
  subtitle,
  submitLabel,
  onSubmit,
  alt = null,
  extra,
  loading = false,
  error = null,
  showForgotPassword = false,
  confirmPassword = false,
  onConfirmPasswordChange,
  passwordError = null,
  showSuccess = false,
  successMessage = null,
  hideEmail = false,
}: {
  title: string;
  subtitle: string;
  submitLabel: string;
  onSubmit: (email: string, password: string, confirm?: string) => void;
  alt?: React.ReactNode;
  extra?: React.ReactNode;
  loading?: boolean;
  error?: string | null;
  showForgotPassword?: boolean;
  confirmPassword?: boolean;
  onConfirmPasswordChange?: (value: string) => void;
  passwordError?: string | null;
  showSuccess?: boolean;
  successMessage?: string | null;
  /** Omits the email field — for a form where the user is already authenticated (e.g. setting a new password from a reset link) and doesn't need to re-enter it. */
  hideEmail?: boolean;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  return (
    <section className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-6xl items-center px-6 py-32">
      <div className="mx-auto w-full max-w-md">
        <div className="mb-6 flex items-center justify-center gap-2">
          <Link to="/" aria-label="OfferLyst home">
            <Logo size={32} wordmarkClassName="text-lg" />
          </Link>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-8 backdrop-blur">
          <h1 className="font-display text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>

          {showSuccess ? (
            <div className="mt-6 rounded-xl border border-white/10 bg-white/[0.03] p-6 text-center">
              <p className="text-sm text-foreground">{successMessage}</p>
            </div>
          ) : (
            <>
              {error && (
                <p className="mb-3 rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 text-xs text-red-400">
                  {error}
                </p>
              )}

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (loading) return;
                  onSubmit(email, password, confirm);
                }}
                className="space-y-3"
              >
                {extra}
                {!hideEmail && (
                  <label className="block">
                    <span className="text-xs uppercase tracking-widest text-muted-foreground">
                      Email
                    </span>
                    <input
                      required
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      disabled={loading}
                      className="mt-1.5 w-full rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2.5 text-sm outline-none focus:border-white/25 disabled:opacity-50"
                      placeholder="you@work.com"
                    />
                  </label>
                )}
                <label className="block">
                  <span className="text-xs uppercase tracking-widest text-muted-foreground">
                    Password
                  </span>
                  <input
                    required
                    type="password"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (confirmPassword && onConfirmPasswordChange) {
                        onConfirmPasswordChange(confirm);
                      }
                    }}
                    disabled={loading}
                    className="mt-1.5 w-full rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2.5 text-sm outline-none focus:border-white/25 disabled:opacity-50"
                    placeholder="••••••••"
                  />
                </label>
                {confirmPassword && (
                  <label className="block">
                    <span className="text-xs uppercase tracking-widest text-muted-foreground">
                      Confirm Password
                    </span>
                    <input
                      required
                      type="password"
                      value={confirm}
                      onChange={(e) => {
                        setConfirm(e.target.value);
                        if (onConfirmPasswordChange) onConfirmPasswordChange(e.target.value);
                      }}
                      disabled={loading}
                      className="mt-1.5 w-full rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2.5 text-sm outline-none focus:border-white/25 disabled:opacity-50"
                      placeholder="••••••••"
                    />
                  </label>
                )}
                {passwordError && <p className="text-xs text-red-400">{passwordError}</p>}
                {showForgotPassword && (
                  <div className="text-right">
                    <Link
                      to="/forgot-password"
                      className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
                    >
                      Forgot password?
                    </Link>
                  </div>
                )}
                <Button type="submit" className="w-full" onClick={undefined}>
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-white/60" />
                      Please wait…
                    </span>
                  ) : (
                    submitLabel
                  )}
                </Button>
              </form>
            </>
          )}
          <div className="mt-6 text-center">{alt}</div>
        </div>
        <p className="mt-6 text-center text-xs text-muted-foreground">
          By continuing you agree to our{" "}
          <Link to="/terms" className="underline underline-offset-4 hover:text-foreground">
            terms
          </Link>{" "}
          and{" "}
          <Link to="/privacy" className="underline underline-offset-4 hover:text-foreground">
            privacy policy
          </Link>
          .
        </p>
      </div>
    </section>
  );
}
