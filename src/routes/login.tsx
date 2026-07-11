import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/site/PrimaryButton";
import { Logo } from "@/components/site/Logo";
import { useAuth } from "@/context/AuthContext";
import { GuestRoute } from "@/components/auth/RouteGuards";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Log in — NextOffer" },
      { name: "description", content: "Sign in to NextOffer." },
    ],
  }),
  component: Login,
});

function Login() {
  const nav = useNavigate();
  const { signIn, signInWithGoogle } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [googleLoading, setGoogleLoading] = useState(false);

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

  async function handleGoogle() {
    setGoogleLoading(true);
    const result = await signInWithGoogle();
    if (result.error) {
      setGoogleLoading(false);
      setError(result.error);
      toast.error(result.error);
    }
  }

  return (
    <GuestRoute>
      <AuthCard
        title="Welcome back"
        subtitle="Log in to your NextOffer workspace."
        submitLabel="Log in"
        onSubmit={handleLogin}
        onGoogle={handleGoogle}
        googleLoading={googleLoading}
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
  alt,
  extra,
  loading = false,
  error = null,
  showForgotPassword = false,
  confirmPassword = false,
  onConfirmPasswordChange,
  passwordError = null,
  showSuccess = false,
  successMessage = null,
  onGoogle,
  googleLoading = false,
}: {
  title: string;
  subtitle: string;
  submitLabel: string;
  onSubmit: (email: string, password: string, confirm?: string) => void;
  alt: React.ReactNode;
  extra?: React.ReactNode;
  loading?: boolean;
  error?: string | null;
  showForgotPassword?: boolean;
  confirmPassword?: boolean;
  onConfirmPasswordChange?: (value: string) => void;
  passwordError?: string | null;
  showSuccess?: boolean;
  successMessage?: string | null;
  onGoogle?: () => void;
  googleLoading?: boolean;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  return (
    <section className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-6xl items-center px-6 py-32">
      <div className="mx-auto w-full max-w-md">
        <div className="mb-6 flex items-center justify-center gap-2">
          <Link to="/" aria-label="NextOffer home">
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
              <div className="mt-6 grid gap-2">
                <button
                  type="button"
                  onClick={onGoogle}
                  disabled={googleLoading || !onGoogle}
                  className="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-sm transition-colors hover:border-white/20 hover:bg-white/[0.05] disabled:opacity-50"
                >
                  {googleLoading ? (
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-white/60" />
                  ) : (
                    <GoogleIcon />
                  )}
                  Continue with Google
                </button>
              </div>

              <div className="my-6 flex items-center gap-3 text-[10px] uppercase tracking-widest text-muted-foreground">
                <span className="h-px flex-1 bg-white/10" /> or with password{" "}
                <span className="h-px flex-1 bg-white/10" />
              </div>

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
                <label className="block">
                  <span className="text-xs uppercase tracking-widest text-muted-foreground">Email</span>
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
                <label className="block">
                  <span className="text-xs uppercase tracking-widest text-muted-foreground">Password</span>
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
                {passwordError && (
                  <p className="text-xs text-red-400">{passwordError}</p>
                )}
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
          By continuing you agree to our terms and privacy policy.
        </p>
      </div>
    </section>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4">
      <path
        fill="#EA4335"
        d="M12 10.2v3.9h5.5c-.24 1.3-1.62 3.8-5.5 3.8-3.3 0-6-2.7-6-6.1 0-3.3 2.7-6 6-6 1.9 0 3.1.8 3.8 1.4l2.6-2.5C16.9 3.4 14.7 2.4 12 2.4 6.6 2.4 2.3 6.6 2.3 12s4.3 9.6 9.7 9.6c5.6 0 9.3-3.9 9.3-9.4 0-.6-.1-1.1-.2-1.5H12z"
      />
    </svg>
  );
}
