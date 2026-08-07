import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  AlertCircle,
  CalendarClock,
  CalendarRange,
  LayoutGrid,
  List,
  Loader2,
  Plus,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { EmptyState, PageHeader, StickyPageHeader } from "@/components/dashboard/primitives";
import { InterviewCard } from "@/components/dashboard/interviews/InterviewCard";
import { InterviewTableView } from "@/components/dashboard/interviews/InterviewTableView";
import { InterviewAgendaView } from "@/components/dashboard/interviews/InterviewAgendaView";
import { InterviewFiltersBar } from "@/components/dashboard/interviews/InterviewFiltersBar";
import { PendingCalendarSuggestions } from "@/components/dashboard/interviews/PendingCalendarSuggestions";
import { ScheduleInterviewDialog } from "@/components/dashboard/interviews/ScheduleInterviewDialog";
import { InterviewPickerDialog } from "@/components/dashboard/interviews/prep/InterviewPickerDialog";
import { ReviewPanel } from "@/components/dashboard/gmail/ReviewPanel";
import { ReviewSuggestionDialog } from "@/components/dashboard/gmail/ReviewSuggestionDialog";
import { DashButton } from "@/components/dashboard/DashButton";
import {
  useAllInterviews,
  useDeleteInterview,
  useUpdateInterviewStatus,
  useUpcomingRemindersByInterview,
} from "@/features/interviews/hooks";
import { usePendingCalendarSuggestions, useResolveSuggestion } from "@/features/gmail/hooks";
import { useSyncGoogleNow } from "@/features/google/hooks";
import { combinedSyncOutcomeMessage } from "@/features/google/syncOutcome";
import { splitCalendarSuggestions } from "@/features/interviews/pendingSuggestions";
import { DEFAULT_INTERVIEW_SORT_OPTION, SORT_OPTIONS } from "@/features/interviews/constants";
import type {
  InterviewFilters,
  InterviewSortOption,
  InterviewViewMode,
} from "@/features/interviews/types";
import type { Interview, InterviewStatus } from "@/types";
import type { SuggestionListItem } from "@/repositories/SuggestionRepository";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/dashboard/interviews/")({
  head: () => ({
    meta: [{ title: "Interviews — NextOffer" }, { name: "robots", content: "noindex" }],
  }),
  component: InterviewsPage,
});

function isSameDay(iso: string, ref: Date): boolean {
  const d = new Date(iso);
  return (
    d.getFullYear() === ref.getFullYear() &&
    d.getMonth() === ref.getMonth() &&
    d.getDate() === ref.getDate()
  );
}

