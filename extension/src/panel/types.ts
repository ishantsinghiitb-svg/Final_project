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
 */
export type PanelViewState =
  | { kind: "loading" }
  | { kind: "not-logged-in" }
  | { kind: "ready"; job: PanelJob }
  | { kind: "saved"; job: PanelJob }
  | { kind: "tracked"; job: PanelJob };

/** Which in-flight action should disable buttons and swap in a loading label. */
export type PendingAction = "save" | "applyAndTrack" | null;

export type PanelActions = {
  /** Primary CTA for `ready`/`saved` — saves (if needed) + tracks + opens the apply URL. */
  onApplyAndTrack: () => void;
  /** Secondary CTA for `ready` only — bookmarks without applying. */
  onSaveForLater: () => void;
  /** Secondary CTA for `saved`/`tracked` — deep-links to the job/application in the dashboard. */
  onViewInNextOffer: () => void;
  /** `not-logged-in` only — opens the NextOffer app root. */
  onOpenInNextOffer: () => void;
};
