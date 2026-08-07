import {
  AlertTriangle,
  CalendarPlus,
  CalendarSearch,
  MapPin,
  Pencil,
  Search,
  Trash2,
  Video,
} from "lucide-react";
import type { Interview } from "@/types";
import { CompanyMark, Chip, EmptyState } from "@/components/dashboard/primitives";
import { DashButton } from "@/components/dashboard/DashButton";
import {
  INTERVIEW_STATUS_META,
  SOURCE_CHIP_META,
  buildKeepInterviewPatch,
  roundTone,
} from "@/features/interviews/constants";
import { logoToneForCompany } from "@/features/jobs/utils";
import { downloadInterviewIcs, canExportToCalendar } from "@/features/interviews/ics";
import { detectMeetingProvider, MEETING_PROVIDER_LABEL } from "@/features/interviews/meetingLink";
import { useUpdateInterview } from "@/features/interviews/hooks";
import { format, parseISO } from "date-fns";
import type { SuggestionListItem } from "@/repositories/SuggestionRepository";

type Props = {
  interviews: Interview[];
  onOpen: (interview: Interview) => void;
  onEdit: (interview: Interview) => void;
  onDelete: (id: string) => void;
  /** Only relevant when the empty list is caused by filters — see the parent's own identical `filtered.length === 0` case. */
  onClearFilters?: () => void;
  /** Keyed by interview id — see features/interviews/pendingSuggestions.splitCalendarSuggestions. */
  pendingSuggestionsByInterviewId?: Map<string, SuggestionListItem>;
  onReviewSuggestion?: (suggestion: SuggestionListItem) => void;
};

/**
 * InterviewTableView
 *
 * Tabular list view — rows open the Interview Details page (Module 7B); the
 * pencil icon opens the edit dialog directly.
 */
