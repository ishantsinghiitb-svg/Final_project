import type { PanelActions, PendingAction } from "../types";

type CtaRowProps = {
  kind: "ready" | "saved" | "tracked";
  isClosed: boolean;
  pending: PendingAction;
  actions: PanelActions;
};

/**
 * The panel's CTA state machine — three states, not five: `ready` (nothing
 * done yet), `saved` (bookmarked but not applied), `tracked` (application on
 * file). "Apply & Track" is the primary action for both `ready` and `saved`
 * — saving is idempotent, so reusing it for an already-saved job is safe and
 * avoids a fourth state. Buttons disable while their own action is pending
 * so a slow response can't be triggered twice.
 */
export function CtaRow({ kind, isClosed, pending, actions }: CtaRowProps) {
  const busy = pending !== null;

  if (kind === "tracked") {
    return (
      <div className="nextoffer-panel__cta-row">
        <div className="nextoffer-panel__tracked-badge">✅ Application Tracked</div>
        <button className="nextoffer-panel__btn--secondary" onClick={actions.onViewInNextOffer}>
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
        {pending === "applyAndTrack" ? "Applying…" : "Apply & Track"}
      </button>

      {kind === "ready" ? (
        <button
          className="nextoffer-panel__btn--secondary"
          onClick={actions.onSaveForLater}
          disabled={busy}
        >
          {pending === "save" ? "Saving…" : "Save for Later"}
        </button>
      ) : (
        <button
          className="nextoffer-panel__btn--secondary"
          onClick={actions.onViewInNextOffer}
          disabled={busy}
        >
          View in NextOffer
        </button>
      )}
    </div>
  );
}
