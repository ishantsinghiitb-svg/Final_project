import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/site/PrimaryButton";
import { Logo } from "@/components/site/Logo";
import { useAuth } from "@/context/AuthContext";

export const Route = createFileRoute("/forgot-password")({
  head: () => ({
    meta: [
      { title: "Reset password — NextOffer" },
      { name: "description", content: "Reset your NextOffer password." },
    ],
  }),
  component: ForgotPassword,
});

function ForgotPassword() {
  const { resetPassword } = useAuth();
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const formData = new FormData(e.currentTarget);
    const email = formData.get("email") as string;
    const result = await resetPassword(email);
    setLoading(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    setSent(true);
    toast.success("Reset link sent.");
  }

  return (
    <section className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-6xl items-center px-6 py-32">
      <div className="mx-auto w-full max-w-md">
        <div className="mb-6 flex items-center justify-center gap-2">
          <Link to="/" aria-label="NextOffer home">
            <Logo size={32} wordmarkClassName="text-lg" />
          </Link>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-8 backdrop-blur">
          <h1 className="font-display text-2xl font-semibold tracking-tight">Reset password</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Enter your email and we'll send you a reset link.
          </p>

          {sent ? (
            <div className="mt-6 rounded-xl border border-white/10 bg-white/[0.03] p-6 text-center">
              <p className="text-sm text-foreground">
                We've sent a password reset link if an account exists for this email.
              </p>
              <Link
                to="/login"
                className="mt-4 inline-block text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
              >
                Back to log in
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="mt-6 space-y-3">
              <label className="block">
                <span className="text-xs uppercase tracking-widest text-muted-foreground">Email</span>
                <input
                  required
                  type="email"
                  name="email"
                  disabled={loading}
                  className="mt-1.5 w-full rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2.5 text-sm outline-none focus:border-white/25 disabled:opacity-50"
                  placeholder="you@work.com"
                />
              </label>
              <Button type="submit" className="w-full" onClick={undefined}>
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-white/60" />
                    Please wait…
                  </span>
                ) : (
                  "Send reset link"
                )}
              </Button>
            </form>
          )}

          <div className="mt-6 text-center">
            <p className="text-sm text-muted-foreground">
              Remembered it?{" "}
              <Link to="/login" className="text-foreground underline underline-offset-4">
                Back to log in
              </Link>
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
