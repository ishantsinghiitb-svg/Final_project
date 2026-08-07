import { Search } from "lucide-react";
import type { Interview, InterviewStatus } from "@/types";
import { EmptyState } from "@/components/dashboard/primitives";
import { DashButton } from "@/components/dashboard/DashButton";
import { InterviewCard } from "@/components/dashboard/interviews/InterviewCard";
import { GROUP_ORDER, groupFor, type GroupLabel } from "@/features/interviews/agenda";
import type { SuggestionListItem } from "@/repositories/SuggestionRepository";

type Props = {
  interviews: Interview[];
  onOpen: (interview: Interview) => void;
  onStatusChange: (interview: Interview, status: InterviewStatus) => void;
  onEdit: (interview: Interview) => void;
  onDelete: (id: string) => void;
  onClearFilters?: () => void;
  pendingSuggestionsByInterviewId?: Map<string, SuggestionListItem>;
  onReviewSuggestion?: (suggestion: SuggestionListItem) => void;
};

/**
 * InterviewAgendaView
 *
 * A forward-looking, date-grouped read of the same list Card/Table render —
 * Today / This week / Next week / Later (plus Past, for anything the current
 * filters didn't already exclude). Reuses InterviewCard per-row so status
 * changes, edit, delete and "Add to Calendar" behave identically everywhere.
 */
export function InterviewAgendaView({
  interviews,
  onOpen,
  onStatusChange,
  onEdit,
  onDelete,
  onClearFilters,
  pendingSuggestionsByInterviewId,
  onReviewSuggestion,
}: Props) {
  if (interviews.length === 0) {
    return (
      <EmptyState
        icon={Search}
        title="No interviews found"
        body="Try adjusting your filters."
        cta={
          onClearFilters && (
            <DashButton variant="outline" onClick={onClearFilters}>
              Clear filters
            </DashButton>
          )
        }
      />
    );
  }

  const now = new Date();
  const groups = new Map<GroupLabel, Interview[]>();
  for (const interview of interviews) {
    const label = groupFor(interview.scheduled_at, now);
    const bucket = groups.get(label);
    if (bucket) bucket.push(interview);
    else groups.set(label, [interview]);
  }

  const orderedGroups = GROUP_ORDER.filter((label) => groups.has(label));

  return (
    <div className="space-y-6">
      {orderedGroups.map((label) => (
        <div key={label}>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-widest text-[oklch(0.55_0.02_265)]">
            {label}
          </h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {groups.get(label)!.map((interview) => (
              <InterviewCard
                key={interview.id}
                interview={interview}
                onOpen={onOpen}
                onStatusChange={onStatusChange}
                onEdit={onEdit}
                onDelete={onDelete}
                pendingSuggestion={pendingSuggestionsByInterviewId?.get(interview.id)}
                onReviewSuggestion={onReviewSuggestion}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
