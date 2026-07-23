// ── Friendly AI error copy (Module 6B refinement) ──
//
// A single place that turns a structured result `code` into calm, user-facing
// copy. The AI engine's raw messages can carry provider/OpenAI internals
// (rate-limit strings, model ids, stack-ish text) — those must NEVER reach a
// job seeker. The UI always renders the mapped message for a known code and
// only ever falls back to a generic line, never to the raw server text.

const FRIENDLY_BY_CODE: Record<string, string> = {
  // Engine / provider failures — keep vague and reassuring, never technical.
  provider_error: "The AI service is busy right now. Please try again in a moment.",
  validation_error: "We couldn't read the AI's response this time. Please try again.",
  config_error: "AI analysis is temporarily unavailable. Please try again later.",
  unknown_error: "Something went wrong running your analysis. Please try again.",
  error: "Something went wrong. Please try again.",
  // Credits.
  ai_limit_reached: "You've used all your AI credits.",
  // Resume-state guards (already user-friendly, restated here for one source of truth).
  resume_not_found: "That resume is no longer available. Pick another resume and try again.",
  resume_not_ready: "Finish preparing your resume before analyzing a match.",
};

const GENERIC = "Something went wrong. Please try again.";

/**
 * Friendly message for a structured AI result code. Ignores any raw server
 * message on purpose — pass only the `code`. Unknown codes get the generic line.
 */
export function friendlyAIError(code: string | undefined): string {
  if (!code) return GENERIC;
  return FRIENDLY_BY_CODE[code] ?? GENERIC;
}
