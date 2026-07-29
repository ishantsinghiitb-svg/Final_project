// ── AI loading phases (Module 6G) ──
//
// The narration shown while an AI request is in flight. These lines are
// deliberately NOT a mirror of the internal pipeline — they describe the work
// the way a job seeker would understand it, so a 20-second wait reads as
// careful work rather than a frozen spinner.
//
// Rules for editing these:
//   • plain language, no model/provider/prompt/token wording
//   • present continuous, one idea per line
//   • the last line is the one that "holds" if the request runs long, so it
//     must stay true no matter how long it takes (a wrap-up line, never a
//     promise that the result is a second away)
//
// Timing lives with the copy on purpose: a phase list and its pacing are one
// design decision. `holdMs` is how long each line stays before the next; the
// final line has no successor and simply remains.

import { AI_CAPABILITIES, type ShippedAICapability } from "@/features/ai/constants";

export type AILoadingPhase = {
  /** User-facing line. */
  label: string;
  /** How long this line stays on screen before advancing, in ms. */
  holdMs: number;
};

/**
 * Phase scripts per capability. Total scripted time is ~2-3s short of each
 * feature's typical latency so the final line is reached, not skipped — and
 * the final line is a safe "still working" statement if the request runs long.
 *
 * Keyed by `ShippedAICapability`, not `AICapability`: user-facing copy must
 * only exist for capabilities a user can actually reach. (An earlier version
 * of this file carried a script for `interview_prep`, which has no screen —
 * copy written for a surface that does not exist.)
 */
const PHASES: Record<ShippedAICapability, AILoadingPhase[]> = {
  [AI_CAPABILITIES.RESUME_MATCH]: [
    { label: "Reading your resume…", holdMs: 2600 },
    { label: "Understanding what this job needs…", holdMs: 3000 },
    { label: "Finding your strongest experiences…", holdMs: 3400 },
    { label: "Weighing them against recruiter expectations…", holdMs: 3800 },
    { label: "Putting your match report together…", holdMs: 6000 },
  ],
  [AI_CAPABILITIES.ATS_SCORE]: [
    { label: "Reading your resume…", holdMs: 2600 },
    { label: "Pulling the keywords this job screens for…", holdMs: 3200 },
    { label: "Checking how an applicant tracking system reads your file…", holdMs: 3800 },
    { label: "Scoring keyword coverage and formatting…", holdMs: 3800 },
    { label: "Writing up what to fix first…", holdMs: 6000 },
  ],
  [AI_CAPABILITIES.RESUME_OPTIMIZER]: [
    { label: "Reading your resume end to end…", holdMs: 3000 },
    { label: "Comparing it to strong resumes in this field…", holdMs: 3800 },
    { label: "Looking for weak wording and missing impact…", holdMs: 4200 },
    { label: "Drafting specific rewrites you can accept or skip…", holdMs: 4600 },
    { label: "Double-checking every suggestion against your real experience…", holdMs: 5200 },
    { label: "Finishing your improvement plan…", holdMs: 8000 },
  ],
  [AI_CAPABILITIES.COVER_LETTER]: [
    { label: "Reading the job posting closely…", holdMs: 2800 },
    { label: "Looking for what this company actually cares about…", holdMs: 3400 },
    { label: "Picking the experiences worth writing about…", holdMs: 3800 },
    { label: "Choosing the story your letter should tell…", holdMs: 4000 },
    { label: "Writing your draft…", holdMs: 5000 },
    { label: "Reading it back for tone and honesty…", holdMs: 8000 },
  ],
};

/** Phase script for a shipped capability. Never empty. */
export function loadingPhasesFor(capability: ShippedAICapability): AILoadingPhase[] {
  return PHASES[capability];
}
