import type { PanelActions, PendingAction } from "../types";

type CtaRowProps = {
  kind: "ready" | "saved" | "tracked";
  isClosed: boolean;
  pending: PendingAction;
  actions: PanelActions;
  /**
   * Wording overrides for the `ready` state only — the floating panel and the
   * popup surface the same `onApplyAndTrack`/`onSaveForLater` actions under
   * different copy ("Apply & Track"/"Save for Later" vs. "Track Application"/
   * "Save Job"). `saved`/`tracked` already read the same either way, so they
   * aren't parameterized. Defaults match the floating panel's existing copy.
   */
  readyLabels?: { primary?: string; primaryPending?: string; secondary?: string; secondaryPending?: string };
};

/**
 * The panel's CTA state machine — three states, each with its own primary/
 * secondary pair, determined entirely from existing backend state (never a
 * separately tracked client flag):
 *
 *  - `ready`   (not saved):        primary "Apply & Track"      / secondary "Save for Later"
 *  - `saved`   (saved, untracked): primary "Track Application"  / secondary "View in NextOffer"
 *  - `tracked` (application on file): primary disabled success state / secondary "View in NextOffer"
 *
 * Buttons disable while their own action is pending so a slow response can't
 * be triggered twice, and neither primary action ever navigates the user
 * away from the current page — both only save/track in the background.
 */
export function CtaRow({ kind, isClosed, pending, actions, readyLabels }: CtaRowProps) {
  const busy = pending !== null;

  if (kind === "tracked") {
    return (
      <div className="nextoffer-panel__cta-row">
        <button className="nextoffer-panel__btn--tracked" disabled aria-live="polite">
          ✓ Application Tracked
        </button>
        <button className="nextoffer-panel__btn--secondary" onClick={actions.onViewInNextOffer}>
          View in NextOffer
        </button>
      </div>
    );
  }

  if (kind === "saved") {
    return (
      <div className="nextoffer-panel__cta-row">
        <button
          className="nextoffer-panel__btn--primary"
          onClick={actions.onTrackApplication}
          disabled={isClosed || busy}
          title={isClosed ? "This job is closed" : undefined}
        >
          {pending === "track" ? "Tracking…" : "Track Application"}
        </button>
        <button
          className="nextoffer-panel__btn--secondary"
          onClick={actions.onViewInNextOffer}
          disabled={busy}
        >
          View in NextOffer
        </button>
      </div>
    );
  }

  return (
    <div className="nextoffer-panel__cta-row">
      <button
        className="nextoffer-panel__btn--primary"
        onClick={actions.onApplyAndTrack}
        disabled={isClosed || busy}
        title={isClosed ? "This job is closed" : undefined}
      >
        {pending === "applyAndTrack"
          ? (readyLabels?.primaryPending ?? "Applying…")
          : (readyLabels?.primary ?? "Apply & Track")}
      </button>
      <button
        className="nextoffer-panel__btn--secondary"
        onClick={actions.onSaveForLater}
        disabled={busy}
      >
        {pending === "save"
          ? (readyLabels?.secondaryPending ?? "Saving…")
          : (readyLabels?.secondary ?? "Save for Later")}
      </button>
    </div>
  );
}
