import { useState } from "react";
import { ChevronDown, Star } from "lucide-react";
import type { InterviewPrepContent } from "@/features/interview-prep/types";
import { cn } from "@/lib/utils";
import { CollapsibleSection } from "./CollapsibleSection";

function StarStoryRow({ story }: { story: InterviewPrepContent["starStories"][number] }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-lg border border-black/5">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left"
      >
        <span className="min-w-0 flex-1 text-sm font-medium text-[oklch(0.25_0.02_265)]">
          {story.theme}
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
          {story.suggestedExperience && (
            <p>
              <span className="font-medium text-[oklch(0.35_0.02_265)]">Use this experience: </span>
              {story.suggestedExperience}
            </p>
          )}
          {story.resumeEvidence && (
            <p>
              <span className="font-medium text-[oklch(0.35_0.02_265)]">From your resume: </span>
              {story.resumeEvidence}
            </p>
          )}
          {story.guidance && (
            <p>
              <span className="font-medium text-[oklch(0.35_0.02_265)]">How to shape it: </span>
              {story.guidance}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * §6 STAR Story Recommendations — which real experiences from the résumé fit
 * common behavioral themes. Never invented experiences; grounded by the
 * prompt (see features/interview-prep/prompt.ts).
 */
export function StarStoriesPanel({ stories }: { stories: InterviewPrepContent["starStories"] }) {
  if (stories.length === 0) return null;

  return (
    <CollapsibleSection icon={Star} title="STAR Story Recommendations" meta={`${stories.length}`}>
      <div className="space-y-2">
        {stories.map((story, i) => (
          <StarStoryRow key={i} story={story} />
        ))}
      </div>
    </CollapsibleSection>
  );
}
