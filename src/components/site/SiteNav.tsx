import { useEffect, useRef, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/site/Logo";

const links = [
  { to: "/", label: "Home" },
  { to: "/features", label: "Features" },
  { to: "/extension", label: "Extension" },
  { to: "/about", label: "About" },
  { to: "/faq", label: "FAQ" },
  { to: "/contact", label: "Contact" },
] as const;

export function SiteNav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const drawerRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  // Escape closes the drawer, and the page behind it can't scroll while it is
  // open. Focus moves to the close button so a keyboard user starts inside the
  // drawer rather than back at the top of the document.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

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
    <header className="pointer-events-none fixed inset-x-0 top-0 z-50 pt-3 md:pt-4">
      <div className="site-container">
        <div
          className={cn(
            "pointer-events-auto flex w-full items-center justify-between gap-3 rounded-2xl border border-white/10 px-3 py-2 transition-all duration-300",
            scrolled
              ? "glass shadow-[0_10px_40px_-20px_rgba(0,0,0,0.6)]"
              : "border-transparent bg-transparent",
          )}
        >
          <Link
            to="/"
            className="group flex shrink-0 items-center gap-2 rounded-lg pl-1"
            aria-label="OfferLyst home"
          >
            <Logo size={36} />
          </Link>

          <nav className="hidden items-center gap-1 lg:flex">
            {links.map((l) => {
              const active = l.to === "/" ? pathname === "/" : pathname.startsWith(l.to);
              return (
                <Link
                  key={l.to}
                  to={l.to}
                  className={cn(
                    "relative rounded-lg px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground link-underline",
                    active && "text-foreground",
                  )}
                >
                  {active && <span className="absolute inset-0 -z-10 rounded-lg bg-white/5" />}
                  {l.label}
                </Link>
              );
            })}
          </nav>

          <div className="hidden shrink-0 items-center gap-2 pr-1 lg:flex">
            <Link
              to="/login"
              className="rounded-lg px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              Log in
            </Link>
            <Link
              to="/signup"
              className="whitespace-nowrap rounded-lg bg-gradient-to-br from-[oklch(0.62_0.21_260)] to-[oklch(0.55_0.24_290)] px-3.5 py-1.5 text-sm font-medium text-white shadow-[inset_0_1px_0_0_rgba(255,255,255,0.2),0_6px_20px_-8px_oklch(0.58_0.21_260/0.8)] transition-transform hover:-translate-y-px"
            >
              Get Started Free
            </Link>
          </div>

          <button
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            aria-controls="mobile-nav"
            onClick={() => setOpen((o) => !o)}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-white/10 lg:hidden"
          >
            {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Mobile: a compact side drawer rather than a full-width panel dropped
          over the page. It slides in from the right, is dismissed by the
          backdrop, the close button or Escape, and traps nothing the user
          can't get out of. Body scroll is locked while it is open. */}
      <div
        className={cn(
          "pointer-events-auto fixed inset-0 z-50 lg:hidden",
          open ? "" : "pointer-events-none",
        )}
        aria-hidden={!open}
      >
        <div
          onClick={() => setOpen(false)}
          className={cn(
            "absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-200",
            open ? "opacity-100" : "opacity-0",
          )}
        />
        <div
          id="mobile-nav"
          role="dialog"
          aria-modal="true"
          aria-label="Menu"
          ref={drawerRef}
          className={cn(
            "absolute inset-y-0 right-0 flex w-[min(19rem,85vw)] flex-col border-l border-white/10 bg-[oklch(0.16_0.03_265)] shadow-[-24px_0_60px_-24px_rgba(0,0,0,0.9)] transition-transform duration-250 ease-out",
            open ? "translate-x-0" : "translate-x-full",
          )}
        >
          <div className="flex items-center justify-between border-b border-white/8 px-4 py-3.5">
            <Link to="/" onClick={() => setOpen(false)} aria-label="OfferLyst home">
              <Logo size={30} />
            </Link>
            <button
              ref={closeRef}
              onClick={() => setOpen(false)}
              aria-label="Close menu"
              className="grid h-10 w-10 place-items-center rounded-lg border border-white/10 text-muted-foreground transition-colors hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <nav className="flex-1 overflow-y-auto p-3">
            {links.map((l) => {
              const active = l.to === "/" ? pathname === "/" : pathname.startsWith(l.to);
              return (
                <Link
                  key={l.to}
                  to={l.to}
                  onClick={() => setOpen(false)}
                  className={cn(
                    "block rounded-lg px-3 py-3 text-[15px] transition-colors",
                    active
                      ? "bg-white/[0.06] font-medium text-foreground"
                      : "text-muted-foreground hover:bg-white/5 hover:text-foreground",
                  )}
                >
                  {l.label}
                </Link>
              );
            })}
          </nav>

          <div className="space-y-2 border-t border-white/10 p-3">
            <Link
              to="/login"
              onClick={() => setOpen(false)}
              className="block rounded-lg border border-white/15 px-3 py-3 text-center text-sm font-medium text-foreground"
            >
              Log in
            </Link>
            <Link
              to="/signup"
              onClick={() => setOpen(false)}
              className="block rounded-lg bg-gradient-to-br from-[oklch(0.62_0.21_260)] to-[oklch(0.55_0.24_290)] px-3 py-3 text-center text-sm font-medium text-white"
            >
              Get Started Free
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}
