import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AuthCard } from "./login";

export const Route = createFileRoute("/signup")({
  head: () => ({
    meta: [
      { title: "Create account — NextOffer" },
      { name: "description", content: "Create your NextOffer account." },
    ],
  }),
  component: Signup,
});

function Signup() {
  const nav = useNavigate();
  return (
    <AuthCard
      title="Create your workspace"
      subtitle="Two minutes and you're ready to search."
      submitLabel="Create account"
      onSubmit={() => nav({ to: "/dashboard" })}
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
  );
}