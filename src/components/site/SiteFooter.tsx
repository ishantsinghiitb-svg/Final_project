import { Link } from "@tanstack/react-router";
import { Sparkles, Github, Twitter, Linkedin } from "lucide-react";

const cols = [
  {
    title: "Product",
    links: [
      { to: "/features", label: "Features" },
      { to: "/pricing", label: "Pricing" },
      { to: "/dashboard", label: "Dashboard preview" },
    ],
  },
  {
    title: "Company",
    links: [
      { to: "/about", label: "About" },
      { to: "/contact", label: "Contact" },
      { to: "/faq", label: "FAQ" },
    ],
  },
  {
    title: "Get started",
    links: [
      { to: "/signup", label: "Create account" },
      { to: "/login", label: "Log in" },
    ],
  },
] as const;

export function SiteFooter() {
  return (
    <footer className="relative mt-32 border-t border-white/10 bg-[oklch(0.15_0.02_265)]/60">
      <div className="mx-auto grid max-w-6xl gap-10 px-6 py-16 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div>
          <Link to="/" className="flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-[oklch(0.58_0.21_260)] to-[oklch(0.55_0.24_295)]">
              <Sparkles className="h-4 w-4 text-white" />
            </span>
            <span className="font-display font-semibold">NextOffer</span>
          </Link>
          <p className="mt-3 max-w-sm text-sm text-muted-foreground">
            The AI copilot for your job search. Save, tailor, track and land
            offers — everywhere you already apply.
          </p>
          <div className="mt-5 flex gap-2">
            {[Twitter, Linkedin, Github].map((Icon, i) => (
              <a
                key={i}
                href="#"
                aria-label="social"
                className="grid h-9 w-9 place-items-center rounded-lg border border-white/10 text-muted-foreground transition-colors hover:border-white/20 hover:text-foreground"
              >
                <Icon className="h-4 w-4" />
              </a>
            ))}
          </div>
        </div>

        {cols.map((col) => (
          <div key={col.title}>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {col.title}
            </p>
            <ul className="mt-4 space-y-2.5 text-sm">
              {col.links.map((l) => (
                <li key={l.to}>
                  <Link
                    to={l.to}
                    className="text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-white/5">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-2 px-6 py-6 text-xs text-muted-foreground md:flex-row md:items-center">
          <p>© {new Date().getFullYear()} NextOffer, Inc. All rights reserved.</p>
          <p>Built for people who take their next offer seriously.</p>
        </div>
      </div>
    </footer>
  );
}