// ── Friendly AI error copy (Module 6B refinement, restructured in 6G) ──
//
// A single place that turns a structured result `code` into calm, user-facing
// copy. The AI engine's raw messages can carry provider/OpenAI internals
// (rate-limit strings, model ids, stack-ish text) — those must NEVER reach a
// job seeker. The UI always renders the mapped message for a known code and
// only ever falls back to a generic line, never to the raw server text.
//
// 6G splits each entry into a headline + what-to-do body + whether a retry
// button makes sense, so every AI surface can show the SAME three-part error
// instead of each one inventing its own single-line phrasing. `friendlyAIError`
// is kept as the one-line accessor for toasts and tight spaces.

export type AIErrorCopy = {
  /** Short headline — what happened, in the user's terms. */
  title: string;
  /** What they can do about it. One or two plain sentences. */
  body: string;
  /**
   * Whether re-running the same request could plausibly succeed. False for
   * states the user must resolve first (no credits, resume not ready).
   */
  retryable: boolean;
};

const COPY_BY_CODE: Record<string, AIErrorCopy> = {
  // ── Engine / provider failures — vague and reassuring, never technical ──
  provider_error: {
    title: "The AI service is busy right now",
    body: "This usually clears within a minute. Try again in a moment.",
    retryable: true,
  },
  validation_error: {
    title: "We couldn't finish this AI request",
    body: "The result came back incomplete. Running it again normally fixes it.",
    retryable: true,
  },
  config_error: {
    title: "AI is temporarily unavailable",
    body: "We're working on it. Please try again a little later.",
    retryable: false,
  },
  unknown_error: {
    title: "We couldn't complete this AI request",
    body: "Something went wrong on our side. Please try again.",
    retryable: true,
  },
  error: {
    title: "We couldn't complete this AI request",
    body: "Something went wrong on our side. Please try again.",
    retryable: true,
  },

  // ── Credits ──
  ai_limit_reached: {
    title: "You've used all your AI credits",
    body: "Upgrade to keep analyzing, optimizing and writing with AI.",
    retryable: false,
  },

  // ── Resume-state guards ──
  resume_not_found: {
    title: "That resume is no longer available",
    body: "Pick another resume and try again.",
    retryable: false,
  },
  resume_not_ready: {
    title: "Your resume isn't ready yet",
    body: "It needs to finish processing first. Check it in Resumes, then come back.",
    retryable: false,
  },

  // ── Cover Letter Studio (Module 6E) ──
  job_not_found: {
    title: "That job is no longer available",
    body: "Pick another job and try again.",
    retryable: false,
  },
  empty_letter: {
    title: "There's nothing to edit yet",
    body: "Generate a letter first, then AI actions become available.",
    retryable: false,
  },
  session_required: {
    title: "This editing session has ended",
    body: "Start a new generation to keep editing this letter with AI.",
    retryable: false,
  },
};

const GENERIC: AIErrorCopy = {
  title: "We couldn't complete this AI request",
  body: "Something went wrong on our side. Please try again.",
  retryable: true,
};

/**
 * Three-part copy for a structured AI result code. Ignores any raw server
 * message on purpose — pass only the `code`. Unknown codes get the generic
 * entry, which is retryable (an unrecognized failure is more often transient
 * than terminal, and a retry that fails again costs nothing).
 */
export function aiErrorCopy(code: string | undefined): AIErrorCopy {
  if (!code) return GENERIC;
  return COPY_BY_CODE[code] ?? GENERIC;
}

/**
 * One-line version, for toasts and anywhere too tight for the full notice.
 * Same source of truth as `aiErrorCopy`.
 */
export function friendlyAIError(code: string | undefined): string {
  const copy = aiErrorCopy(code);
  return `${copy.title}. ${copy.body}`;
}

/**
 * The reassurance line shown under an error. Only ever returned when the engine
 * CONFIRMED the run cost nothing (see AIErrorResult.creditsRefunded) — an
 * unconfirmed refund shows no line at all rather than a promise we can't back.
 */
export function creditsReassurance(creditsRefunded: boolean | undefined): string | null {
  return creditsRefunded === true ? "No credit was used." : null;
}
