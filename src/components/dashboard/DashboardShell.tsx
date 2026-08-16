import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  Bookmark,
  Briefcase,
  CalendarClock,
  ChevronRight,
  FileText,
  FolderKanban,
  Inbox,
  ChartLine as LineChart,
  Mail,
  Search,
  Settings,
  Target,
  X,
  Menu,
  LogOut,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { CommandPalette } from "./CommandPalette";
import { NotificationBell } from "./NotificationBell";
import { Kbd } from "./primitives";
import { Logo } from "@/components/site/Logo";
import { UserAvatar } from "./UserAvatar";
import { useUserIdentity } from "@/features/profile/identity";
import { moreCreditsLinkProps } from "./ai/NeedMoreCredits";
import { CREDITS_CTA_TITLE } from "@/content/credits";
import { useAuth } from "@/context/AuthContext";
import { useProfile } from "@/context/ProfileContext";
import { useSidebarCounts } from "@/features/jobs/hooks";
import { useGoogleAutoSyncOnOpen } from "@/features/google/hooks";

type NavItem = {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  exact?: boolean;
  /**
   * Badge key, looked up dynamically from useSidebarCounts(). Only sections
   * where a count is actionable carry one. Overview, Jobs and Analytics
   * deliberately have none: Overview and Analytics are views over data the
   * other sections already count, and the Jobs badge counted the whole
   * discoverable job board (it read "999+" for everyone), which is a catalogue
   * size rather than anything the user needs to act on.
   */
  badgeKey?: "saved" | "applications" | "collections" | "gmailSuggestions";
};

const nav: NavItem[] = [
  { to: "/dashboard", label: "Overview", icon: Activity, exact: true },
  { to: "/dashboard/jobs", label: "Jobs", icon: Briefcase },
  { to: "/dashboard/saved", label: "Saved", icon: Bookmark, badgeKey: "saved" },
  // Badge shows the number of COLLECTIONS the user has, not the jobs inside
  // them — same badgeKey-driven mechanism as Jobs/Saved/Applications.
  {
    to: "/dashboard/collections",
    label: "Collections",
    icon: FolderKanban,
    badgeKey: "collections",
  },
  { to: "/dashboard/applications", label: "Applications", icon: Target, badgeKey: "applications" },
  { to: "/dashboard/resumes", label: "Resumes", icon: FileText },
  { to: "/dashboard/cover-letters", label: "Cover Letters", icon: Mail },
  { to: "/dashboard/interviews", label: "Interviews", icon: CalendarClock },
  // Module 9A/9B — pending Gmail- and Calendar-sourced suggestions review
  // queue. Uses Inbox (not Mail — that icon's already claimed by Cover
  // Letters above).
  { to: "/dashboard/inbox", label: "Inbox", icon: Inbox, badgeKey: "gmailSuggestions" },
  { to: "/dashboard/analytics", label: "Analytics", icon: LineChart },
];

