import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { AuthCard } from "./login";
import { useAuth } from "@/context/AuthContext";
import { GuestRoute } from "@/components/auth/RouteGuards";

export const Route = createFileRoute("/signup")({
  head: () => ({
    meta: [
      { title: "Create account — NextOffer" },
      { name: "description", content: "Create your NextOffer account." },
    ],
  }),
  component: Signup,
});

function validatePassword(pw: string): string | null {
  if (pw.length < 8) return "Password must be at least 8 characters.";
  if (!/[A-Z]/.test(pw)) return "Password must contain at least one uppercase letter.";
  if (!/[a-z]/.test(pw)) return "Password must contain at least one lowercase letter.";
  if (!/[0-9]/.test(pw)) return "Password must contain at least one number.";
  return null;
}

function Signup() {
  const nav = useNavigate();
  const { signUp } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [confirmValue, setConfirmValue] = useState("");
  const [showSuccess, setShowSuccess] = useState(false);

  async function handleSignup(email: string, password: string, confirm?: string) {
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

    setLoading(true);
    const result = await signUp(email, password);
    setLoading(false);

    if (result.error) {
      setError(result.error);
      toast.error(result.error);
      return;
    }

    if (result.session) {
      toast.success("Account created! Welcome to NextOffer.");
      nav({ to: "/dashboard" });
    } else {
      setShowSuccess(true);
      toast.success("Check your email to verify your account.");
    }
  }

  return (
    <GuestRoute>
      <AuthCard
        title="Create your workspace"
        subtitle="Two minutes and you're ready to search."
        submitLabel="Create account"
        onSubmit={handleSignup}
        loading={loading}
        error={error}
        confirmPassword
        onConfirmPasswordChange={(v) => setConfirmValue(v)}
        passwordError={passwordError}
        showSuccess={showSuccess}
        successMessage="Check your email to verify your account."
        extra={
          <label className="block">
            <span className="text-xs uppercase tracking-widest text-muted-foreground">Full name</span>
            <input
              required
              className="mt-1.5 w-full rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2.5 text-sm outline-none focus:border-white/25"
              placeholder="Ada Lovelace"
            />
          </label>
        }
        alt={
          <p className="text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link to="/login" className="text-foreground underline underline-offset-4">
              Log in
            </Link>
          </p>
        }
      />
    </GuestRoute>
  );
}