function InterviewsPage() {
  const navigate = useNavigate();
  const [view, setView] = useState<InterviewViewMode>("card");
  const [filters, setFilters] = useState<InterviewFilters>({});
  const [sortOption, setSortOption] = useState<InterviewSortOption>(DEFAULT_INTERVIEW_SORT_OPTION);
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Interview | null>(null);
  const [pickingPrep, setPickingPrep] = useState(false);
  const [reviewingSuggestion, setReviewingSuggestion] = useState<SuggestionListItem | null>(null);
  const [editingSuggestion, setEditingSuggestion] = useState<SuggestionListItem | null>(null);
  const [busySuggestionId, setBusySuggestionId] = useState<string | null>(null);

  const { data: interviews = [], isLoading, isError, error } = useAllInterviews();
  const updateStatus = useUpdateInterviewStatus();
  const deleteInterview = useDeleteInterview();
  const { data: calendarSuggestions = [] } = usePendingCalendarSuggestions();
  const resolveSuggestion = useResolveSuggestion();
  const { syncNow, isPending: syncPending } = useSyncGoogleNow();
  const remindersByInterviewId = useUpcomingRemindersByInterview(interviews);

  const { attachedByInterviewId, unattached } = useMemo(
    () => splitCalendarSuggestions(calendarSuggestions),
    [calendarSuggestions],
  );

  const sort = SORT_OPTIONS[sortOption];

  const roundOptions = useMemo(() => {
    const set = new Set(interviews.map((i) => i.type).filter(Boolean));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [interviews]);

  const filtered = useMemo(() => {
    let list = [...interviews];
    const now = new Date();

    if (filters.q) {
      const q = filters.q.toLowerCase();
      list = list.filter(
        (i) =>
          i.company_name.toLowerCase().includes(q) ||
          i.role.toLowerCase().includes(q) ||
          (i.interviewer ?? "").toLowerCase().includes(q),
      );
    }

    if (filters.when) {
      const when = filters.when;
      list = list.filter((i) => {
        if (when === "completed") return i.status !== "scheduled";
        if (i.status !== "scheduled") return false;
        const sameDay = isSameDay(i.scheduled_at, now);
        return when === "today" ? sameDay : new Date(i.scheduled_at) > now && !sameDay;
      });
    }

    if (filters.round && filters.round.length > 0) {
      const rounds = filters.round;
      list = list.filter((i) => rounds.includes(i.type));
    }

    if (filters.linked) {
      const linked = filters.linked;
      list = list.filter((i) =>
        linked === "linked" ? Boolean(i.application_id) : !i.application_id,
      );
    }

    if (filters.source && filters.source.length > 0) {
      const sources = filters.source;
      list = list.filter((i) => sources.includes(i.source));
    }

    list.sort((a, b) => {
      const dir = sort.direction === "asc" ? 1 : -1;
      return (new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime()) * dir;
    });

    return list;
  }, [interviews, filters, sort]);

  const handleStatusChange = useCallback(
    (interview: Interview, status: InterviewStatus) => {
      updateStatus.mutate(
        { interview, status },
        { onError: () => toast.error("Failed to update status. Please try again.") },
      );
    },
    [updateStatus],
  );

  const handleDelete = useCallback(
    (id: string) => {
      const applicationId = interviews.find((i) => i.id === id)?.application_id ?? null;
      deleteInterview.mutate(
        { id, applicationId },
        {
          onSuccess: () => toast.success("Interview deleted."),
          onError: () => toast.error("Failed to delete interview."),
        },
      );
    },
    [deleteInterview, interviews],
  );

  const handleOpen = useCallback(
    (interview: Interview) => {
      void navigate({
        to: "/dashboard/interviews/$interviewId",
        params: { interviewId: interview.id },
      });
    },
    [navigate],
  );

  function handleDismissSuggestion(id: string) {
    setBusySuggestionId(id);
    resolveSuggestion.mutate(
      { suggestionId: id, decision: { action: "dismiss" } },
      {
        onError: () => toast.error("Failed to dismiss this suggestion."),
        onSettled: () => setBusySuggestionId(null),
      },
    );
  }

  function handleAcceptSuggestion(item: SuggestionListItem) {
    setBusySuggestionId(item.id);
    resolveSuggestion.mutate(
      { suggestionId: item.id, decision: { action: "accept" } },
      {
        onSuccess: (result) => {
          if (result.ok) toast.success("Done — updated from your calendar.");
          else {
            toast.error(result.message);
            setReviewingSuggestion(item);
          }
        },
        onError: () => toast.error("Failed to apply this suggestion."),
        onSettled: () => setBusySuggestionId(null),
      },
    );
  }

  async function handleSyncNow() {
    const { gmailResult, calendarResult } = await syncNow();
    const toastMsg = combinedSyncOutcomeMessage(gmailResult, calendarResult);
    if (toastMsg.tone === "success") toast.success(toastMsg.message);
    else toast.error(toastMsg.message);
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-24 text-sm text-[oklch(0.5_0.02_265)]">
        <Loader2 className="h-5 w-5 animate-spin" />
        Loading interviews…
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center gap-3 py-24 text-center">
        <AlertCircle className="h-8 w-8 text-rose-500" />
        <p className="font-display text-sm font-semibold">Failed to load interviews</p>
        <p className="max-w-xs text-xs text-[oklch(0.5_0.02_265)]">
          {error instanceof Error ? error.message : "An unexpected error occurred."}
        </p>
      </div>
    );
  }

  return (
    <>
      <StickyPageHeader>
        <PageHeader
          eyebrow="Interviews"
          title="Every round, in one place."
          subtitle="Schedule interviews from a tracked application, or add a standalone one — see what's next at a glance."
          leftActions={
            <div className="inline-flex items-center rounded-lg border border-black/5 bg-white p-0.5 text-xs">
              {(["card", "table", "agenda"] as InterviewViewMode[]).map((v) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition-all",
                    view === v
                      ? "bg-[oklch(0.95_0.02_265)] text-[#2563EB]"
                      : "text-[oklch(0.5_0.02_265)] hover:text-[oklch(0.3_0.02_265)]",
                  )}
                >
                  {v === "card" && <LayoutGrid className="h-3.5 w-3.5" />}
                  {v === "table" && <List className="h-3.5 w-3.5" />}
                  {v === "agenda" && <CalendarRange className="h-3.5 w-3.5" />}
                  {v === "card" ? "Card" : v === "table" ? "Table" : "Agenda"}
                </button>
              ))}
            </div>
          }
          actions={
            <>
              <button
                onClick={() => void handleSyncNow()}
                disabled={syncPending}
                title="Syncs every connected Google product together — the same action everywhere in NextOffer."
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-black/5 bg-white px-3 text-xs font-medium text-[oklch(0.3_0.02_265)] hover:bg-black/[0.03] disabled:opacity-50"
              >
                {syncPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
                Sync Now
              </button>

              <DashButton variant="outline" onClick={() => setPickingPrep(true)}>
                <Sparkles className="h-4 w-4" /> Start Preparation
              </DashButton>

              <DashButton onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4" /> New Interview
              </DashButton>
            </>
          }
        />

        <InterviewFiltersBar
          filters={filters}
          sortOption={sortOption}
          onFiltersChange={setFilters}
          onSortChange={setSortOption}
          roundOptions={roundOptions}
          totalCount={filtered.length}
        />
      </StickyPageHeader>

      <PendingCalendarSuggestions
        suggestions={unattached}
        busyId={busySuggestionId}
        onReview={setReviewingSuggestion}
        onDismiss={handleDismissSuggestion}
      />

      {interviews.length === 0 && (
        <EmptyState
          icon={CalendarClock}
          title="No interviews yet"
          body="Schedule one from a tracked application, or add a standalone interview to start prepping."
          cta={
            <DashButton onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" /> New Interview
            </DashButton>
          }
        />
      )}

      {interviews.length > 0 &&
        view === "card" &&
        (filtered.length === 0 ? (
          // Same wording/treatment as InterviewTableView's own empty state for
          // this identical case (filters exclude everything) — previously each
          // view hand-rolled its own slightly different copy.
          <EmptyState
            icon={CalendarClock}
            title="No interviews found"
            body="Try adjusting your filters."
            cta={
              <DashButton variant="outline" onClick={() => setFilters({})}>
                Clear filters
              </DashButton>
            }
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((interview) => (
              <InterviewCard
                key={interview.id}
                interview={interview}
                onOpen={handleOpen}
                onStatusChange={handleStatusChange}
                onEdit={setEditing}
                onDelete={handleDelete}
                pendingSuggestion={attachedByInterviewId.get(interview.id)}
                onReviewSuggestion={setReviewingSuggestion}
                nextReminder={remindersByInterviewId.get(interview.id)}
              />
            ))}
          </div>
        ))}

      {interviews.length > 0 && view === "table" && (
        <InterviewTableView
          interviews={filtered}
          onOpen={handleOpen}
          onEdit={setEditing}
          onDelete={handleDelete}
          onClearFilters={() => setFilters({})}
          pendingSuggestionsByInterviewId={attachedByInterviewId}
          onReviewSuggestion={setReviewingSuggestion}
        />
      )}

      {interviews.length > 0 && view === "agenda" && (
        <InterviewAgendaView
          interviews={filtered}
          onOpen={handleOpen}
          onStatusChange={handleStatusChange}
          onEdit={setEditing}
          onDelete={handleDelete}
          onClearFilters={() => setFilters({})}
          pendingSuggestionsByInterviewId={attachedByInterviewId}
          onReviewSuggestion={setReviewingSuggestion}
        />
      )}

      {createOpen && <ScheduleInterviewDialog onClose={() => setCreateOpen(false)} />}
      {editing && <ScheduleInterviewDialog interview={editing} onClose={() => setEditing(null)} />}
      {pickingPrep && (
        <InterviewPickerDialog interviews={interviews} onClose={() => setPickingPrep(false)} />
      )}

      {/* Same Review → Edit → Accept/Dismiss flow the Inbox uses for Gmail
          suggestions — reused as-is for calendar-sourced ones here. */}
      {reviewingSuggestion && !editingSuggestion && (
        <ReviewPanel
          suggestion={reviewingSuggestion}
          googleEmail={null}
          busy={busySuggestionId === reviewingSuggestion.id}
          onClose={() => setReviewingSuggestion(null)}
          onEdit={() => setEditingSuggestion(reviewingSuggestion)}
          onAccept={() => {
            const target = reviewingSuggestion;
            setReviewingSuggestion(null);
            handleAcceptSuggestion(target);
          }}
          onDismiss={() => {
            const target = reviewingSuggestion;
            setReviewingSuggestion(null);
            handleDismissSuggestion(target.id);
          }}
        />
      )}

      {editingSuggestion && (
        <ReviewSuggestionDialog
          suggestion={editingSuggestion}
          onClose={() => {
            setEditingSuggestion(null);
            setReviewingSuggestion(null);
          }}
        />
      )}
    </>
  );
}
