import type { PanelJob } from "../types";

/** Renders only the fields present on this job — never an empty placeholder chip. */
export function MetadataChipRow({ job }: { job: PanelJob }) {
  const chips = [job.location, job.workMode, job.employmentType].filter((value): value is string =>
    Boolean(value),
  );

  if (chips.length === 0) return null;

  return (
    <div className="nextoffer-panel__chip-row">
      {chips.map((chip) => (
        <span key={chip} className="nextoffer-panel__chip">
          {chip}
        </span>
      ))}
    </div>
  );
}
