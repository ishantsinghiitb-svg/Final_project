import type { MockInterviewSession } from "./types";

// ── Interview timer (Module 7C) ──
//
// Pure functions only — the studio's timer is a display of SERVER state, not
// a client-side stopwatch. `elapsed_ms` accumulates whatever time was already
// banked before the session's current active/paused segment; `last_resumed_at`
// marks when the CURRENTLY RUNNING segment began, and is null while paused or
// ended. This makes elapsed time correct across refresh, pause/resume, and a
// tab left in the background — it is always recomputed from timestamps, never
// carried in local component state.

export function elapsedMs(
  session: Pick<MockInterviewSession, "status" | "elapsed_ms" | "last_resumed_at">,
  now: number = Date.now(),
): number {
  if (session.status !== "active" || !session.last_resumed_at) {
    return session.elapsed_ms;
  }
  const runningMs = now - new Date(session.last_resumed_at).getTime();
  return session.elapsed_ms + Math.max(0, runningMs);
}

export function formatElapsed(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/** Whether a paused session has sat long enough to auto-conclude on open (see MOCK_INTERVIEW_RESUME_WINDOW_DAYS). */
export function isPastResumeWindow(
  session: Pick<MockInterviewSession, "status" | "updated_at">,
  windowDays: number,
  now: number = Date.now(),
): boolean {
  if (session.status !== "paused" && session.status !== "active") return false;
  const staleMs = now - new Date(session.updated_at).getTime();
  return staleMs > windowDays * 24 * 60 * 60 * 1000;
}
