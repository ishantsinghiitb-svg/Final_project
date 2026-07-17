export type PanelJob = {
  title: string;
  companyName: string;
  isClosed: boolean;
};

export type PanelViewState =
  | { kind: "loading" }
  | { kind: "not-logged-in" }
  | { kind: "ready"; job: PanelJob }
  | { kind: "saved"; job: PanelJob }
  | { kind: "tracking"; job: PanelJob };

export type PanelActions = {
  onSave: () => void;
  onTrack: () => void;
  onViewSaved: () => void;
  onViewApplication: () => void;
  onOpenInNextOffer: () => void;
};

export function FloatingPanel({
  state,
  actions,
}: {
  state: PanelViewState;
  actions: PanelActions;
}) {
  return (
    <div className="nextoffer-panel">
      <div className="nextoffer-panel__header">NextOffer</div>
      <PanelBody state={state} actions={actions} />
    </div>
  );
}

function PanelBody({ state, actions }: { state: PanelViewState; actions: PanelActions }) {
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
      return (
        <div className="nextoffer-panel__body">
          <JobSummary job={state.job} />
          <button className="nextoffer-panel__btn--primary" onClick={actions.onSave}>
            Save Job
          </button>
          <button
            className="nextoffer-panel__btn--secondary"
            onClick={actions.onTrack}
            disabled={state.job.isClosed}
            title={state.job.isClosed ? "This job is closed" : undefined}
          >
            Track Application
          </button>
        </div>
      );

    case "saved":
      return (
        <div className="nextoffer-panel__body">
          <JobSummary job={state.job} />
          <div className="nextoffer-panel__saved-badge">Saved ✓</div>
          <button className="nextoffer-panel__btn--secondary" onClick={actions.onViewSaved}>
            View Saved Job
          </button>
          <button
            className="nextoffer-panel__btn--secondary"
            onClick={actions.onTrack}
            disabled={state.job.isClosed}
            title={state.job.isClosed ? "This job is closed" : undefined}
          >
            Track Application
          </button>
        </div>
      );

    case "tracking":
      return (
        <div className="nextoffer-panel__body">
          <JobSummary job={state.job} />
          <button className="nextoffer-panel__btn--primary" onClick={actions.onViewApplication}>
            View Application
          </button>
          <button className="nextoffer-panel__btn--secondary" onClick={actions.onOpenInNextOffer}>
            Open in NextOffer
          </button>
        </div>
      );
  }
}

function JobSummary({ job }: { job: PanelJob }) {
  return (
    <div className="nextoffer-panel__summary">
      <div className="nextoffer-panel__title">{job.title}</div>
      <div className="nextoffer-panel__company">{job.companyName}</div>
      {job.isClosed && <div className="nextoffer-panel__closed">Closed</div>}
    </div>
  );
}
