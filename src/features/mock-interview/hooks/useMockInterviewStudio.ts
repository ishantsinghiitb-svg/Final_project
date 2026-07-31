import { useEffect, useRef } from "react";
import {
  useEndMockInterview,
  useGenerateMockInterviewReport,
  useMockInterviewSession,
  useMockInterviewTurns,
  usePauseMockInterview,
  useResumeMockInterview,
  useSubmitMockInterviewAnswer,
} from "./index";
import { useInterviewTimer } from "./useInterviewTimer";
import { useInterviewVoice } from "../voice/useInterviewVoice";
import { formatElapsed } from "../timer";
import { MOCK_INTERVIEW_MAX_REPORT_ATTEMPTS } from "../constants";
import type { AnswerInputMode } from "../types";

// ── useMockInterviewStudio (Module 7C) ──
//
// The studio's brain: composes the session/turns queries, the free-action
// mutations, the timer, and voice into one object so no studio component
// takes more than a couple of props. Two things it does on its own besides
// wiring:
//   • Speaks a new interviewer message aloud as soon as it appears (subject
//     to the user's voice preference) and suspends the mic while doing so —
//     the mic-suspend half is handled inside the voice transport itself.
//   • Auto-triggers report generation exactly once when the session
//     transitions to concluded with no report yet, so ending the interview
//     (by the user or the AI) always flows straight into "Putting your
//     evaluation together" without a separate button press.
//
// Server state is authoritative throughout — this hook derives `phase` from
// what the session/turns queries actually say, never from a locally-guessed
// timeline.

export type StudioPhase = "loading" | "active" | "paused" | "concluding" | "report_ready";

