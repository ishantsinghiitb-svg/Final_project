import { createFileRoute, Outlet } from "@tanstack/react-router";

/**
 * Layout route for /dashboard/interviews and all children.
 * Renders <Outlet /> so the list, the Details page and the Prep workspace can
 * all mount. Added in Module 7B, mirroring dashboard.applications.tsx and
 * dashboard.cover-letters.tsx — the same split every "list + detail" section
 * in this app already uses.
 *
 * Index content lives in dashboard.interviews.index.tsx
 * Detail content lives in dashboard.interviews.$interviewId.index.tsx
 * Prep workspace content lives in dashboard.interviews.$interviewId.prep.tsx
 */
export const Route = createFileRoute("/dashboard/interviews")({
  component: InterviewsLayout,
});

function InterviewsLayout() {
  return <Outlet />;
}
