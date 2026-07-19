import { useEffect, useState } from "react";

import type { PanelJob } from "../types";

/**
 * Shared by the floating panel and the popup. Shows the job's company logo
 * (the same stored `companyLogoUrl` the dashboard uses) with an initials
 * fallback when there's no logo or the image fails to load — the exact same
 * behaviour as the dashboard's `CompanyMark`, for one consistent company
 * identity across the product.
 */
export function JobIdentity({ job }: { job: PanelJob }) {
  const logo = job.companyLogoUrl;
  const [imgFailed, setImgFailed] = useState(false);
  // Reset when the job (and its logo) changes — this component is reused across
  // SPA navigations without remounting.
  useEffect(() => setImgFailed(false), [logo]);

  return (
    <div className="nextoffer-panel__identity">
      <div className="nextoffer-panel__identity-head">
        {logo && !imgFailed ? (
          <img
            className="nextoffer-panel__logo"
            src={logo}
            alt=""
            width={28}
            height={28}
            loading="lazy"
            onError={() => setImgFailed(true)}
          />
        ) : (
          <div className="nextoffer-panel__logo-fallback" aria-hidden="true">
            {job.companyName.charAt(0).toUpperCase()}
          </div>
        )}
        <div className="nextoffer-panel__identity-text">
          <div className="nextoffer-panel__title">{job.title}</div>
          <div className="nextoffer-panel__company">{job.companyName}</div>
        </div>
      </div>
      {job.isClosed && <div className="nextoffer-panel__closed">Closed</div>}
    </div>
  );
}
