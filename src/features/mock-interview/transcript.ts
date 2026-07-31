// ── Transcript prompt budget (Module 7C) ──
//
// Keeps a growing live-interview prompt bounded without losing the
// interviewer's "memory" of the conversation. The candidate's ANSWERS are the
// evidence the live-turn prompt reasons over, so recent ones stay verbatim;
// `rollingSummary` (produced fresh by every turn — see schema.ts) is what
// carries everything older forward. Practically, most sessions (12-25 turns)
// never reach the point where anything gets compressed.

export const VERBATIM_TAIL_TURNS = 12;
export const MAX_ANSWER_CHARS_IN_PROMPT = 2000;

export type TranscriptTurnLike = {
  turn_index: number;
  interviewer_message: string;
  candidate_answer: string | null;
};

/** Truncates one answer for prompt inclusion — never mutates the stored value, only what the model sees. */
export function truncateAnswerForPrompt(
  answer: string,
  maxChars: number = MAX_ANSWER_CHARS_IN_PROMPT,
): string {
  if (answer.length <= maxChars) return answer;
  return `${answer.slice(0, maxChars)}… (truncated)`;
}

/**
 * Splits a turn list into the verbatim recent tail and the older, compressed
 * remainder. `compressed` turns are rendered by the caller as just
 * `question + one-line gist` (see prompt.ts), never their full answer text —
 * `rollingSummary` is what actually carries their substance forward.
 */
export function splitTranscriptForPrompt<T extends TranscriptTurnLike>(
  turns: T[],
  tailSize: number = VERBATIM_TAIL_TURNS,
): { compressed: T[]; verbatim: T[] } {
  if (turns.length <= tailSize) return { compressed: [], verbatim: turns };
  return {
    compressed: turns.slice(0, turns.length - tailSize),
    verbatim: turns.slice(turns.length - tailSize),
  };
}
