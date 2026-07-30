import { useState } from "react";
import { AlertTriangle, ChevronDown } from "lucide-react";
import type { InterviewPrepContent } from "@/features/interview-prep/types";
import { cn } from "@/lib/utils";
import { CollapsibleSection } from "./CollapsibleSection";

function WeakAreaRow({ area }: { area: InterviewPrepContent["resumeWeakAreas"][number] }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-lg border border-black/5">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left"
      >
        <span className="min-w-0 flex-1 text-sm font-medium text-[oklch(0.25_0.02_265)]">
          {area.area}
        </span>
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 shrink-0 text-[oklch(0.55_0.02_265)] transition-transform",
            expanded && "rotate-180",
          )}
        />
      </button>
      {expanded && (
        <div className="space-y-1.5 border-t border-black/5 px-3 py-3 text-xs leading-relaxed text-[oklch(0.45_0.02_265)]">
          {area.concern && (
            <p>
              <span className="font-medium text-[oklch(0.35_0.02_265)]">Concern: </span>
              {area.concern}
            </p>
          )}
          {area.likelyFollowUp && (
            <p>
              <span className="font-medium text-[oklch(0.35_0.02_265)]">Likely follow-up: </span>
              {area.likelyFollowUp}
            </p>
          )}
          {area.howToAddress && (
            <p>
              <span className="font-medium text-[oklch(0.35_0.02_265)]">How to address it: </span>
              {area.howToAddress}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/** §5 Resume Weak Areas — collapsed rows summarized by `area` only. */
export function ResumeWeakAreasPanel({ areas }: { areas: InterviewPrepContent["resumeWeakAreas"] }) {
  if (areas.length === 0) return null;

  return (
    <CollapsibleSection icon={AlertTriangle} title="Resume Weak Areas" meta={`${areas.length}`}>
      <div className="space-y-2">
        {areas.map((area, i) => (
          <WeakAreaRow key={i} area={area} />
        ))}
      </div>
    </CollapsibleSection>
  );
}
