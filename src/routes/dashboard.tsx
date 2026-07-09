import { createFileRoute, Outlet } from "@tanstack/react-router";
import { DashboardShell } from "@/components/dashboard/DashboardShell";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Workspace — NextOffer" },
      { name: "description", content: "Your NextOffer workspace: jobs, applications, interviews, and resumes in one place." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: DashboardLayout,
});

function DashboardLayout() {
  return (
    <DashboardShell>
      <Outlet />
    </DashboardShell>
  );
}