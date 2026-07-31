import { createFileRoute } from "@tanstack/react-router";
import { AlertCircle, Loader2 } from "lucide-react";
import { EmptyState } from "@/components/dashboard/primitives";
import { MockInterviewReport } from "@/components/dashboard/interviews/mock/MockInterviewReport";
import { useInterview } from "@/features/interviews/hooks";

export const Route = createFileRoute("/dashboard/interviews/$interviewId/mock/$sessionId/report")({
  head: () => ({
    meta: [{ title: "Mock Interview Report — NextOffer" }, { name: "robots", content: "noindex" }],
  }),
  component: MockInterviewReportPage,
});

function MockInterviewReportPage() {
  const { interviewId, sessionId } = Route.useParams();
  const { data: interview, isLoading, isError } = useInterview(interviewId);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-16 text-sm text-[oklch(0.5_0.02_265)]">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
      </div>
    );
  }

  if (isError || !interview) {
    return (
      <EmptyState
        icon={AlertCircle}
        title="Interview not found"
        body="It may have been deleted. Head back to your interviews list."
      />
    );
  }

  return <MockInterviewReport interview={interview} sessionId={sessionId} />;
}
