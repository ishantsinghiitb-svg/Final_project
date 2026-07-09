import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/site/PrimaryButton";
import { Logo } from "@/components/site/Logo";

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
  return <AuthCard title="Welcome back" subtitle="Log in to your NextOffer workspace." submitLabel="Log in" onSubmit={() => nav({ to: "/dashboard" })} alt={<p className="text-sm text-muted-foreground">New here? <Link to="/signup" className="text-foreground underline underline-offset-4">Create account</Link></p>} />;
}

export function AuthCard({
  title,
  subtitle,
  submitLabel,
  onSubmit,
  alt,
  extra,
}: {
  title: string;
  subtitle: string;
  submitLabel: string;
  onSubmit: () => void;
  alt: React.ReactNode;
  extra?: React.ReactNode;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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

          <div className="mt-6 grid gap-2">
            <button className="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-sm transition-colors hover:border-white/20 hover:bg-white/[0.05]">
              <GoogleIcon /> Continue with Google
            </button>
            <button className="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-sm transition-colors hover:border-white/20 hover:bg-white/[0.05]">
              <span className="text-lg leading-none">•</span> Continue with Email
            </button>
          </div>

          <div className="my-6 flex items-center gap-3 text-[10px] uppercase tracking-widest text-muted-foreground">
            <span className="h-px flex-1 bg-white/10" /> or with password <span className="h-px flex-1 bg-white/10" />
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              onSubmit();
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
                className="mt-1.5 w-full rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2.5 text-sm outline-none focus:border-white/25"
                placeholder="you@work.com"
              />
            </label>
            <label className="block">
              <span className="text-xs uppercase tracking-widest text-muted-foreground">Password</span>
              <input
                required
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2.5 text-sm outline-none focus:border-white/25"
                placeholder="••••••••"
              />
            </label>
            <Button type="submit" className="w-full">
              {submitLabel}
            </Button>
          </form>
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
      <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.24 1.3-1.62 3.8-5.5 3.8-3.3 0-6-2.7-6-6.1 0-3.3 2.7-6 6-6 1.9 0 3.1.8 3.8 1.4l2.6-2.5C16.9 3.4 14.7 2.4 12 2.4 6.6 2.4 2.3 6.6 2.3 12s4.3 9.6 9.7 9.6c5.6 0 9.3-3.9 9.3-9.4 0-.6-.1-1.1-.2-1.5H12z" />
    </svg>
  );
}