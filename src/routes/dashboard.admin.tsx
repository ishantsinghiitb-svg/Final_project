import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, Loader2, MessageSquareText, ShieldAlert, Users } from "lucide-react";
import { EmptyState, PageHeader, StickyPageHeader } from "@/components/dashboard/primitives";
import { useAdminOverview } from "@/features/admin/hooks";

// ── Admin Platform (Module 13 · Phase 5) ──
//
// Layout route for /dashboard/admin and its children. The REAL access
// control is server-side — every server function under src/server-functions
// /admin.ts independently calls `requireAdmin` (see
// src/server/jobIntelligence/adminAuth.ts). What happens here is UX only:
// `useAdminOverview` asks the server "am I an admin", and a `false` answer
// renders a plain "not authorized" message instead of the panel. A normal
// user forcing this URL learns nothing — every query they'd see data from
// independently re-checks and returns nothing.
//
// Index content lives in dashboard.admin.index.tsx
// User search lives in dashboard.admin.users.tsx
// Feedback review lives in dashboard.admin.feedback.tsx

export const Route = createFileRoute("/dashboard/admin")({
  head: () => ({
    meta: [{ title: "Admin — OfferLyst" }, { name: "robots", content: "noindex" }],
  }),
  component: AdminLayout,
});

const TABS = [
  { to: "/dashboard/admin", label: "Overview", icon: LayoutDashboard },
  { to: "/dashboard/admin/users", label: "Users", icon: Users },
  { to: "/dashboard/admin/feedback", label: "Feedback", icon: MessageSquareText },
];

function AdminLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { data, isLoading } = useAdminOverview();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-24 text-sm text-[oklch(0.5_0.02_265)]">
        <Loader2 className="h-5 w-5 animate-spin" />
        Checking access…
      </div>
    );
  }

  if (!data?.isAdmin) {
    return (
      <EmptyState
        icon={ShieldAlert}
        title="Admin access required"
        body="This area is restricted to Offerlyst operators."
      />
    );
  }

  return (
    <>
      <StickyPageHeader>
        <PageHeader
          eyebrow="Admin"
          title="Operator dashboard"
          subtitle="Internal tools — not visible to regular users."
        />
        <div className="-mx-1 overflow-x-auto px-1 scrollbar-hide">
          <div
            role="tablist"
            aria-label="Admin sections"
            className="inline-flex min-w-full gap-1 rounded-xl border border-black/5 bg-white p-1"
          >
            {TABS.map((t) => {
              const active = t.to === "/dashboard/admin" ? pathname === t.to : pathname.startsWith(t.to);
              return (
                <Link
                  key={t.to}
                  to={t.to}
                  role="tab"
                  aria-selected={active}
                  className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-xs transition-colors ${
                    active
                      ? "bg-[oklch(0.95_0.02_265)] font-medium text-[#2563EB]"
                      : "text-[oklch(0.45_0.02_265)] hover:bg-black/[0.03]"
                  }`}
                >
                  <t.icon className="h-3.5 w-3.5" />
                  {t.label}
                </Link>
              );
            })}
          </div>
        </div>
      </StickyPageHeader>
      <Outlet />
    </>
  );
}