export function useMockInterviewStudio(sessionId: string | undefined) {
  const sessionQuery = useMockInterviewSession(sessionId);
  const turnsQuery = useMockInterviewTurns(sessionId);
  const session = sessionQuery.data;
  const turns = turnsQuery.data ?? [];
  const currentTurn = turns.length > 0 ? turns[turns.length - 1] : null;

  const submitAnswerMutation = useSubmitMockInterviewAnswer();
  const pauseMutation = usePauseMockInterview();
  const resumeMutation = useResumeMockInterview();
  const endMutation = useEndMockInterview();
  const reportMutation = useGenerateMockInterviewReport();

  const elapsed = useInterviewTimer(session);
  const voice = useInterviewVoice();

  let phase: StudioPhase = "loading";
  if (session) {
    if (session.status === "paused") phase = "paused";
    else if (session.status === "concluded") phase = session.report ? "report_ready" : "concluding";
    else phase = "active";
  }

  // Auto-generate the report exactly once per session reaching "concluding".
  const reportTriggeredForSession = useRef<string | null>(null);
  useEffect(() => {
    if (phase !== "concluding" || !sessionId) return;
    if (reportTriggeredForSession.current === sessionId) return;
    if (reportMutation.isPending) return;
    reportTriggeredForSession.current = sessionId;
    reportMutation.mutate({ sessionId });
  }, [phase, sessionId, reportMutation]);

  // Speak each new interviewer message as it appears.
  const spokenTurnId = useRef<string | null>(null);
  useEffect(() => {
    if (!currentTurn || phase !== "active") return;
    if (currentTurn.candidate_answer != null) return; // already answered — nothing new to speak
    if (spokenTurnId.current === currentTurn.id) return;
    spokenTurnId.current = currentTurn.id;
    void voice.speak(currentTurn.interviewer_message);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTurn?.id, phase]);

  // Hard stop on every non-active phase. The explicit teardown in
  // endInterview() only covers the candidate pressing End — an interview the
  // AI concludes on its own, or one that hits a server-side limit, arrives
  // here purely as a status change, and without this the interviewer would
  // keep talking over the concluding screen and the report.
  useEffect(() => {
    if (phase === "active" || phase === "loading") return;
    voice.cancelSpeak();
    voice.stopListening();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  function submitAnswer(answer: string, inputMode: AnswerInputMode) {
    if (!sessionId || !currentTurn) return;
    voice.cancelSpeak();
    submitAnswerMutation.mutate({
      sessionId,
      turnIndex: currentTurn.turn_index,
      answer,
      inputMode,
    });
  }

  function skipQuestion() {
    submitAnswer("", "skipped");
  }

  /**
   * The interview is live and the candidate's answer is safely stored, but the
   * interviewer never replied — the AI call for the next turn failed, timed
   * out, or the tab closed mid-request.
   *
   * The server saves the answer BEFORE calling the provider precisely so this
   * state is recoverable, and `submitAnswer` detects "already answered, no
   * successor" and resumes from there. Without an affordance for it, though,
   * the composer is hidden (it only renders for an unanswered turn) and the
   * candidate is stranded on a page with no way forward — which is exactly
   * what a timeout used to produce.
   */
  const needsTurnRecovery =
    phase === "active" &&
    Boolean(currentTurn) &&
    currentTurn!.candidate_answer != null &&
    !submitAnswerMutation.isPending;

  /** Re-issues the failed turn. Idempotent server-side; the stored answer is reused, never re-saved or lost. */
  function retryTurn() {
    if (!sessionId || !currentTurn) return;
    submitAnswerMutation.mutate({
      sessionId,
      turnIndex: currentTurn.turn_index,
      answer: currentTurn.candidate_answer ?? "",
      inputMode: currentTurn.answer_input_mode ?? "text",
    });
  }

  function pause() {
    if (!sessionId) return;
    voice.cancelSpeak();
    voice.stopListening();
    pauseMutation.mutate(sessionId);
  }

  function resume() {
    if (!sessionId) return;
    resumeMutation.mutate(sessionId);
  }

  function endInterview() {
    if (!sessionId) return;
    voice.cancelSpeak();
    voice.stopListening();
    endMutation.mutate(sessionId);
  }

  function retryReport() {
    if (!sessionId) return;
    reportMutation.mutate({ sessionId, regenerate: false });
  }

  // Both mutations RESOLVE a structured `{ ok: false, code, ... }` envelope on
  // a business-logic failure rather than throwing — only a genuine network/
  // unexpected exception sets React Query's own `isError`. So a failure to
  // show the user is read from `.data`, not `.isError`.
  const submitFailure =
    submitAnswerMutation.data && !submitAnswerMutation.data.ok ? submitAnswerMutation.data : null;
  const reportFailure = reportMutation.data && !reportMutation.data.ok ? reportMutation.data : null;
  // A thrown exception (dropped connection, tab backgrounded mid-request)
  // previously surfaced nothing at all: `submitFailure` only covers a
  // resolved `{ok:false}` envelope. The composer already safely reappears
  // empty in this state (the turns cache was never touched, so the current
  // turn still reads as unanswered) — this only adds the missing explanation.
  // Deliberately no retry action wired to it: whether the server actually
  // saved the answer before the connection dropped is unknown from here, and
  // the reappeared composer is already the correct, safe way to try again.
  const submitThrew = submitAnswerMutation.isError && !submitFailure;
  const reportThrew = reportMutation.isError && !reportFailure;
  // Once the server's retry cap is hit, offering an unconditional "Try again"
  // on the concluding screen is a dead-end loop — it will fail identically
  // forever on a route with no chrome to escape through. Mirrors the same
  // check MockInterviewReport.tsx uses for the report page's own copy.
  const reportAttemptsExhausted = Boolean(
    session && session.report_attempts >= MOCK_INTERVIEW_MAX_REPORT_ATTEMPTS && !session.report,
  );

  return {
    session,
    turns,
    currentTurn,
    phase,
    isLoading: sessionQuery.isLoading || turnsQuery.isLoading,
    elapsedMs: elapsed,
    elapsedDisplay: formatElapsed(elapsed),
    voice,
    submitAnswer,
    skipQuestion,
    needsTurnRecovery,
    retryTurn,
    isSubmitting: submitAnswerMutation.isPending,
    submitFailure,
    submitThrew,
    resetSubmitFailure: submitAnswerMutation.reset,
    pause,
    resume,
    isPausing: pauseMutation.isPending,
    isResuming: resumeMutation.isPending,
    endInterview,
    isEnding: endMutation.isPending,
    reportFailure,
    reportThrew,
    reportAttemptsExhausted,
    retryReport,
  };
}
