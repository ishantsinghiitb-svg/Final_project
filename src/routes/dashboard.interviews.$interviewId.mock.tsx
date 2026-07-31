import { createFileRoute, Outlet } from "@tanstack/react-router";

/**
 * Layout route for /dashboard/interviews/$interviewId/mock and its children.
 * The launcher (.index.tsx) renders inside the dashboard shell; the studio
 * itself (.$sessionId.tsx) intentionally escapes this layout entirely via
 * the `dashboard_` route-file naming — see that file's comment.
 */
export const Route = createFileRoute("/dashboard/interviews/$interviewId/mock")({
  component: () => <Outlet />,
});
