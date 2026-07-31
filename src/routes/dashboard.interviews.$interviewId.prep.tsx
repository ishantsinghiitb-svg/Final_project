import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AlertCircle, Loader2, RotateCcw, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { AIPage, AIPageHeader } from "@/components/dashboard/ai/AIPage";
import { AIMetaStrip } from "@/components/dashboard/ai/AIMeta";
import { Chip, EmptyState } from "@/components/dashboard/primitives";
import { DashButton } from "@/components/dashboard/DashButton";
import { PrepSetupPanel } from "@/components/dashboard/interviews/prep/PrepSetupPanel";
import { GeneratePrepDialog } from "@/components/dashboard/interviews/prep/GeneratePrepDialog";
import { PreparationProgressPanel } from "@/components/dashboard/interviews/prep/PreparationProgressPanel";
import { InterviewOverviewSection } from "@/components/dashboard/interviews/prep/InterviewOverviewSection";
import { InterviewQuestionsPanel } from "@/components/dashboard/interviews/prep/InterviewQuestionsPanel";
import { ResumeWeakAreasPanel } from "@/components/dashboard/interviews/prep/ResumeWeakAreasPanel";
import { StarStoriesPanel } from "@/components/dashboard/interviews/prep/StarStoriesPanel";
import { InterviewChecklistPanel } from "@/components/dashboard/interviews/prep/InterviewChecklistPanel";
import { useInterview } from "@/features/interviews/hooks";
import {
  useGenerateInterviewPrep,
  useInterviewPrep,
  useInterviewPrepAnswers,
  useUpdateInterviewPrepProgress,
} from "@/features/interview-prep/hooks";
import { useResumes } from "@/features/resumes/hooks";
import { useAICredits } from "@/features/ai/hooks";
import { aiErrorCopy, creditsReassurance } from "@/features/ai/errorMessages";
import { roundTone } from "@/features/interviews/constants";

export const Route = createFileRoute("/dashboard/interviews/$interviewId/prep")({
  head: () => ({
    meta: [{ title: "Interview Preparation — NextOffer" }, { name: "robots", content: "noindex" }],
  }),
  component: InterviewPrepWorkspace,
});

