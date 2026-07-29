import { createFileRoute, Outlet } from "@tanstack/react-router";

/**
 * Layout route for /dashboard/cover-letters and all children.
 * Renders <Outlet /> so both the library index and the Studio can mount.
 *
 * Index content (the history/library) lives in dashboard.cover-letters.index.tsx
 * Studio content lives in dashboard.cover-letters.$coverLetterId.tsx
 */
export const Route = createFileRoute("/dashboard/cover-letters")({
  component: CoverLettersLayout,
});

function CoverLettersLayout() {
  return <Outlet />;
}
