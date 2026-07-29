// ── Cover Letter draft persistence (Module 6E) ──
//
// The Studio's editor is explicitly Save-based: unsaved edits are the user's
// work in progress and must survive a refresh, a closed tab or an accidental
// navigation. The editor buffer is mirrored into localStorage on every change
// and restored when the Studio reopens, alongside the saved version from the
// database — the user is told a newer unsaved draft exists and chooses.
//
// Client-side by design (mirrors features/optimizer/draft.ts): zero migration,
// zero writes to the database until the user actually saves.

export type CoverLetterDraft = {
  content: string;
  /** ISO timestamp of the last keystroke — shown in the "unsaved draft" banner. */
  savedAt: string;
  /** The version the draft was branched from, so a stale draft can be detected. */
  baseVersionId: string | null;
};

const storageKey = (coverLetterId: string) => `nextoffer:cover-letter-draft:${coverLetterId}`;

export function loadCoverLetterDraft(coverLetterId: string): CoverLetterDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(storageKey(coverLetterId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CoverLetterDraft;
    // Defend against a shape change / corrupt entry — a bad draft must never
    // crash the Studio or replace a good saved letter with garbage.
    if (!parsed || typeof parsed.content !== "string") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveCoverLetterDraft(coverLetterId: string, draft: CoverLetterDraft): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey(coverLetterId), JSON.stringify(draft));
  } catch {
    /* quota exceeded / storage disabled — non-fatal, in-memory state still works */
  }
}

export function clearCoverLetterDraft(coverLetterId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(storageKey(coverLetterId));
  } catch {
    /* non-fatal */
  }
}
