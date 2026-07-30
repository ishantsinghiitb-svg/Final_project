import { ClipboardList, Target } from "lucide-react";
import { DashCard, Chip } from "@/components/dashboard/primitives";
import { PREP_PRIORITY_LABELS, PREP_PRIORITY_TONE } from "@/features/interview-prep/constants";
import type { InterviewPrepContent } from "@/features/interview-prep/types";
import { CollapsibleSection } from "./CollapsibleSection";

type Props = {
  content: InterviewPrepContent;
};

/**
 * InterviewOverviewSection
 *
 * §1 Interview Overview (always visible — short, sets the scene) plus §2
 * Evaluation Criteria and §3 Priority Topics as collapsible groups
 * (progressive disclosure — refinement #1). Priority Topics opens by default
 * only when it contains a `critical` item, so the thing most worth seeing
 * immediately isn't hidden behind a click.
 */
export function InterviewOverviewSection({ content }: Props) {
  const hasCritical = content.priorityTopics.some((t) => t.priority === "critical");

  return (
    <div className="space-y-3">
      {content.overview && (
        <DashCard>
          <p className="text-sm leading-relaxed text-[oklch(0.3_0.02_265)]">{content.overview}</p>
        </DashCard>
      )}

      {content.evaluationCriteria.length > 0 && (
        <CollapsibleSection
          icon={Target}
          title="What the interviewer is likely evaluating"
          meta={`${content.evaluationCriteria.length}`}
        >
          <ul className="space-y-3">
            {content.evaluationCriteria.map((c, i) => (
              <li key={i} className="border-l-2 border-[#2563EB]/20 pl-3">
                <p className="text-sm font-medium text-[oklch(0.25_0.02_265)]">{c.criterion}</p>
                {c.why && <p className="mt-0.5 text-xs text-[oklch(0.5_0.02_265)]">{c.why}</p>}
                {c.howToDemonstrate && (
                  <p className="mt-1 text-xs text-[oklch(0.45_0.02_265)]">
                    <span className="font-medium">How to show it: </span>
                    {c.howToDemonstrate}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </CollapsibleSection>
      )}

      {content.priorityTopics.length > 0 && (
        <CollapsibleSection
          icon={ClipboardList}
          title="High Priority Preparation Topics"
          meta={`${content.priorityTopics.length}`}
          defaultOpen={hasCritical}
        >
          <ul className="space-y-3">
            {content.priorityTopics.map((t, i) => (
              <li key={i} className="flex items-start gap-2.5">
                <Chip tone={PREP_PRIORITY_TONE[t.priority]} className="mt-0.5 shrink-0">
                  {PREP_PRIORITY_LABELS[t.priority]}
                </Chip>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-[oklch(0.25_0.02_265)]">{t.topic}</p>
                  {t.why && <p className="mt-0.5 text-xs text-[oklch(0.5_0.02_265)]">{t.why}</p>}
                  {t.studyPoints.length > 0 && (
                    <ul className="mt-1.5 flex flex-wrap gap-1.5">
                      {t.studyPoints.map((point, j) => (
                        <li
                          key={j}
                          className="rounded-full bg-black/[0.03] px-2 py-0.5 text-[11px] text-[oklch(0.4_0.02_265)]"
                        >
                          {point}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </CollapsibleSection>
      )}
    </div>
  );
}
