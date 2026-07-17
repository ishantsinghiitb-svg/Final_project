import type { PanelJob } from "../types";

export function JobIdentity({ job }: { job: PanelJob }) {
  return (
    <div className="nextoffer-panel__identity">
      <div className="nextoffer-panel__title">{job.title}</div>
      <div className="nextoffer-panel__company">{job.companyName}</div>
      {job.isClosed && <div className="nextoffer-panel__closed">Closed</div>}
    </div>
  );
}
