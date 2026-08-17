import { Link } from "@tanstack/react-router";
import { Logo } from "@/components/site/Logo";
import { CONTACT_EMAIL } from "@/content/extension";
import { contactLinkProps } from "@/content/contact";

const cols = [
  {
    title: "Product",
    links: [
      { to: "/features", label: "Features" },
      { to: "/pricing", label: "Pricing" },
      { to: "/extension", label: "Chrome extension" },
      { to: "/dashboard", label: "Dashboard preview" },
    ],
  },
  {
    title: "Company",
    links: [
      { to: "/about", label: "About" },
      { to: "/blog", label: "Blog" },
      { to: "/contact", label: "Contact" },
      { to: "/faq", label: "FAQ" },
    ],
  },
  {
    title: "Legal",
    links: [
      { to: "/privacy", label: "Privacy policy" },
      { to: "/terms", label: "Terms of service" },
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
    <footer className="relative mt-12 border-t border-white/10 md:mt-16 bg-[oklch(0.15_0.02_265)]/60">
      {/* Mobile stacked every block full width with a 40px gap, which made the
          footer taller than most of the pages above it. The link groups now sit
          in a 2/3-column grid on small screens; `md:contents` dissolves that
          wrapper at desktop so the 5-column layout (brand + 4 link groups,
          Legal added in Module 13 Phase 6) is unchanged. */}
      <div className="site-container py-10 md:py-14">
        <div className="grid gap-8 md:grid-cols-[1.2fr_0.8fr_0.8fr_0.8fr_0.8fr] md:gap-10">
          <div>
            <Link to="/" className="flex items-center gap-2" aria-label="OfferLyst home">
              <Logo size={32} />
            </Link>
            <p className="mt-3 max-w-sm text-sm leading-relaxed text-muted-foreground">
              The workspace for your entire job search. Save jobs from the sites you already use,
              tailor your resume with AI, and track every application in one calm place.
            </p>
            <a
              {...contactLinkProps()}
              className="mt-3 inline-flex min-h-[24px] items-center rounded py-1 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[oklch(0.58_0.21_260)]/60"
            >
              {CONTACT_EMAIL}
            </a>
          </div>

          <div className="grid grid-cols-2 gap-x-4 gap-y-7 sm:grid-cols-3 md:contents">
            {cols.map((col) => (
              <div key={col.title}>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {col.title}
                </p>
                <ul className="mt-3 space-y-1 text-sm md:mt-4 md:space-y-2.5">
                  {col.links.map((l) => (
                    <li key={l.to}>
                      <Link
                        to={l.to}
                        className="-mx-1 inline-block rounded px-1 py-1.5 text-muted-foreground transition-colors hover:text-foreground md:py-0"
                      >
                        {l.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="border-t border-white/5">
        <div className="site-container flex flex-col items-start justify-between gap-1.5 py-5 text-xs text-muted-foreground md:flex-row md:items-center">
          <p>© {new Date().getFullYear()} OfferLyst</p>
          <p>Built for people who take their next offer seriously.</p>
        </div>
      </div>
    </footer>
  );
}
