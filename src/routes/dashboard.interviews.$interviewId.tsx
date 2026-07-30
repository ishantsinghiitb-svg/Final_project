import { createFileRoute, Outlet } from "@tanstack/react-router";

/**
 * Layout route for /dashboard/interviews/$interviewId and its children.
 * Renders <Outlet /> so both the Details page and the Prep workspace can
 * mount — same split as dashboard.interviews.tsx one level up.
 *
 * Details content lives in dashboard.interviews.$interviewId.index.tsx
 * Prep workspace content lives in dashboard.interviews.$interviewId.prep.tsx
 */
export const Route = createFileRoute("/dashboard/interviews/$interviewId")({
  component: InterviewDetailLayout,
});

function InterviewDetailLayout() {
  return <Outlet />;
}
