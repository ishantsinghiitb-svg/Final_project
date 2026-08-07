import {
  AlertTriangle,
  Bell,
  Calendar,
  CalendarCheck,
  CalendarPlus,
  CalendarSearch,
  MapPin,
  MoreVertical,
  Trash2,
  Users,
  Video,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ApplicationReminder, Interview, InterviewStatus } from "@/types";
import { CompanyMark, Chip } from "@/components/dashboard/primitives";
import {
  INTERVIEW_STATUS_META,
  LINKED_STATUSES,
  SOURCE_CHIP_META,
  STANDALONE_STATUSES,
  buildKeepInterviewPatch,
  roundTone,
} from "@/features/interviews/constants";
import { logoToneForCompany } from "@/features/jobs/utils";
import { downloadInterviewIcs, canExportToCalendar } from "@/features/interviews/ics";
import { detectMeetingProvider, MEETING_PROVIDER_LABEL } from "@/features/interviews/meetingLink";
import { useUpdateInterview } from "@/features/interviews/hooks";
import { cn } from "@/lib/utils";
import { format, formatDistanceToNow, parseISO } from "date-fns";
import type { SuggestionListItem } from "@/repositories/SuggestionRepository";

type Props = {
  interview: Interview;
  onOpen: (interview: Interview) => void;
  onStatusChange: (interview: Interview, status: InterviewStatus) => void;
  onEdit: (interview: Interview) => void;
  onDelete: (id: string) => void;
  /** A pending calendar-sourced reschedule/link-change suggestion that targets THIS specific interview — see features/interviews/pendingSuggestions. */
  pendingSuggestion?: SuggestionListItem;
  onReviewSuggestion?: (suggestion: SuggestionListItem) => void;
  /** The soonest upcoming reminder for this interview, if any — see useUpcomingRemindersByInterview. */
  nextReminder?: ApplicationReminder;
};

/**
 * InterviewCard
 *
 * Clicking the card opens the Interview Details page (Module 7B) — Edit stays
 * reachable from the ⋮ menu, alongside a quick status change and Delete.
 */
