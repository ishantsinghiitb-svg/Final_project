import type { OptimizationResult, SuggestionDecision } from "./types";

// ── Optimizer draft persistence (Module 6E · Transformation Coach) ──
//
// The AI work for an optimization is expensive (a credit + two model passes),
// so it must never be lost just because the user navigated away before saving.
// The moment an optimization completes, the full result + the user's in-progress
// accept/reject decisions are written here; returning to the studio restores the
// review exactly where they left off. Client-side (localStorage) by design — a
// zero-migration draft that survives refreshes and accidental closes. (A durable,
// cross-device Draft/Applied/Discarded row in Resume History is a separate,
// DB-backed enhancement.)

export type OptimizerDraft = {
  result: OptimizationResult;
  decisions: Record<string, SuggestionDecision>;
  /** ISO timestamp of the last edit — shown in the "resume draft" prompt. */
  savedAt: string;
};

const storageKey = (resumeId: string) => `nextoffer:optimizer-draft:${resumeId}`;

export function loadOptimizerDraft(resumeId: string): OptimizerDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(storageKey(resumeId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as OptimizerDraft;
    // Defend against a shape change / corrupt entry — a bad draft must never crash the studio.
    if (!parsed || !parsed.result || !Array.isArray(parsed.result.suggestions)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveOptimizerDraft(resumeId: string, draft: OptimizerDraft): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey(resumeId), JSON.stringify(draft));
  } catch {
    /* quota exceeded / storage disabled — non-fatal, the in-memory state still works */
  }
}

export function clearOptimizerDraft(resumeId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(storageKey(resumeId));
  } catch {
    /* non-fatal */
  }
}
