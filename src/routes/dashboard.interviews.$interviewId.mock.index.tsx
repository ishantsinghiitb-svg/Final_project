import { createFileRoute } from "@tanstack/react-router";
import { AlertCircle, Loader2, Sparkles } from "lucide-react";
import { AIPage, AIPageHeader } from "@/components/dashboard/ai/AIPage";
import { Chip, EmptyState } from "@/components/dashboard/primitives";
import { MockInterviewLauncher } from "@/components/dashboard/interviews/mock/MockInterviewLauncher";
import { useInterview } from "@/features/interviews/hooks";
import { roundTone } from "@/features/interviews/constants";

export const Route = createFileRoute("/dashboard/interviews/$interviewId/mock/")({
  head: () => ({
    meta: [{ title: "AI Mock Interview — NextOffer" }, { name: "robots", content: "noindex" }],
  }),
  component: MockInterviewLauncherPage,
});

function MockInterviewLauncherPage() {
  const { interviewId } = Route.useParams();
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

  return (
    <AIPage>
      <AIPageHeader
        backTo="/dashboard/interviews/$interviewId"
        backParams={{ interviewId: interview.id }}
        backLabel="Interview details"
        icon={Sparkles}
        title="AI Mock Interview"
        subtitle={
          <span className="flex flex-wrap items-center gap-1.5">
            <Chip tone="default">{interview.company_name}</Chip>
            <Chip tone={roundTone(interview.type)}>{interview.type}</Chip>
          </span>
        }
      />
      <MockInterviewLauncher interview={interview} />
    </AIPage>
  );
}
