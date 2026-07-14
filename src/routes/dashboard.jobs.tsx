import { createFileRoute, Outlet } from "@tanstack/react-router";

/**
 * Layout route for /dashboard/jobs and all children.
 * Renders <Outlet /> so both the jobs index and the job detail page can mount.
 *
 * Index content (the jobs list) lives in dashboard.jobs.index.tsx
 * Detail content lives in dashboard.jobs.$jobId.tsx
 */
export const Route = createFileRoute("/dashboard/jobs")({
  component: JobsLayout,
});

function JobsLayout() {
  return <Outlet />;
}