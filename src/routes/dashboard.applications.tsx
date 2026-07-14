import { createFileRoute, Outlet } from "@tanstack/react-router";

/**
 * Layout route for /dashboard/applications and all children.
 * Renders <Outlet /> so both the applications index and the detail page can mount.
 *
 * Index content lives in dashboard.applications.index.tsx
 * Detail content lives in dashboard.applications.$applicationId.tsx
 */
export const Route = createFileRoute("/dashboard/applications")({
  component: ApplicationsLayout,
});

function ApplicationsLayout() {
  return <Outlet />;
}