import { useState } from "react";
import { Calendar, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Chip } from "@/components/dashboard/primitives";
import { useDeleteInterview, useInterviewsForApplication } from "@/features/interviews/hooks";
import { useResumes } from "@/features/resumes/hooks";
import { INTERVIEW_STATUS_META, roundTone } from "@/features/interviews/constants";
import { promptMoveToInterviewStage } from "@/features/interviews/sync";
import { ScheduleInterviewDialog } from "@/components/dashboard/interviews/ScheduleInterviewDialog";
import { useUpdateApplicationStatus } from "@/features/applications/hooks";
import type { ApplicationStatus, Interview } from "@/types";
import { format, parseISO } from "date-fns";

type Props = {
  applicationId: string;
  companyName: string;
  role: string;
  status: ApplicationStatus;
  resumeId?: string | null;
};

/**
 * ApplicationInterviews
 *
 * Interview rounds scheduled for this application — "Schedule Interview"
 * pre-fills company/role/resume from the application (see
 * ScheduleInterviewDialog's linkedApplication prop). Scheduling one while the
 * application isn't yet in the Interview stage offers to move it there too
 * (Flow A of the Applications↔Interviews sync — see features/interviews/sync.ts).
 */
export function ApplicationInterviews({
  applicationId,
  companyName,
  role,
  status,
  resumeId,
}: Props) {
  const { data: interviews = [], isLoading } = useInterviewsForApplication(applicationId);
  const { data: resumes = [] } = useResumes();
  const deleteInterview = useDeleteInterview();
  const updateStatus = useUpdateApplicationStatus();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Interview | null>(null);

  const resumeName = resumeId ? (resumes.find((r) => r.id === resumeId)?.name ?? null) : null;

  const handleCreated = () => {
    if (status === "interview") return;
    promptMoveToInterviewStage(applicationId, () => {
      updateStatus.mutate(
        { id: applicationId, status: "interview" },
        { onError: () => toast.error("Failed to update application status.") },
      );
    });
  };

  const handleDelete = (id: string) => {
    deleteInterview.mutate(
      { id, applicationId },
      {
        onSuccess: () => toast.success("Interview removed."),
        onError: () => toast.error("Failed to remove interview."),
      },
    );
  };

  return (
    <div>
      <div className="flex items-center justify-between">
        <p className="text-xs text-[oklch(0.55_0.02_265)]">
          Interview rounds for this application.
        </p>
        <button
          onClick={() => setDialogOpen(true)}
          className="inline-flex items-center gap-1 rounded-lg border border-black/5 bg-white px-2.5 py-1.5 text-xs font-medium text-[#2563EB] hover:bg-[#2563EB]/5 transition-colors"
        >
          <Plus className="h-3.5 w-3.5" /> Schedule
        </button>
      </div>

      <div className="mt-3 space-y-2">
        {isLoading ? (
          <div className="py-3 text-xs text-[oklch(0.5_0.02_265)]">Loading interviews…</div>
        ) : interviews.length === 0 ? (
          <p className="py-2 text-xs text-[oklch(0.55_0.02_265)]">No interviews scheduled yet.</p>
        ) : (
          interviews.map((interview) => {
            const statusMeta = INTERVIEW_STATUS_META[interview.status];
            return (
              <div
                key={interview.id}
                onClick={() => setEditing(interview)}
                className="group flex cursor-pointer items-start gap-3 rounded-xl border border-black/5 bg-white p-3 hover:bg-[oklch(0.99_0.005_265)] transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Chip tone={roundTone(interview.type)}>{interview.type}</Chip>
                    <Chip tone={statusMeta.tone}>{statusMeta.label}</Chip>
                  </div>
                  <p className="mt-1 flex items-center gap-1 text-[11px] text-[oklch(0.55_0.02_265)]">
                    <Calendar className="h-3 w-3 shrink-0" />
                    {format(parseISO(interview.scheduled_at), "MMM d, yyyy · h:mm a")}
                  </p>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(interview.id);
                  }}
                  aria-label="Remove interview"
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-[oklch(0.5_0.02_265)] opacity-0 transition-opacity hover:bg-rose-50 hover:text-rose-600 group-hover:opacity-100"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })
        )}
      </div>

      {dialogOpen && (
        <ScheduleInterviewDialog
          linkedApplication={{ applicationId, companyName, role, resumeId, resumeName }}
          onClose={() => setDialogOpen(false)}
          onCreated={handleCreated}
        />
      )}
      {editing && <ScheduleInterviewDialog interview={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
