import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Loader2, RefreshCw } from "lucide-react";
import { AIErrorNotice } from "@/components/dashboard/ai/AIErrorNotice";
import { cn } from "@/lib/utils";
import { useMockInterviewStudio } from "@/features/mock-interview/hooks/useMockInterviewStudio";
import type { Interview } from "@/types";
import { StudioTopBar } from "./StudioTopBar";
import { InterviewerStage } from "./InterviewerStage";
import { AnswerComposer } from "./AnswerComposer";
import { TranscriptPanel } from "./TranscriptPanel";
import { PauseOverlay } from "./PauseOverlay";
import { EndInterviewDialog } from "./EndInterviewDialog";
import { ConcludingScreen } from "./ConcludingScreen";

// ── MockInterviewStudio (Module 7C) ──
//
// The immersive, full-screen interview experience — rendered by a route that
// deliberately escapes the dashboard shell (see the `dashboard_` route file).
// One question on screen at a time, never a chat log; see
// InterviewerStage/TranscriptPanel for why. Server state is authoritative
// throughout (useMockInterviewStudio derives everything from the session/
// turns queries), so refresh, pause/resume, and a second tab all reconcile
// correctly without any locally-guessed timeline.

export function MockInterviewStudio({
  interview,
  sessionId,
}: {
  interview: Interview;
  sessionId: string;
}) {
  const navigate = useNavigate();
  const studio = useMockInterviewStudio(sessionId);
  const [endDialogOpen, setEndDialogOpen] = useState(false);

  // Best-effort priming for the browser's audio-unlock requirement (notably
  // iOS Safari) — this mount is itself the direct result of the candidate's
  // "Start Mock Interview" click on the launcher, which is as close to a
  // user-gesture context as a page navigation allows.
  useEffect(() => {
    void studio.voice.init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Navigating during render (rather than in an effect) triggers React's
  // "Cannot update a component while rendering a different component"
  // warning here, since TanStack Router's navigate() updates the router's
  // own Transitioner state — caught live via a real console warning during
  // E2E testing.
  useEffect(() => {
    if (studio.phase !== "report_ready") return;
    void navigate({
      to: "/dashboard/interviews/$interviewId/mock/$sessionId/report",
      params: { interviewId: interview.id, sessionId },
      replace: true,
    });
  }, [studio.phase, navigate, interview.id, sessionId]);

  if (studio.phase === "loading" || !studio.session || studio.phase === "report_ready") {
    return (
      <div className="grid min-h-screen place-items-center bg-[oklch(0.1_0.02_265)]">
        <Loader2 className="h-6 w-6 animate-spin text-white/40" />
      </div>
    );
  }

  if (studio.phase === "concluding") {
    return (
      <div className="flex min-h-screen flex-col bg-[oklch(0.1_0.02_265)]">
        <ConcludingScreen hasError={Boolean(studio.reportFailure)} onRetry={studio.retryReport} />
      </div>
    );
  }

  const currentTurn = studio.currentTurn;
  const isThinking = studio.isSubmitting || !currentTurn || currentTurn.candidate_answer != null;
  const displayMessage = !isThinking && currentTurn ? currentTurn.interviewer_message : "";

  return (
    // Fixed to the viewport rather than min-height: the composer and its
    // controls must never be pushed below the fold on a short laptop screen,
    // which is what forced candidates to scroll (or zoom out) to press Send.
    // The stage between the bar and the composer takes the remaining space and
    // scrolls internally instead.
    <div className="flex h-dvh flex-col overflow-hidden bg-[oklch(0.1_0.02_265)]">
      <StudioTopBar
        companyName={interview.company_name}
        roundLabel={studio.session.round_label}
        elapsedDisplay={studio.elapsedDisplay}
        plan={studio.session.plan}
        coverage={studio.session.coverage.competencies}
        currentCompetencyId={currentTurn?.target_competency ?? null}
        onPause={studio.pause}
        isPausing={studio.isPausing}
        onEnd={() => setEndDialogOpen(true)}
      />

      {studio.phase === "paused" ? (
        <PauseOverlay
          elapsedDisplay={studio.elapsedDisplay}
          onResume={studio.resume}
          isResuming={studio.isResuming}
        />
      ) : (
        <>
          {/* min-h-0 is what actually lets this shrink inside the flex column —
              without it the stage refuses to go below its content height and
              pushes the composer off-screen instead of scrolling. */}
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
            <InterviewerStage
              interviewerLabel={studio.session.interviewer_role_label}
              message={displayMessage}
              isSpeaking={studio.voice.speaking}
              isThinking={isThinking}
              // Explicit user action, so it speaks even when auto-speak is
              // muted — see useInterviewVoice.speak's `force`.
              onReplay={() => displayMessage && studio.voice.speak(displayMessage, { force: true })}
              canReplay={Boolean(displayMessage) && studio.voice.capabilities.synthesis}
            />

            {studio.submitFailure && (
              <div className="mx-auto w-full max-w-4xl px-4 md:px-6">
                <AIErrorNotice
                  code={studio.submitFailure.code}
                  creditsRefunded={studio.submitFailure.creditsRefunded}
                  // Actually re-issue the turn rather than merely dismissing.
                  // The answer is already stored server-side, so this resumes
                  // exactly where it stopped and costs no credits.
                  onRetry={studio.retryTurn}
                  retryLabel="Try again"
                  retrying={studio.isSubmitting}
                />
              </div>
            )}

            {/* Reached after a failed or timed-out turn once the answer is
                saved: the composer is gone (the turn is answered) but no
                question arrived, so this is the only way forward. */}
            {studio.needsTurnRecovery && !studio.submitFailure && (
              <div className="mx-auto w-full max-w-4xl px-4 md:px-6">
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3">
                  <p className="min-w-0 flex-1 text-sm text-white/70">
                    Your answer was saved, but the interviewer didn't respond. Nothing is lost —
                    pick up right where you left off.
                  </p>
                  <button
                    onClick={studio.retryTurn}
                    disabled={studio.isSubmitting}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-gradient-to-br from-[#2563EB] to-[#7C3AED] px-3.5 py-1.5 text-sm font-semibold text-white transition-transform hover:-translate-y-px disabled:opacity-60"
                  >
                    <RefreshCw
                      className={cn("h-3.5 w-3.5", studio.isSubmitting && "animate-spin")}
                    />
                    Continue interview
                  </button>
                </div>
              </div>
            )}

            <div className="mt-auto pb-2">
              <TranscriptPanel turns={studio.turns} />
            </div>
          </div>

          {currentTurn && currentTurn.candidate_answer == null && (
            <AnswerComposer
              sessionId={sessionId}
              turnIndex={currentTurn.turn_index}
              voice={studio.voice}
              onSubmit={studio.submitAnswer}
              onSkip={studio.skipQuestion}
              isSubmitting={studio.isSubmitting}
              disabled={studio.isSubmitting}
            />
          )}
        </>
      )}

      <EndInterviewDialog
        open={endDialogOpen}
        isPending={studio.isEnding}
        onConfirm={() => {
          studio.endInterview();
          setEndDialogOpen(false);
        }}
        onCancel={() => setEndDialogOpen(false)}
      />
    </div>
  );
}