function InterviewPrepWorkspace() {
  const { interviewId } = Route.useParams();
  const {
    data: interview,
    isLoading: interviewLoading,
    isError: interviewError,
  } = useInterview(interviewId);
  const { data: prep, isLoading: prepLoading } = useInterviewPrep(interviewId);
  const { data: answers = [] } = useInterviewPrepAnswers(prep?.id);
  const { data: resumes = [] } = useResumes();
  const { data: credits } = useAICredits();

  const generatePrep = useGenerateInterviewPrep();
  const updateProgress = useUpdateInterviewPrepProgress();

  const [manualJobDescription, setManualJobDescription] = useState(
    prep?.manual_job_description ?? "",
  );
  const [manualCompanyDescription, setManualCompanyDescription] = useState(
    prep?.manual_company_description ?? "",
  );
  const [additionalContext, setAdditionalContext] = useState(prep?.additional_context ?? "");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogIsRegenerate, setDialogIsRegenerate] = useState(false);

  const resumeName = interview?.resume_id
    ? resumes.find((r) => r.id === interview.resume_id)?.name
    : null;

  const canGenerate = Boolean(
    interview?.resume_id && (interview.job_id || manualJobDescription.trim().length > 0),
  );

  const answeredCount = useMemo(
    () => answers.filter((a) => a.answer.trim().length > 0).length,
    [answers],
  );

  function openGenerateDialog(isRegenerate: boolean) {
    setDialogIsRegenerate(isRegenerate);
    setDialogOpen(true);
  }

  function handleConfirmGenerate() {
    if (!interview) return;
    generatePrep.mutate(
      {
        interviewId: interview.id,
        manualJobDescription: interview.job_id
          ? undefined
          : manualJobDescription.trim() || undefined,
        manualCompanyDescription: interview.job_id
          ? undefined
          : manualCompanyDescription.trim() || undefined,
        additionalContext: additionalContext.trim() || undefined,
      },
      {
        onSuccess: (res) => {
          if (!res.ok) {
            const copy = aiErrorCopy(res.code);
            toast.error(copy.title, {
              description: [copy.body, creditsReassurance(res.creditsRefunded)]
                .filter(Boolean)
                .join(" "),
            });
            setDialogOpen(false);
            return;
          }
          setDialogOpen(false);
          toast.success(
            dialogIsRegenerate ? "Preparation regenerated." : "Your preparation is ready.",
          );
        },
        onError: () => {
          setDialogOpen(false);
          const copy = aiErrorCopy(undefined);
          toast.error(copy.title, { description: copy.body });
        },
      },
    );
  }

  function handleToggleChecklist(id: string) {
    if (!prep) return;
    const current = prep.progress.checklistChecked ?? [];
    const next = current.includes(id) ? current.filter((c) => c !== id) : [...current, id];
    updateProgress.mutate({
      id: prep.id,
      interviewId,
      progress: { checklistChecked: next },
    });
  }

  if (interviewLoading || prepLoading) {
    return (
      <div className="flex items-center gap-2 py-16 text-sm text-[oklch(0.5_0.02_265)]">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
      </div>
    );
  }

  if (interviewError || !interview) {
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
        title="Interview Preparation"
        subtitle={
          <span className="flex flex-wrap items-center gap-1.5">
            <Chip tone="default">{interview.company_name}</Chip>
            <Chip tone={roundTone(interview.type)}>{interview.type}</Chip>
          </span>
        }
        actions={
          prep && (
            <DashButton
              variant="outline"
              size="sm"
              onClick={() => openGenerateDialog(true)}
              disabled={generatePrep.isPending}
            >
              <RotateCcw className="h-3.5 w-3.5" /> Regenerate Entire Preparation
            </DashButton>
          )
        }
      />

      {!prep ? (
        <div className="space-y-4">
          <PrepSetupPanel
            interview={interview}
            manualJobDescription={manualJobDescription}
            manualCompanyDescription={manualCompanyDescription}
            onManualJobDescriptionChange={setManualJobDescription}
            onManualCompanyDescriptionChange={setManualCompanyDescription}
            additionalContext={additionalContext}
            onAdditionalContextChange={setAdditionalContext}
          />
          <div className="rounded-2xl border border-[#2563EB]/15 bg-gradient-to-br from-[#2563EB]/[0.03] to-[#7C3AED]/[0.04] p-6 text-center">
            <p className="text-sm text-[oklch(0.4_0.02_265)]">
              We'll build a complete workspace: overview, what the interviewer is likely evaluating,
              priority topics, personalized questions, resume weak areas, STAR story ideas, and a
              checklist.
            </p>
            <DashButton
              className="mt-4"
              disabled={!canGenerate}
              onClick={() => openGenerateDialog(false)}
            >
              <Sparkles className="h-4 w-4" /> Generate my preparation
            </DashButton>
          </div>
        </div>
      ) : prep.content ? (
        <div className="space-y-4">
          <AIMetaStrip generatedAt={prep.generated_at} resumeName={resumeName} />

          <PreparationProgressPanel
            scheduledAt={interview.scheduled_at}
            checklistTotal={prep.content.checklist.length}
            checklistChecked={prep.progress.checklistChecked.length}
            questionsTotal={prep.content.questions.length}
            questionsAnswered={answeredCount}
          />

          <InterviewOverviewSection content={prep.content} />

          <InterviewQuestionsPanel
            interviewPrepId={prep.id}
            questions={prep.content.questions}
            answers={answers}
          />

          <ResumeWeakAreasPanel areas={prep.content.resumeWeakAreas} />
          <StarStoriesPanel stories={prep.content.starStories} />

          <InterviewChecklistPanel
            checklist={prep.content.checklist}
            checked={prep.progress.checklistChecked}
            onToggle={handleToggleChecklist}
          />
        </div>
      ) : (
        // A prep row exists but `content` is null — generation started and
        // never completed (the AI call failed or the tab closed before it
        // resolved). Previously this rendered nothing after the header, a
        // dead blank screen with no way forward.
        <div className="rounded-2xl border border-[#2563EB]/15 bg-gradient-to-br from-[#2563EB]/[0.03] to-[#7C3AED]/[0.04] p-6 text-center">
          <p className="text-sm text-[oklch(0.4_0.02_265)]">
            Generating this preparation didn't finish. Nothing was charged for an incomplete attempt
            — try generating it again.
          </p>
          <DashButton
            className="mt-4"
            disabled={!canGenerate}
            onClick={() => openGenerateDialog(false)}
          >
            <Sparkles className="h-4 w-4" /> Generate my preparation
          </DashButton>
        </div>
      )}

      <GeneratePrepDialog
        open={dialogOpen}
        isRegenerate={dialogIsRegenerate}
        answeredCount={answeredCount}
        creditsRemaining={credits?.creditsRemaining ?? 0}
        isPending={generatePrep.isPending}
        onConfirm={handleConfirmGenerate}
        onCancel={() => !generatePrep.isPending && setDialogOpen(false)}
      />
    </AIPage>
  );
}
