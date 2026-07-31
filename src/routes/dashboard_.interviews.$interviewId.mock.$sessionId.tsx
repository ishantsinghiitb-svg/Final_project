import { createFileRoute } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { ProtectedRoute } from "@/components/auth/RouteGuards";
import { MockInterviewStudio } from "@/components/dashboard/interviews/mock/MockInterviewStudio";
import { useInterview } from "@/features/interviews/hooks";

// ── The Mock Interview Studio route (Module 7C) ──
//
// Deliberately escapes the /dashboard shell (no sidebar, full screen) via the
// `dashboard_` file-naming convention — confirmed against the generated
// route tree that this parents directly under the app root rather than
// DashboardRoute, while the URL stays the canonical
// /dashboard/interviews/$interviewId/mock/$sessionId. Escaping the shell
// also escapes its <ProtectedRoute>, so this route supplies its own.

export const Route = createFileRoute("/dashboard_/interviews/$interviewId/mock/$sessionId")({
  head: () => ({
    meta: [{ title: "Mock Interview — NextOffer" }, { name: "robots", content: "noindex" }],
  }),
  component: MockInterviewStudioPage,
});

function MockInterviewStudioPage() {
  const { interviewId, sessionId } = Route.useParams();
  const { data: interview, isLoading, isError } = useInterview(interviewId);

  return (
    <ProtectedRoute>
      {isLoading || !interview ? (
        <div className="grid min-h-screen place-items-center bg-[oklch(0.1_0.02_265)]">
          <Loader2 className="h-6 w-6 animate-spin text-white/40" />
        </div>
      ) : isError ? (
        <div className="grid min-h-screen place-items-center bg-[oklch(0.1_0.02_265)] px-4 text-center">
          <p className="text-sm text-white/60">
            This interview is no longer available. Head back to your interviews list.
          </p>
        </div>
      ) : (
        <MockInterviewStudio interview={interview} sessionId={sessionId} />
      )}
    </ProtectedRoute>
  );
}
