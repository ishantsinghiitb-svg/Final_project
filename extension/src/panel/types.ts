/**
 * Shared panel types — kept separate from `FloatingPanel.tsx` so section
 * components (`sections/*`) can import them without importing the panel
 * component itself.
 */

import type { ResumeMatchSummary, ResumeOption } from "../shared/messaging/types";

export type PanelJob = {
  title: string;
  companyName: string;
  companyLogoUrl: string | null;
  location: string | null;
  workMode: string | null;
  employmentType: string | null;
  isClosed: boolean;
  /**
   * Module 6B/6C — the user's ready resumes (default first) for the Resume
   * Match selector. Empty when the user has no analyzable resume; the selector
   * then hides and the row falls back to a single "Analyze Match" prompt.
   */
  resumes: ResumeOption[];
  /**
   * Cached match for `resumes[0]` (the default / most-recent ready resume) —
   * score + plain-language label only, never the full analysis. `null` = that
   * resume hasn't been analyzed for this job yet. Selecting a different resume
   * fetches its own cached match (see PanelActions.onFetchResumeMatch).
   */
  resumeMatch: ResumeMatchSummary | null;
  /** Remaining AI credits shown in the AI Job Match section. `null` = unknown. */
  credits: number | null;
};

/**
 * `loading`/`not-logged-in` are system states; `ready`/`saved`/`tracked` are
 * the three CTA states the redesigned panel cycles through as the user
 * interacts with a job (see `sections/CtaRow.tsx`).
 *
 * `no-job`: the host HAS a dedicated parser, but the current page has no
 * single job to save right now — a listing/search page, a company/profile
 * page, or a job modal that's closed. The panel stays mounted showing an
 * informational "no job detected" message instead of unmounting, so the
 * extension never disappears while the user is on a supported site (it
 * re-populates automatically the moment a job becomes active). Carries no
 * `job`.
 *
 * `unsupported-hiring-page`: the page has hiring-page signals (see
 * `core/site-detection/hiringPageSignals.ts`) but no dedicated parser exists
 * for this host — informational only, never backed by an actual parse (the
 * Generic Parser that used to fill this gap was decommissioned from
 * production). No job/CTA data exists for it, so — unlike
 * `ready`/`saved`/`tracked` — it carries no `job`.
 */
export type PanelViewState =
  | { kind: "loading" }
  | { kind: "not-logged-in" }
  | { kind: "ready"; job: PanelJob }
  | { kind: "saved"; job: PanelJob }
  | { kind: "tracked"; job: PanelJob }
  | { kind: "no-job" }
  | { kind: "unsupported-hiring-page" }
  /**
   * This script's extension context has been invalidated (the extension was
   * reloaded/updated while this page stayed open) — see
   * `ExtensionContextInvalidatedError`. Distinct from `no-job` on purpose: a
   * dead context is not "nothing to detect here," it's "nothing is running to
   * detect it," and only a page refresh (never a code path) can fix it.
   */
  | { kind: "extension-invalidated" };

/** Which in-flight action should disable buttons and swap in a loading label. */
export type PendingAction = "save" | "applyAndTrack" | "track" | null;

export type PanelActions = {
  /**
   * Primary CTA for `ready` — saves (if needed) + tracks the application.
   * Never redirects the user off the current page; LinkedIn's own "Apply"
   * button remains how the user actually submits the application.
   */
  onApplyAndTrack: () => void;
  /** Secondary CTA for `ready` only — bookmarks without applying. */
  onSaveForLater: () => void;
  /** Primary CTA for `saved` — the job is already saved, so this only creates the tracked application. */
  onTrackApplication: () => void;
  /** Secondary CTA for `saved`/`tracked` — deep-links to the job/application in the dashboard. */
  onViewInNextOffer: () => void;
  /** `not-logged-in` only — opens the NextOffer app root. */
  onOpenInNextOffer: () => void;
  /**
   * "View Details" — deep-links to this job's dashboard page for the selected
   * resume (`?resume=`). Detailed breakdown (strengths/improvements/summary/
   * history) is dashboard-only by design; this is navigation only, never a
   * credit spend.
   */
  onViewMatchDetails: (resumeId: string | null) => void;
  /**
   * Runs the analysis DIRECTLY from the extension — no dashboard visit
   * required. Calls the extension API route (`/api/extension/analyze-match`),
   * which reuses `ResumeMatchService.analyzeResumeMatch` exactly (same engine,
   * cache, versioning, and AI-Credit accounting the dashboard uses — no
   * duplicated AI logic). The caller must show its own confirmation before
   * invoking this; it never confirms on its own and always charges a credit
   * unless the engine serves an identical-input cache hit.
   */
  onAnalyzeMatch: (
    resumeId: string,
    forceRefresh: boolean,
  ) => Promise<
    | { ok: true; score: number; label: string; creditsRemaining: number }
    | { ok: false; code: string; message: string }
  >;
  /**
   * Read the cached match for a specific resume when the user switches the
   * selector. Resolves to `null` when that resume hasn't been analyzed for
   * this job. Read-only — never consumes a credit or calls the AI provider.
   */
  onFetchResumeMatch: (resumeId: string) => Promise<ResumeMatchSummary | null>;
  /**
   * Uploads a PDF resume directly from the extension and parses it (via
   * `/api/extension/parse-resume`, reusing the same deterministic parser the
   * dashboard uses — no duplicated parsing logic) so it becomes selectable and
   * analyzable without a dashboard visit. Deduplicates by content hash exactly
   * like the dashboard's own upload flow: re-uploading an identical file reuses
   * the existing resume instead of creating a duplicate.
   */
  onUploadResume: (file: {
    name: string;
    type: string;
    bytes: ArrayBuffer;
  }) => Promise<{ ok: true; resume: ResumeOption } | { ok: false; message: string }>;
};
