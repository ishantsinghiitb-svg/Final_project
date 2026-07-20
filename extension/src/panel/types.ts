/**
 * Shared panel types — kept separate from `FloatingPanel.tsx` so section
 * components (`sections/*`) can import them without importing the panel
 * component itself.
 */

export type PanelJob = {
  title: string;
  companyName: string;
  companyLogoUrl: string | null;
  location: string | null;
  workMode: string | null;
  employmentType: string | null;
  isClosed: boolean;
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
  | { kind: "unsupported-hiring-page" };

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
};
