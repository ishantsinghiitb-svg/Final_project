import { useEffect, useState, type ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  Activity,
  Bell,
  Bookmark,
  Briefcase,
  CalendarClock,
  ChevronRight,
  Command,
  FileText,
  LineChart,
  Plus,
  Search,
  Settings,
  Sparkles,
  StickyNote,
  Target,
  X,
  Menu,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { CommandPalette } from "./CommandPalette";
import { notifications } from "@/lib/dashboard-data";
import { Kbd } from "./primitives";

type NavItem = {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  exact?: boolean;
  badge?: string;
};

const nav: NavItem[] = [
  { to: "/dashboard", label: "Overview", icon: Activity, exact: true },
  { to: "/dashboard/jobs", label: "Jobs", icon: Briefcase, badge: "12" },
  { to: "/dashboard/saved", label: "Saved", icon: Bookmark, badge: "7" },
  { to: "/dashboard/applications", label: "Applications", icon: Target, badge: "24" },
  { to: "/dashboard/resumes", label: "Resumes", icon: FileText },
  { to: "/dashboard/interviews", label: "Interviews", icon: CalendarClock, badge: "5" },
  { to: "/dashboard/notes", label: "Notes", icon: StickyNote },
  { to: "/dashboard/analytics", label: "Analytics", icon: LineChart },
];

export function DashboardShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);

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
    setNotifOpen(false);
  }, [pathname]);

  const unread = notifications.filter((n) => n.unread).length;

  return (
    <div className="min-h-screen bg-[oklch(0.98_0.005_250)] text-[oklch(0.2_0.02_265)]">
      <div className="grid min-h-screen lg:grid-cols-[240px_1fr]">
        <aside
          className={cn(
            "fixed inset-y-0 left-0 z-40 w-[240px] border-r border-black/5 bg-white/80 p-4 backdrop-blur transition-transform lg:static lg:translate-x-0",
            mobileNav ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
          )}
        >
          <div className="flex items-center justify-between">
            <Link to="/" className="flex items-center gap-2">
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-[#2563EB] to-[#7C3AED] shadow-[0_4px_20px_-4px_rgba(37,99,235,0.6)]">
                <Sparkles className="h-3.5 w-3.5 text-white" />
              </span>
              <span className="font-display text-[15px] font-semibold">NextOffer</span>
            </Link>
            <button
              onClick={() => setMobileNav(false)}
              className="grid h-8 w-8 place-items-center rounded-lg hover:bg-black/[0.03] lg:hidden"
              aria-label="Close menu"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-5">
            <p className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-widest text-[oklch(0.55_0.02_265)]">
              Workspace
            </p>
            <nav className="space-y-0.5">
              {nav.map((n) => {
                const active = n.exact
                  ? pathname === n.to
                  : pathname === n.to || pathname.startsWith(n.to + "/");
                return (
                  <Link
                    key={n.to}
                    to={n.to}
                    className={cn(
                      "group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors",
                      active
                        ? "bg-[oklch(0.95_0.02_265)] font-medium text-[#2563EB]"
                        : "text-[oklch(0.4_0.02_265)] hover:bg-black/[0.03] hover:text-[oklch(0.2_0.02_265)]",
                    )}
                  >
                    <n.icon className={cn("h-4 w-4", active && "text-[#2563EB]")} />
                    <span className="flex-1">{n.label}</span>
                    {n.badge && (
                      <span
                        className={cn(
                          "rounded-md px-1.5 py-0.5 text-[10px] font-medium",
                          active
                            ? "bg-white text-[#2563EB]"
                            : "bg-black/[0.05] text-[oklch(0.45_0.02_265)]",
                        )}
                      >
                        {n.badge}
                      </span>
                    )}
                  </Link>
                );
              })}
            </nav>
          </div>

          <div className="mt-5 rounded-xl border border-black/5 bg-gradient-to-br from-[#2563EB]/5 to-[#7C3AED]/10 p-4">
            <p className="text-xs font-semibold">Upgrade to Pro</p>
            <p className="mt-1 text-[11px] leading-relaxed text-[oklch(0.45_0.02_265)]">
              Unlimited AI tailoring, cover letters, and analytics.
            </p>
            <Link
              to="/pricing"
              className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-[#2563EB] hover:underline"
            >
              See plans <ChevronRight className="h-3 w-3" />
            </Link>
          </div>

          <div className="mt-4 border-t border-black/5 pt-3">
            <Link
              to="/dashboard/settings"
              className={cn(
                "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors",
                pathname.startsWith("/dashboard/settings")
                  ? "bg-[oklch(0.95_0.02_265)] font-medium text-[#2563EB]"
                  : "text-[oklch(0.4_0.02_265)] hover:bg-black/[0.03] hover:text-[oklch(0.2_0.02_265)]",
              )}
            >
              <Settings className="h-4 w-4" /> Settings
            </Link>
            <div className="mt-3 flex items-center gap-2 rounded-lg px-2 py-2">
              <div className="grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br from-[#2563EB] to-[#7C3AED] text-xs font-semibold text-white">
                AV
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">Ava Chen</p>
                <p className="truncate text-[11px] text-[oklch(0.5_0.02_265)]">Pro · trial</p>
              </div>
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
          <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-black/5 bg-white/80 px-4 py-3 backdrop-blur md:px-6">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setMobileNav(true)}
                className="grid h-9 w-9 place-items-center rounded-lg border border-black/5 bg-white lg:hidden"
                aria-label="Open menu"
              >
                <Menu className="h-4 w-4" />
              </button>
              <button
                onClick={() => setPaletteOpen(true)}
                className="flex w-[300px] max-w-[60vw] items-center gap-2 rounded-lg border border-black/5 bg-white px-3 py-2 text-sm text-[oklch(0.5_0.02_265)] transition-colors hover:border-black/10"
              >
                <Search className="h-4 w-4" />
                <span className="flex-1 text-left">Search or jump to…</span>
                <span className="flex items-center gap-1">
                  <Kbd>⌘</Kbd>
                  <Kbd>K</Kbd>
                </span>
              </button>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPaletteOpen(true)}
                className="hidden items-center gap-1.5 rounded-lg border border-black/5 bg-white px-2.5 py-2 text-xs text-[oklch(0.45_0.02_265)] hover:bg-black/[0.03] sm:flex"
                aria-label="Open command palette"
              >
                <Command className="h-3.5 w-3.5" /> Commands
              </button>
              <div className="relative">
                <button
                  onClick={() => setNotifOpen((o) => !o)}
                  aria-label="Notifications"
                  className="grid h-9 w-9 place-items-center rounded-lg border border-black/5 bg-white text-[oklch(0.4_0.02_265)] hover:bg-black/[0.03]"
                >
                  <Bell className="h-4 w-4" />
                  {unread > 0 && (
                    <span className="absolute right-1.5 top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-[#F43F5E] px-1 text-[9px] font-semibold text-white">
                      {unread}
                    </span>
                  )}
                </button>
                {notifOpen && (
                  <div className="absolute right-0 top-11 w-[340px] overflow-hidden rounded-xl border border-black/10 bg-white shadow-[0_20px_60px_-20px_rgba(0,0,0,0.25)]">
                    <div className="flex items-center justify-between border-b border-black/5 px-4 py-3">
                      <p className="font-display text-sm font-semibold">Notifications</p>
                      <button className="text-xs text-[#2563EB] hover:underline">Mark all read</button>
                    </div>
                    <ul className="max-h-[60vh] overflow-y-auto">
                      {notifications.map((n) => (
                        <li
                          key={n.id}
                          className="flex gap-3 border-b border-black/5 px-4 py-3 last:border-0 hover:bg-[oklch(0.98_0.005_265)]"
                        >
                          <span
                            className={cn(
                              "mt-1 h-2 w-2 shrink-0 rounded-full",
                              n.unread ? "bg-[#2563EB]" : "bg-black/10",
                            )}
                          />
                          <div className="min-w-0">
                            <p className="text-sm font-medium">{n.title}</p>
                            <p className="mt-0.5 text-xs text-[oklch(0.45_0.02_265)]">{n.body}</p>
                            <p className="mt-1 text-[11px] text-[oklch(0.55_0.02_265)]">{n.when}</p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
              <Link
                to="/dashboard/jobs"
                className="hidden items-center gap-1.5 rounded-lg bg-gradient-to-br from-[#2563EB] to-[#7C3AED] px-3 py-2 text-sm font-medium text-white shadow-[inset_0_1px_0_0_rgba(255,255,255,0.25),0_6px_20px_-8px_rgba(37,99,235,0.8)] transition-transform hover:-translate-y-px sm:inline-flex"
              >
                <Plus className="h-4 w-4" /> Add job
              </Link>
            </div>
          </header>

          <main className="min-w-0 flex-1 space-y-6 p-4 md:p-6">{children}</main>
        </div>
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}