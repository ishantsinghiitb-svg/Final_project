import { useEffect, useRef, useState } from "react";
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
  const [expanded, setExpanded] = useState(false);

  // Each newly-detected job starts collapsed again — an expanded state left
  // over from a previous job on the same LinkedIn SPA session would be
  // showing stale content otherwise. A CTA-state change on the *same* job
  // (ready -> saved -> tracked) must NOT collapse it back.
  const jobSignature = "job" in state ? `${state.job.title}|${state.job.companyName}` : null;
  const lastSignature = useRef<string | null>(null);
  useEffect(() => {
    if (jobSignature !== null && jobSignature !== lastSignature.current) {
      setExpanded(false);
    }
    lastSignature.current = jobSignature;
  }, [jobSignature]);

  return (
    <div
      className={`nextoffer-shell ${expanded ? "nextoffer-shell--expanded" : "nextoffer-shell--collapsed"}`}
    >
      {expanded ? (
        <>
          <PanelHeader onCollapse={() => setExpanded(false)} />
          <PanelBody state={state} actions={actions} pending={pending} />
        </>
      ) : (
        <CollapsedLauncher onExpand={() => setExpanded(true)} />
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
  }
}
