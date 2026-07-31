import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { History, Sparkles } from "lucide-react";
import { DashCard, SectionTitle } from "@/components/dashboard/primitives";
import { DashButton } from "@/components/dashboard/DashButton";
import { AIErrorNotice } from "@/components/dashboard/ai/AIErrorNotice";
import { useAICredits } from "@/features/ai/hooks";
import { useStartMockInterview, useMockInterviewSessions } from "@/features/mock-interview/hooks";
import { resolveRoleFamily, suggestedRoleFor } from "@/features/mock-interview/interviewerRoles";
import { MOCK_INTERVIEW_CREDIT_COST } from "@/features/mock-interview/constants";
import type { Interview } from "@/types";
import { MockInterviewReadiness } from "./MockInterviewReadiness";
import { InterviewerRolePicker } from "./InterviewerRolePicker";
import { StartMockInterviewDialog } from "./StartMockInterviewDialog";
import { PastSessionsList } from "./PastSessionsList";

// ── MockInterviewLauncher (Module 7C) ──
//
// The setup screen: readiness gating (identical rule to 7B — resume
// required, job description required for a standalone interview), the
// interviewer role picker (adaptive, always overridable), an optional focus
// field, the cost-aware Start confirmation, and this interview's mock
// interview history.

const textareaClass =
  "w-full rounded-lg border border-black/5 bg-white px-3 py-2 text-sm text-[oklch(0.2_0.02_265)] placeholder:text-[oklch(0.6_0.02_265)] focus:border-[#2563EB]/40 focus:outline-none focus:ring-2 focus:ring-[#2563EB]/10 transition-colors resize-none";

export function MockInterviewLauncher({ interview }: { interview: Interview }) {
  const navigate = useNavigate();
  const { data: credits } = useAICredits();
  const { data: sessions = [] } = useMockInterviewSessions(interview.id);
  const startMockInterview = useStartMockInterview();

  const [manualJobDescription, setManualJobDescription] = useState("");
  const [manualCompanyDescription, setManualCompanyDescription] = useState("");
  const [focus, setFocus] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);

  const roleFamily = useMemo(
    () => resolveRoleFamily(interview.role, manualJobDescription),
    [interview.role, manualJobDescription],
  );
  const [interviewerRole, setInterviewerRole] = useState(
    () => suggestedRoleFor(roleFamily, interview.type).id,
  );

  // Client-minted once per visit — the idempotency key that stops a
  // double-click or a retried request from charging 5 credits twice. See
  // MockInterviewAIService.startMockInterview.
  const [clientKey] = useState(() => crypto.randomUUID());

  const canStart =
    Boolean(interview.resume_id) && Boolean(interview.job_id || manualJobDescription.trim());

  function handleConfirm() {
    startMockInterview.mutate(
      {
        interviewId: interview.id,
        clientKey,
        interviewerRole,
        focus: focus.trim() || undefined,
        manualJobDescription: interview.job_id
          ? undefined
          : manualJobDescription.trim() || undefined,
        manualCompanyDescription: interview.job_id
          ? undefined
          : manualCompanyDescription.trim() || undefined,
      },
      {
        onSuccess: (res) => {
          if (!res.ok) return;
          setDialogOpen(false);
          void navigate({
            to: "/dashboard/interviews/$interviewId/mock/$sessionId",
            params: { interviewId: interview.id, sessionId: res.start.session.id },
          });
        },
        onError: () => setDialogOpen(false),
      },
    );
  }

  const startResult = startMockInterview.data;
  const startFailed = startResult && !startResult.ok ? startResult : null;
  // `startFailed` only covers a structured `{ok:false}` envelope. A thrown
  // exception (a genuine network failure, not an AI/credit result) previously
  // just closed the dialog with no message at all — the candidate saw the
  // form reappear with zero explanation for what happened. `isError` is
  // React Query's own flag for exactly that case.
  const startThrew = startMockInterview.isError && !startFailed;

  return (
    <div className="space-y-4">
      <MockInterviewReadiness
        interview={interview}
        manualJobDescription={manualJobDescription}
        manualCompanyDescription={manualCompanyDescription}
        onManualJobDescriptionChange={setManualJobDescription}
        onManualCompanyDescriptionChange={setManualCompanyDescription}
      />

      <DashCard>
        <SectionTitle>Who is interviewing you?</SectionTitle>
        <p className="mt-1 text-xs text-[oklch(0.5_0.02_265)]">
          Available roles adapt to this job and round — pick a different one any time.
        </p>
        <div className="mt-3">
          <InterviewerRolePicker
            family={roleFamily}
            round={interview.type}
            value={interviewerRole}
            onChange={setInterviewerRole}
          />
        </div>
      </DashCard>

      <DashCard>
        <label
          className="mb-1 block text-xs font-medium text-[oklch(0.4_0.02_265)]"
          htmlFor="mock-focus"
        >
          Anything specific you want tested?{" "}
          <span className="text-[oklch(0.6_0.02_265)]">(optional)</span>
        </label>
        <textarea
          id="mock-focus"
          value={focus}
          onChange={(e) => setFocus(e.target.value)}
          rows={2}
          placeholder='e.g. "Push me hard on system design", "Focus on my product sense", "Go easy on behavioral"'
          className={textareaClass}
        />
      </DashCard>

      {startFailed && (
        <AIErrorNotice code={startFailed.code} creditsRefunded={startFailed.creditsRefunded} />
      )}
      {startThrew && (
        <AIErrorNotice
          code={undefined}
          onRetry={handleConfirm}
          retrying={startMockInterview.isPending}
        />
      )}

      {sessions.length > 0 && (
        <div>
          <SectionTitle>
            <span className="flex items-center gap-1.5">
              <History className="h-3.5 w-3.5" /> Past mock interviews
            </span>
          </SectionTitle>
          <div className="mt-3">
            <PastSessionsList interviewId={interview.id} sessions={sessions} />
          </div>
        </div>
      )}

      {/* Sticky action bar. The setup form (job description, eight interviewer
          roles, focus field) is genuinely long, and a CTA sitting under all of
          it meant the primary action was off-screen on arrival — the one thing
          the page exists for. Pinning it to the bottom of the viewport keeps
          it reachable at every scroll position, and the bottom padding on the
          wrapper stops it covering the last card. */}
      <div className="sticky bottom-0 -mx-1 mt-2 border-t border-black/5 bg-[oklch(0.98_0.005_250)]/90 px-1 pb-3 pt-3 backdrop-blur-sm">
        <div className="rounded-2xl border border-[#2563EB]/15 bg-gradient-to-br from-[#2563EB]/[0.04] to-[#7C3AED]/[0.06] px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="min-w-0 flex-1 text-xs leading-relaxed text-[oklch(0.45_0.02_265)]">
              {canStart
                ? "Adapts to your answers in real time. Usually 20 to 30 minutes, and you can pause any time."
                : "Add the job description above to start."}
            </p>
            <DashButton
              className="shrink-0"
              disabled={!canStart}
              onClick={() => setDialogOpen(true)}
            >
              <Sparkles className="h-4 w-4" /> Start Mock Interview · {MOCK_INTERVIEW_CREDIT_COST}{" "}
              credits
            </DashButton>
          </div>
        </div>
      </div>

      <StartMockInterviewDialog
        open={dialogOpen}
        creditsRemaining={credits?.creditsRemaining ?? 0}
        isPending={startMockInterview.isPending}
        onConfirm={handleConfirm}
        onCancel={() => {
          if (startMockInterview.isPending) return;
          setDialogOpen(false);
        }}
      />
    </div>
  );
}
