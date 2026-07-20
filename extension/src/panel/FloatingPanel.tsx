import { useEffect, useState } from "react";
import { PANEL_EXPANDED_STORAGE_KEY } from "../shared/constants";
import { CollapsedLauncher } from "./CollapsedLauncher";
import { CtaRow } from "./sections/CtaRow";
import { JobIdentity } from "./sections/JobIdentity";
import { MetadataChipRow } from "./sections/MetadataChipRow";
import { PanelHeader } from "./sections/PanelHeader";
import type { PanelActions, PanelViewState, PendingAction } from "./types";

export type { PanelJob, PanelViewState, PanelActions, PendingAction } from "./types";

/**
 * A single shell element that morphs between the collapsed circular launcher
 * and the expanded panel — one DOM node whose size/shape/shadow transition
 * via CSS (see `panelStyles.ts`), rather than two separate fixed-position
 * elements swapping in and out. This is what makes the expand feel like it
 * grows out of the launcher instead of a disconnected panel appearing.
 */
export function FloatingPanel({
  state,
  actions,
  pending,
}: {
  state: PanelViewState;
  actions: PanelActions;
  pending: PendingAction;
}) {
  console.debug("[NextOffer][DEBUG] 7. FloatingPanel rendered?", true, "state.kind=", state.kind);
  // Defaults open — matches the "first visit" requirement — until the
  // persisted preference (if any) loads and overrides it. The preference is
  // per-installation, not per-job, so it deliberately survives job changes
  // and LinkedIn SPA navigations instead of resetting.
  const [expanded, setExpanded] = useState(true);

  useEffect(() => {
    let cancelled = false;
    chrome.storage.local.get(PANEL_EXPANDED_STORAGE_KEY).then((result) => {
      const stored = result[PANEL_EXPANDED_STORAGE_KEY];
      if (!cancelled && typeof stored === "boolean") setExpanded(stored);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  function setExpandedAndPersist(value: boolean): void {
    setExpanded(value);
    void chrome.storage.local.set({ [PANEL_EXPANDED_STORAGE_KEY]: value });
  }

  return (
    <div
      className={`nextoffer-shell ${expanded ? "nextoffer-shell--expanded" : "nextoffer-shell--collapsed"}`}
    >
      {expanded ? (
        <>
          <PanelHeader onCollapse={() => setExpandedAndPersist(false)} />
          <PanelBody state={state} actions={actions} pending={pending} />
        </>
      ) : (
        <CollapsedLauncher onExpand={() => setExpandedAndPersist(true)} />
      )}
    </div>
  );
}

function PanelBody({
  state,
  actions,
  pending,
}: {
  state: PanelViewState;
  actions: PanelActions;
  pending: PendingAction;
}) {
  switch (state.kind) {
    case "loading":
      return <div className="nextoffer-panel__body">Loading job…</div>;

    case "not-logged-in":
      return (
        <div className="nextoffer-panel__body">
          <span>Log in to NextOffer to save or track this job.</span>
          <button className="nextoffer-panel__btn--primary" onClick={actions.onOpenInNextOffer}>
            Open in NextOffer
          </button>
        </div>
      );

    case "ready":
    case "saved":
    case "tracked":
      return (
        <div className="nextoffer-panel__body">
          <JobIdentity job={state.job} />
          <MetadataChipRow job={state.job} />
          <CtaRow
            kind={state.kind}
            isClosed={state.job.isClosed}
            pending={pending}
            actions={actions}
          />
        </div>
      );

    case "no-job":
      return (
        <div className="nextoffer-panel__body">
          <span className="nextoffer-panel__empty-title">No job detected.</span>
          <span>Open a job posting to save it.</span>
        </div>
      );

    case "unsupported-hiring-page":
      return (
        <div className="nextoffer-panel__body">
          <span>Automatic tracking isn&apos;t available for this hiring platform yet.</span>
          <span>You can still save this opportunity using:</span>
          <ul className="nextoffer-panel__list">
            <li>Import Job URL</li>
            <li>Manual Job Entry</li>
          </ul>
          <span>Support for additional hiring platforms is being added continuously.</span>
        </div>
      );
  }
}
