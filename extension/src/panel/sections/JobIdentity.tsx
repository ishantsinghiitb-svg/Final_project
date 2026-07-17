import type { PanelJob } from "../types";

/** Generated initials fallback — mirrors the dashboard's `CompanyMark` behavior for consistency. */
function initialsFor(companyName: string): string {
  return companyName.trim().charAt(0).toUpperCase() || "?";
}

export function JobIdentity({ job }: { job: PanelJob }) {
  return (
    <div className="nextoffer-panel__identity">
      {job.companyLogoUrl ? (
        <img
          className="nextoffer-panel__logo"
          src={job.companyLogoUrl}
          alt=""
          onError={(e) => {
            e.currentTarget.style.display = "none";
          }}
        />
      ) : (
        <div className="nextoffer-panel__logo nextoffer-panel__logo--initials" aria-hidden="true">
          {initialsFor(job.companyName)}
        </div>
      )}

      <div className="nextoffer-panel__identity-text">
        <div className="nextoffer-panel__title">{job.title}</div>
        <div className="nextoffer-panel__company">{job.companyName}</div>
        {job.isClosed && <div className="nextoffer-panel__closed">Closed</div>}
      </div>
    </div>
  );
}