export function DashboardShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, signOut } = useAuth();
  const { profile } = useProfile();
  const counts = useSidebarCounts();
  // Module 9A "app open" sync trigger — fires the cheap due-check once per
  // session mount; no-ops unless a sync is actually due. See the hook's own
  // comment for why there's no platform-level background execution here.
  // Calendar's own app-open trigger joins this once CalendarSyncService
  // exists (Module 9B Phase 2).
  useGoogleAutoSyncOnOpen();
  const [signingOut, setSigningOut] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);

  // Single source of truth for name/email/avatar across the app — resolves the
  // profile row against the auth provider's metadata so a Google picture shows
  // even when the profile row predates it. See features/profile/identity.ts.
  const { displayName, email: displayEmail, avatarUrl, initials } = useUserIdentity();

  async function handleSignOut() {
    setSigningOut(true);
    const { error } = await signOut();
    setSigningOut(false);
    if (error) {
      toast.error(error);
      return;
    }
    toast.success("Signed out.");
    navigate({ to: "/" });
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    setMobileNav(false);
  }, [pathname]);

  /**
   * Clicking a sidebar item that's already the CURRENT page refreshes it in
   * place (invalidate + refetch + scroll to top) instead of letting the
   * router perform a no-op navigation to the same URL. Deliberately an exact
   * match on `to`/`basePath` — not "active" in the broader sense used for nav
   * highlighting, which also lights up while on a child route (e.g. a job
   * detail page). Clicking "Jobs" from a job detail page must still navigate
   * back to the list, not silently refresh the detail page instead.
   */
  const handleNavClick = useCallback(
    (e: React.MouseEvent, to: string) => {
      const basePath = to.replace(/\/$/, "");
      const isCurrentPage = pathname === to || pathname === basePath;
      if (!isCurrentPage) return;

      e.preventDefault();
      void queryClient.invalidateQueries();
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    [pathname, queryClient],
  );

  return (
    <div className="min-h-screen bg-[oklch(0.985_0.003_250)] text-[oklch(0.2_0.02_265)]">
      <div className="grid min-h-screen lg:grid-cols-[216px_1fr]">
        <aside
          className={cn(
            "fixed inset-y-0 left-0 z-40 w-[216px] overflow-y-auto border-r border-black/5 bg-white/85 p-2.5 backdrop-blur transition-transform lg:sticky lg:top-0 lg:h-screen lg:translate-x-0",
            mobileNav ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
          )}
        >
          <div className="flex items-center justify-between">
            <Link
              to="/"
              className="flex items-center gap-2 rounded-lg px-1"
              aria-label="OfferLyst home"
            >
              {/* tone="onLight" is required here: the default wordmark ink is
                  near-white for the dark marketing site and was rendering
                  invisible against this white sidebar. */}
              <Logo size={30} tone="onLight" />
            </Link>
            <button
              onClick={() => setMobileNav(false)}
              className="grid h-8 w-8 place-items-center rounded-lg hover:bg-black/[0.03] lg:hidden"
              aria-label="Close menu"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-4">
            <p className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-widest text-[oklch(0.55_0.02_265)]">
              Workspace
            </p>
            <nav className="space-y-0.5">
              {nav.map((n) => {
                // Match the parent path prefix so the nav item stays active
                // when the user is on a child route (e.g. /dashboard/jobs/$jobId)
                const basePath = n.to.replace(/\/$/, ""); // strip trailing slash for prefix check
                const active = n.exact
                  ? pathname === n.to || pathname === basePath
                  : pathname === n.to ||
                    pathname === basePath ||
                    pathname.startsWith(basePath + "/");
                const badgeValue = n.badgeKey ? counts[n.badgeKey] : undefined;
                return (
                  <Link
                    key={n.to}
                    to={n.to}
                    onClick={(e) => handleNavClick(e, n.to)}
                    className={cn(
                      "group flex items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-[13px] transition-colors",
                      active
                        ? "bg-[oklch(0.95_0.02_265)] font-medium text-[#2563EB]"
                        : "text-[oklch(0.4_0.02_265)] hover:bg-black/[0.03] hover:text-[oklch(0.2_0.02_265)]",
                    )}
                  >
                    <n.icon className={cn("h-[15px] w-[15px]", active && "text-[#2563EB]")} />
                    <span className="flex-1">{n.label}</span>
                    {badgeValue !== undefined && badgeValue > 0 && (
                      <span
                        className={cn(
                          "rounded-md px-1.5 py-0.5 text-[10px] font-medium tabular-nums",
                          active
                            ? "bg-white text-[#2563EB]"
                            : "bg-black/[0.05] text-[oklch(0.45_0.02_265)]",
                        )}
                      >
                        {badgeValue > 999 ? "999+" : badgeValue}
                      </span>
                    )}
                  </Link>
                );
              })}
            </nav>
          </div>

          {/* No paid plans exist, so this is a contact prompt rather than an
              upgrade prompt. The mailto is shared with every other
              out-of-credits surface via NeedMoreCredits. */}
          <div className="mt-4 rounded-xl border border-black/5 bg-gradient-to-br from-[#2563EB]/5 to-[#7C3AED]/10 p-3.5">
            <p className="text-xs font-semibold">{CREDITS_CTA_TITLE}</p>
            <p className="mt-1 text-[11px] leading-relaxed text-[oklch(0.45_0.02_265)]">
              Every account starts with a free allowance. Tell us what you need and we will top you
              up.
            </p>
            <a
              {...moreCreditsLinkProps()}
              className="mt-1.5 inline-flex min-h-[28px] items-center gap-1 rounded py-1 text-xs font-medium text-[#2563EB] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]/40"
            >
              Contact us <ChevronRight className="h-3 w-3" />
            </a>
          </div>

          <div className="mt-4 border-t border-black/5 pt-3">
            <Link
              to="/dashboard/settings"
              onClick={(e) => handleNavClick(e, "/dashboard/settings")}
              className={cn(
                "flex items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-[13px] transition-colors",
                pathname.startsWith("/dashboard/settings")
                  ? "bg-[oklch(0.95_0.02_265)] font-medium text-[#2563EB]"
                  : "text-[oklch(0.4_0.02_265)] hover:bg-black/[0.03] hover:text-[oklch(0.2_0.02_265)]",
              )}
            >
              <Settings className="h-[15px] w-[15px]" /> Settings
            </Link>
            <div className="mt-2.5 flex items-center gap-2 rounded-lg px-2 py-1.5">
              <UserAvatar avatarUrl={avatarUrl} initials={initials} size={28} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium">{displayName}</p>
                <p className="truncate text-[10.5px] text-[oklch(0.5_0.02_265)]">{displayEmail}</p>
              </div>
              <button
                onClick={handleSignOut}
                disabled={signingOut}
                aria-label="Log out"
                className="ml-auto rounded-md p-1.5 text-[oklch(0.5_0.02_265)] transition-colors hover:bg-black/[0.03] hover:text-[oklch(0.2_0.02_265)] disabled:opacity-50"
              >
                {signingOut ? (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-black/10 border-t-[#2563EB]" />
                ) : (
                  <LogOut className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>
        </aside>

        {mobileNav && (
          <div
            className="fixed inset-0 z-30 bg-black/30 lg:hidden"
            onClick={() => setMobileNav(false)}
          />
        )}

        <div className="flex min-w-0 flex-col">
          <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-3 border-b border-black/5 bg-white/85 px-3 backdrop-blur md:px-5">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setMobileNav(true)}
                className="grid h-8 w-8 place-items-center rounded-lg border border-black/5 bg-white lg:hidden"
                aria-label="Open menu"
              >
                <Menu className="h-4 w-4" />
              </button>
              <button
                onClick={() => setPaletteOpen(true)}
                className="flex h-8 w-[280px] max-w-[60vw] items-center gap-2 rounded-lg border border-black/5 bg-white px-2.5 text-[13px] text-[oklch(0.5_0.02_265)] transition-colors hover:border-black/10"
              >
                <Search className="h-[15px] w-[15px] shrink-0" />
                {/* truncate + nowrap: at 390px the placeholder wrapped onto a
                    second line and pushed the header taller. The ⌘K hint is
                    keyboard-only affordance, so it is dropped on touch widths
                    rather than competing for the space. */}
                <span className="flex-1 truncate whitespace-nowrap text-left">
                  Search or jump to…
                </span>
                <span className="hidden items-center gap-1 sm:flex">
                  <Kbd>⌘</Kbd>
                  <Kbd>K</Kbd>
                </span>
              </button>
            </div>
            <div className="flex items-center gap-2">
              {/* The "Commands" button was removed as redundant: the search
                  field to its left opens the same palette, and ⌘K/Ctrl+K still
                  works. CommandPalette itself is untouched. */}
              <NotificationBell />
              {/* Add Job button removed — global jobs are not user-created */}
            </div>
          </header>

          <main className="min-w-0 flex-1">
            <div className="dash-container space-y-4 py-5">{children}</div>
          </main>
        </div>
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}
