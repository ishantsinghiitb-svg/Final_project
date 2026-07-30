import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AlertCircle, CalendarClock, LayoutGrid, List, Loader2, Plus, Sparkles } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { EmptyState, PageHeader, StickyPageHeader } from "@/components/dashboard/primitives";
import { InterviewCard } from "@/components/dashboard/interviews/InterviewCard";
import { InterviewTableView } from "@/components/dashboard/interviews/InterviewTableView";
import { InterviewFiltersBar } from "@/components/dashboard/interviews/InterviewFiltersBar";
import { ScheduleInterviewDialog } from "@/components/dashboard/interviews/ScheduleInterviewDialog";
import { InterviewPickerDialog } from "@/components/dashboard/interviews/prep/InterviewPickerDialog";
import { DashButton } from "@/components/dashboard/DashButton";
import {
  useAllInterviews,
  useDeleteInterview,
  useUpdateInterviewStatus,
} from "@/features/interviews/hooks";
import { DEFAULT_INTERVIEW_SORT_OPTION, SORT_OPTIONS } from "@/features/interviews/constants";
import type {
  InterviewFilters,
  InterviewSortOption,
  InterviewViewMode,
} from "@/features/interviews/types";
import type { Interview, InterviewStatus } from "@/types";
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

  const { data: interviews = [], isLoading, isError, error } = useAllInterviews();
  const updateStatus = useUpdateInterviewStatus();
  const deleteInterview = useDeleteInterview();

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
      void navigate({ to: "/dashboard/interviews/$interviewId", params: { interviewId: interview.id } });
    },
    [navigate],
  );

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
          actions={
            <>
              <div className="inline-flex items-center rounded-lg border border-black/5 bg-white p-0.5 text-xs">
                {(["card", "table"] as InterviewViewMode[]).map((v) => (
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
                    {v === "card" ? (
                      <LayoutGrid className="h-3.5 w-3.5" />
                    ) : (
                      <List className="h-3.5 w-3.5" />
                    )}
                    {v === "card" ? "Card" : "Table"}
                  </button>
                ))}
              </div>

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
          <div className="flex flex-col items-center gap-2 py-16 text-center">
            <p className="text-sm font-medium text-[oklch(0.35_0.02_265)]">No interviews found</p>
            <p className="text-xs text-[oklch(0.55_0.02_265)]">Try adjusting your filters.</p>
          </div>
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
        />
      )}

      {createOpen && <ScheduleInterviewDialog onClose={() => setCreateOpen(false)} />}
      {editing && <ScheduleInterviewDialog interview={editing} onClose={() => setEditing(null)} />}
      {pickingPrep && (
        <InterviewPickerDialog interviews={interviews} onClose={() => setPickingPrep(false)} />
      )}
    </>
  );
}