export function InterviewTableView({
  interviews,
  onOpen,
  onEdit,
  onDelete,
  onClearFilters,
  pendingSuggestionsByInterviewId,
  onReviewSuggestion,
}: Props) {
  const updateInterview = useUpdateInterview();

  if (interviews.length === 0) {
    // Same wording/treatment as the card view's own empty state for this
    // identical case (the parent only renders this view once at least one
    // interview exists at all, so an empty `interviews` here always means the
    // current filters exclude everything — never "no interviews ever").
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

  return (
    <div className="overflow-x-auto rounded-2xl border border-black/5 bg-white">
      <table className="w-full text-sm">
        <thead className="border-b border-black/5 text-left text-[10px] font-semibold uppercase tracking-widest text-[oklch(0.55_0.02_265)]">
          <tr>
            <th className="px-4 py-3">Company</th>
            <th className="px-4 py-3">Role</th>
            <th className="px-4 py-3">Round</th>
            <th className="hidden px-4 py-3 md:table-cell">Date &amp; Time</th>
            <th className="hidden px-4 py-3 lg:table-cell">Mode</th>
            <th className="px-4 py-3">Status</th>
            <th className="w-8 px-4 py-3" />
          </tr>
        </thead>
        <tbody className="divide-y divide-black/[0.03]">
          {interviews.map((interview) => {
            const tone = logoToneForCompany(interview.company_name);
            const statusMeta = INTERVIEW_STATUS_META[interview.status];
            const pendingSuggestion = pendingSuggestionsByInterviewId?.get(interview.id);

            return (
              <tr
                key={interview.id}
                onClick={() => onOpen(interview)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  // Same keyboard-access gap as the card grid view of this
                  // same list — the row-open action was mouse-only.
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onOpen(interview);
                  }
                }}
                aria-label={`View interview details for ${interview.company_name}, ${interview.role}`}
                className="group cursor-pointer transition-colors hover:bg-[oklch(0.99_0.005_265)] focus-visible:outline-none focus-visible:bg-[oklch(0.98_0.005_265)] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#2563EB]/40"
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2.5">
                    <CompanyMark
                      company={interview.company_name}
                      tone={tone}
                      size={28}
                      logoUrl={interview.company_logo_url}
                    />
                    <span className="font-medium text-[oklch(0.2_0.02_265)]">
                      {interview.company_name}
                    </span>
                    {interview.application_id && <Chip tone="default">Linked</Chip>}
                    {SOURCE_CHIP_META[interview.source] && (
                      <Chip tone={SOURCE_CHIP_META[interview.source]!.tone}>
                        {SOURCE_CHIP_META[interview.source]!.label}
                      </Chip>
                    )}
                    {interview.is_calendar_event_stale && (
                      <span
                        title="This event was removed from your Google Calendar. Your interview is unaffected — review it if the plan changed."
                        className="inline-flex items-center gap-1 rounded-full bg-[#F59E0B]/10 py-0.5 pl-2 pr-1 text-[11px] font-medium text-[#B45309]"
                      >
                        <AlertTriangle className="h-3 w-3" />
                        Removed from calendar
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            updateInterview.mutate({
                              id: interview.id,
                              updates: buildKeepInterviewPatch(interview),
                            });
                          }}
                          className="ml-0.5 rounded-full px-1.5 py-0.5 underline decoration-dotted hover:bg-[#F59E0B]/15"
                        >
                          Keep
                        </button>
                      </span>
                    )}
                  </div>
                </td>

                <td className="max-w-[200px] px-4 py-3">
                  <span className="line-clamp-2 text-xs text-[oklch(0.35_0.02_265)]">
                    {interview.role}
                  </span>
                </td>

                <td className="px-4 py-3">
                  <Chip tone={roundTone(interview.type)}>{interview.type}</Chip>
                </td>

                <td className="hidden px-4 py-3 text-xs text-[oklch(0.5_0.02_265)] md:table-cell">
                  {format(parseISO(interview.scheduled_at), "MMM d, yyyy · h:mm a")}
                </td>

                <td className="hidden px-4 py-3 text-xs text-[oklch(0.5_0.02_265)] lg:table-cell">
                  <span className="flex items-center gap-1">
                    {interview.mode === "online" ? (
                      <Video className="h-3 w-3 shrink-0" />
                    ) : (
                      <MapPin className="h-3 w-3 shrink-0" />
                    )}
                    {interview.mode === "online"
                      ? MEETING_PROVIDER_LABEL[detectMeetingProvider(interview.link)]
                      : "Offline"}
                  </span>
                </td>

                <td className="px-4 py-3">
                  <Chip tone={statusMeta.tone}>{statusMeta.label}</Chip>
                </td>

                <td className="px-4 py-3">
                  <div
                    className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      onClick={() => onEdit(interview)}
                      aria-label="Edit interview"
                      className="grid h-7 w-7 place-items-center rounded-lg text-[oklch(0.5_0.02_265)] hover:bg-black/[0.05] hover:text-[#2563EB] transition-colors"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    {pendingSuggestion && onReviewSuggestion && (
                      <button
                        onClick={() => onReviewSuggestion(pendingSuggestion)}
                        aria-label="Calendar update available — review"
                        title="Calendar update available — review"
                        className="grid h-7 w-7 place-items-center rounded-lg text-[#2563EB] hover:bg-[#2563EB]/[0.08] transition-colors"
                      >
                        <CalendarSearch className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {canExportToCalendar(interview) && (
                      <button
                        onClick={() => downloadInterviewIcs(interview)}
                        aria-label="Add to Calendar"
                        className="grid h-7 w-7 place-items-center rounded-lg text-[oklch(0.5_0.02_265)] hover:bg-black/[0.05] hover:text-[#2563EB] transition-colors"
                      >
                        <CalendarPlus className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <button
                      onClick={() => onDelete(interview.id)}
                      aria-label="Delete interview"
                      className="grid h-7 w-7 place-items-center rounded-lg text-[oklch(0.5_0.02_265)] hover:bg-rose-50 hover:text-rose-600 transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
