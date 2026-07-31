import type { TurnAction } from "./schema";

// ── Follow-up budgeting (Module 7C, realism pass) ──
//
// A real interviewer digs, but not forever — after a couple of follow-ups they
// have what they need and move on, because breadth matters as much as depth in
// a 20-30 minute conversation. Left to itself the model happily probes the
// same thread five or six times, which reads as an interrogation and burns the
// whole interview on one competency.
//
// The cap can't be a schema constraint (the model picks the action, and a
// rejected action would leave the turn with no message), so instead the server
// COUNTS what has already happened and states the remaining budget as a fact
// in the next turn's prompt. That is far more reliable than asking the model
// to keep its own tally across turns, and it stays honest: if the model
// ignores the instruction the transcript still shows what really happened,
// rather than the server silently rewriting the conversation.

/** Actions that dig further into the question already on the table. */
const FOLLOW_UP_ACTIONS: ReadonlySet<TurnAction> = new Set<TurnAction>([
  "probe",
  "challenge",
  "clarify",
  "example",
  "cross_reference",
  "follow_up",
]);

/**
 * Actions that START a fresh thread (or end the interview), resetting the
 * budget. `answer_candidate_question` counts as a boundary rather than a
 * follow-up: the interviewer stepped out of their own line of questioning to
 * answer something, and what follows is a fresh question, not a deeper one.
 */
const THREAD_BOUNDARY_ACTIONS: ReadonlySet<TurnAction> = new Set<TurnAction>([
  "open",
  "new_competency",
  "answer_candidate_question",
  "close",
]);

export const MAX_FOLLOW_UPS_PER_QUESTION = 2;

export function isFollowUpAction(action: TurnAction): boolean {
  return FOLLOW_UP_ACTIONS.has(action);
}

export type TurnActionLike = { action: string | null };

/**
 * How many follow-ups have already been asked on the thread currently open,
 * counted backwards from the most recent turn until a thread boundary.
 *
 * Turns with no recorded action (legacy rows, or a degraded model response)
 * are treated as boundaries rather than follow-ups — the conservative
 * direction, since guessing "follow-up" would silently shrink the budget and
 * cut a legitimate probe short.
 */
export function countConsecutiveFollowUps(turns: readonly TurnActionLike[]): number {
  let count = 0;
  for (let i = turns.length - 1; i >= 0; i--) {
    const action = turns[i].action as TurnAction | null;
    if (!action) break;
    if (THREAD_BOUNDARY_ACTIONS.has(action)) break;
    if (FOLLOW_UP_ACTIONS.has(action)) {
      count += 1;
      continue;
    }
    break;
  }
  return count;
}

/** Follow-ups still available on the current thread, floored at 0. */
export function remainingFollowUpBudget(turns: readonly TurnActionLike[]): number {
  return Math.max(0, MAX_FOLLOW_UPS_PER_QUESTION - countConsecutiveFollowUps(turns));
}