export function InterviewCard({
  interview,
  onOpen,
  onStatusChange,
  onEdit,
  onDelete,
  pendingSuggestion,
  onReviewSuggestion,
  nextReminder,
}: Props) {
  const tone = logoToneForCompany(interview.company_name);
  const statusMeta = INTERVIEW_STATUS_META[interview.status];
  const allowedStatuses = interview.application_id ? LINKED_STATUSES : STANDALONE_STATUSES;
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const updateInterview = useUpdateInterview();

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  return (
    <div
      onClick={() => onOpen(interview)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        // Enter/Space only — a bare onClick here was keyboard-inaccessible;
        // this is the only way to open an interview from the card grid at
        // all (Edit/Delete live behind the ⋮ menu, which is a separate,
        // already-focusable control).
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(interview);
        }
      }}
      aria-label={`View interview details for ${interview.company_name}, ${interview.role}`}
      className="group relative cursor-pointer rounded-xl border border-black/5 bg-white p-3.5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] transition-all hover:border-black/10 hover:shadow-[0_2px_8px_rgba(0,0,0,0.07)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]/40"
    >
      <div className="flex items-start gap-2.5">
        <CompanyMark
          company={interview.company_name}
          tone={tone}
          size={32}
          logoUrl={interview.company_logo_url}
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold text-[oklch(0.2_0.02_265)]">
            {interview.company_name}
          </p>
          <p className="mt-0.5 line-clamp-2 text-xs text-[oklch(0.5_0.02_265)]">{interview.role}</p>
        </div>
        <div ref={menuRef} className="relative shrink-0" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => setMenuOpen((o) => !o)}
            aria-label="Interview options"
            className="grid h-6 w-6 place-items-center rounded-md text-[oklch(0.55_0.02_265)] opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/[0.05]"
          >
            <MoreVertical className="h-3.5 w-3.5" />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-7 z-20 w-48 overflow-hidden rounded-xl border border-black/5 bg-white shadow-[0_12px_40px_-8px_rgba(0,0,0,0.2)]">
              <div className="border-b border-black/5 px-2 py-1.5">
                <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-[oklch(0.55_0.02_265)]">
                  Mark as
                </p>
                {allowedStatuses
                  .filter((s) => s !== interview.status)
                  .map((s) => (
                    <button
                      key={s}
                      onClick={() => {
                        onStatusChange(interview, s);
                        setMenuOpen(false);
                      }}
                      className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs hover:bg-black/[0.04]"
                    >
                      {INTERVIEW_STATUS_META[s].label}
                    </button>
                  ))}
              </div>
              <div className="border-b border-black/5 px-2 py-1.5">
                <button
                  onClick={() => {
                    onEdit(interview);
                    setMenuOpen(false);
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-[oklch(0.4_0.02_265)] hover:bg-black/[0.04]"
                >
                  Edit interview
                </button>
                {canExportToCalendar(interview) && (
                  <button
                    onClick={() => {
                      downloadInterviewIcs(interview);
                      setMenuOpen(false);
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-[oklch(0.4_0.02_265)] hover:bg-black/[0.04]"
                  >
                    <CalendarPlus className="h-3.5 w-3.5" />
                    Add to Calendar
                  </button>
                )}
              </div>
              <div className="px-2 py-1.5">
                <button
                  onClick={() => {
                    onDelete(interview.id);
                    setMenuOpen(false);
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-rose-600 hover:bg-rose-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete interview
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <Chip tone={roundTone(interview.type)}>{interview.type}</Chip>
        <Chip tone={statusMeta.tone}>{statusMeta.label}</Chip>
        {interview.application_id && <Chip tone="default">Linked</Chip>}
        {SOURCE_CHIP_META[interview.source] && (
          <Chip tone={SOURCE_CHIP_META[interview.source]!.tone}>
            {SOURCE_CHIP_META[interview.source]!.label}
          </Chip>
        )}
        {interview.calendar_event_id && !interview.is_calendar_event_stale && (
          <span title="Synced with Google Calendar" className="inline-flex shrink-0">
            <CalendarCheck className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
          </span>
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

      <div className="mt-3 space-y-1.5">
        <div className="flex items-center gap-1.5 text-xs font-medium text-[oklch(0.35_0.02_265)]">
          <Calendar className="h-3.5 w-3.5 shrink-0 text-[oklch(0.5_0.02_265)]" />
          <span>{format(parseISO(interview.scheduled_at), "MMM d, yyyy 'at' h:mm a")}</span>
        </div>
        {interview.mode === "online" ? (
          <div className="flex items-center gap-1.5 text-[11px] text-[oklch(0.55_0.02_265)]">
            <Video className="h-3.5 w-3.5 shrink-0" />
            <span className="shrink-0 font-medium text-[oklch(0.45_0.02_265)]">
              {MEETING_PROVIDER_LABEL[detectMeetingProvider(interview.link)]}
            </span>
            {interview.link && <span className="truncate">· {interview.link}</span>}
          </div>
        ) : (
          <div className="flex items-center gap-1.5 text-[11px] text-[oklch(0.55_0.02_265)]">
            <MapPin className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{interview.location || "Offline"}</span>
          </div>
        )}
        {interview.interviewer && (
          <div className="flex items-center gap-1.5 text-[11px] text-[oklch(0.55_0.02_265)]">
            <Users className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{interview.interviewer}</span>
          </div>
        )}
        {nextReminder && (
          <div className="flex items-center gap-1.5 text-[11px] text-[oklch(0.55_0.02_265)]">
            <Bell className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">
              Reminder {formatDistanceToNow(parseISO(nextReminder.remind_at), { addSuffix: true })}
            </span>
          </div>
        )}
      </div>

      {pendingSuggestion && onReviewSuggestion && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onReviewSuggestion(pendingSuggestion);
          }}
          className="mt-2.5 flex w-full items-center gap-1.5 rounded-lg border border-[#2563EB]/15 bg-[#2563EB]/[0.04] px-2.5 py-1.5 text-[11px] font-medium text-[#2563EB] hover:bg-[#2563EB]/[0.08]"
        >
          <CalendarSearch className="h-3.5 w-3.5 shrink-0" />
          Calendar update available — Review
        </button>
      )}
    </div>
  );
}
