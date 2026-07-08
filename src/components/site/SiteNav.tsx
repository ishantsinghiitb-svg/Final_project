import { useEffect, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { Menu, X, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

const links = [
  { to: "/", label: "Home" },
  { to: "/features", label: "Features" },
  { to: "/pricing", label: "Pricing" },
  { to: "/about", label: "About" },
  { to: "/faq", label: "FAQ" },
  { to: "/contact", label: "Contact" },
] as const;

export function SiteNav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <header className="pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center px-4 pt-4">
      <div
        className={cn(
          "pointer-events-auto flex w-full max-w-6xl items-center justify-between rounded-2xl border border-white/10 px-3 py-2 transition-all duration-300",
          scrolled
            ? "glass shadow-[0_10px_40px_-20px_rgba(0,0,0,0.6)]"
            : "border-transparent bg-transparent",
        )}
      >
        <Link to="/" className="group flex items-center gap-2 pl-2">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-[oklch(0.58_0.21_260)] to-[oklch(0.55_0.24_295)] shadow-[0_4px_20px_-4px_oklch(0.58_0.21_260/0.6)]">
            <Sparkles className="h-4 w-4 text-white" />
          </span>
          <span className="font-display text-[15px] font-semibold tracking-tight">
            NextOffer
          </span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {links.map((l) => {
            const active =
              l.to === "/" ? pathname === "/" : pathname.startsWith(l.to);
            return (
              <Link
                key={l.to}
                to={l.to}
                className={cn(
                  "relative rounded-lg px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground",
                  active && "text-foreground",
                )}
              >
                {active && (
                  <span className="absolute inset-0 -z-10 rounded-lg bg-white/5" />
                )}
                {l.label}
              </Link>
            );
          })}
        </nav>

        <div className="hidden items-center gap-2 pr-1 md:flex">
          <Link
            to="/login"
            className="rounded-lg px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            Log in
          </Link>
          <Link
            to="/signup"
            className="rounded-lg bg-gradient-to-br from-[oklch(0.62_0.21_260)] to-[oklch(0.55_0.24_290)] px-3.5 py-1.5 text-sm font-medium text-white shadow-[inset_0_1px_0_0_rgba(255,255,255,0.2),0_6px_20px_-8px_oklch(0.58_0.21_260/0.8)] transition-transform hover:-translate-y-px"
          >
            Get Started
          </Link>
        </div>

        <button
          aria-label="Toggle menu"
          onClick={() => setOpen((o) => !o)}
          className="grid h-9 w-9 place-items-center rounded-lg border border-white/10 md:hidden"
        >
          {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
        </button>
      </div>

      {open && (
        <div className="pointer-events-auto fixed inset-x-4 top-20 rounded-2xl border border-white/10 bg-[oklch(0.19_0.03_265)]/95 p-3 backdrop-blur-xl md:hidden">
          <nav className="flex flex-col">
            {links.map((l) => (
              <Link
                key={l.to}
                to={l.to}
                className="rounded-lg px-3 py-2.5 text-sm text-muted-foreground hover:bg-white/5 hover:text-foreground"
              >
                {l.label}
              </Link>
            ))}
            <div className="mt-2 flex gap-2 border-t border-white/10 pt-3">
              <Link
                to="/login"
                className="flex-1 rounded-lg border border-white/10 px-3 py-2 text-center text-sm"
              >
                Log in
              </Link>
              <Link
                to="/signup"
                className="flex-1 rounded-lg bg-gradient-to-br from-[oklch(0.62_0.21_260)] to-[oklch(0.55_0.24_290)] px-3 py-2 text-center text-sm font-medium text-white"
              >
                Get Started
              </Link>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}