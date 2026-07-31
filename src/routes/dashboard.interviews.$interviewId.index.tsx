import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  AlertCircle,
  ArrowLeft,
  Calendar,
  CheckCircle2,
  ChevronDown,
  FileText,
  Loader2,
  MapPin,
  Mic,
  Pencil,
  Sparkles,
  Trash2,
  Users,
  Video,
} from "lucide-react";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { DashCard, SectionTitle, Chip, CompanyMark } from "@/components/dashboard/primitives";
import { DashButton } from "@/components/dashboard/DashButton";
import { ScheduleInterviewDialog } from "@/components/dashboard/interviews/ScheduleInterviewDialog";
import { useDialogA11y } from "@/hooks/useDialogA11y";
import {
  useDeleteInterview,
  useInterview,
  useUpdateInterviewStatus,
} from "@/features/interviews/hooks";
import { useInterviewPrep } from "@/features/interview-prep/hooks";
import { useMockInterviewSessions } from "@/features/mock-interview/hooks";
import {
  INTERVIEW_STATUS_META,
  LINKED_STATUSES,
  STANDALONE_STATUSES,
  roundTone,
} from "@/features/interviews/constants";
import { logoToneForCompany } from "@/features/jobs/utils";
import { renderRichTextHtml } from "@/lib/richText";
import { useResumes } from "@/features/resumes/hooks";
import type { InterviewStatus } from "@/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/dashboard/interviews/$interviewId/")({
  head: () => ({
    meta: [{ title: "Interview Details — NextOffer" }, { name: "robots", content: "noindex" }],
  }),
  component: InterviewDetailPage,
});

function StatusSelector({
  status,
  allowed,
  onChange,
  isPending,
}: {
  status: InterviewStatus;
  allowed: InterviewStatus[];
  onChange: (s: InterviewStatus) => void;
  isPending: boolean;
}) {
  const [open, setOpen] = useState(false);
  const meta = INTERVIEW_STATUS_META[status];
  const menuRef = useRef<HTMLDivElement>(null);

  // Same outside-click convention InterviewCard's own "⋮" menu already uses,
  // plus Escape — previously this dropdown had neither.
  useEffect(() => {
    if (!open) return;
    const handlePointer = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handlePointer);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handlePointer);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  return (
    <div ref={menuRef} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        disabled={isPending}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="inline-flex h-9 items-center gap-2 rounded-xl border border-black/5 bg-white px-3 text-sm font-medium text-[oklch(0.3_0.02_265)] transition-colors hover:border-black/10 disabled:opacity-60"
      >
        <Chip tone={meta.tone}>{meta.label}</Chip>
        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div
          role="listbox"
          className="absolute right-0 top-11 z-20 w-48 overflow-hidden rounded-xl border border-black/5 bg-white shadow-[0_12px_40px_-8px_rgba(0,0,0,0.18)]"
        >
          {allowed.map((s) => (
            <button
              key={s}
              role="option"
              aria-selected={s === status}
              onClick={() => {
                onChange(s);
                setOpen(false);
              }}
              className={cn(
                "flex w-full items-center gap-2 px-3 py-2.5 text-sm transition-colors",
                s === status
                  ? "bg-[oklch(0.95_0.02_265)] font-medium text-[#2563EB]"
                  : "text-[oklch(0.35_0.02_265)] hover:bg-black/[0.03]",
              )}
            >
              {INTERVIEW_STATUS_META[s].label}
              {s === status && <CheckCircle2 className="ml-auto h-3.5 w-3.5 text-[#2563EB]" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function InterviewDetailPage() {
  const { interviewId } = Route.useParams();
  const navigate = useNavigate();
  const { data: interview, isLoading, isError } = useInterview(interviewId);
  const { data: prep } = useInterviewPrep(interviewId);
  const { data: mockSessions = [] } = useMockInterviewSessions(interviewId);
  const { data: resumes = [] } = useResumes();
  const updateStatus = useUpdateInterviewStatus();
  const deleteInterview = useDeleteInterview();

  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-16 text-sm text-[oklch(0.5_0.02_265)]">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading interview…
      </div>
    );
  }

  if (isError || !interview) {
    return (
      <div className="flex flex-col items-center gap-3 py-24 text-center">
        <AlertCircle className="h-8 w-8 text-rose-500" />
        <p className="font-display text-sm font-semibold">Interview not found</p>
        <p className="max-w-xs text-xs text-[oklch(0.5_0.02_265)]">It may have been deleted.</p>
        <Link
          to="/dashboard/interviews"
          className="text-sm font-medium text-[#2563EB] hover:underline"
        >
          Back to interviews
        </Link>
      </div>
    );
  }

  const tone = logoToneForCompany(interview.company_name);
  const allowedStatuses = interview.application_id ? LINKED_STATUSES : STANDALONE_STATUSES;
  const resumeName =
    (interview.resume_id && resumes.find((r) => r.id === interview.resume_id)?.name) ||
    interview.resume_name_snapshot;

  const questionCount = prep?.content?.questions.length ?? 0;
  const prepStatusLabel = prep
    ? questionCount > 0
      ? `Prep ready · ${questionCount} question${questionCount === 1 ? "" : "s"}`
      : "Prep ready"
    : null;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <Link
        to="/dashboard/interviews"
        className="inline-flex items-center gap-1.5 text-sm text-[oklch(0.5_0.02_265)] transition-colors hover:text-[oklch(0.2_0.02_265)]"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Interviews
      </Link>

      <DashCard>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <CompanyMark
              company={interview.company_name}
              tone={tone}
              size={52}
              logoUrl={interview.company_logo_url}
            />
            <div>
              <h1 className="font-display text-xl font-semibold tracking-tight text-[oklch(0.2_0.02_265)]">
                {interview.role}
              </h1>
              <p className="mt-0.5 text-sm text-[oklch(0.5_0.02_265)]">{interview.company_name}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Chip tone={roundTone(interview.type)}>{interview.type}</Chip>
                {interview.application_id && <Chip tone="default">Linked</Chip>}
                {prepStatusLabel && <Chip tone="green">{prepStatusLabel}</Chip>}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <StatusSelector
              status={interview.status}
              allowed={allowedStatuses}
              isPending={updateStatus.isPending}
              onChange={(status) =>
                updateStatus.mutate(
                  { interview, status },
                  { onError: () => toast.error("Failed to update status.") },
                )
              }
            />
            <button
              onClick={() => setEditing(true)}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-black/5 bg-white px-3 text-sm font-medium text-[oklch(0.4_0.02_265)] transition-colors hover:bg-black/[0.03]"
            >
              <Pencil className="h-4 w-4" /> Edit
            </button>
            <button
              onClick={() => setDeleting(true)}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-black/5 bg-white px-3 text-sm font-medium text-rose-600 transition-colors hover:bg-rose-50"
            >
              <Trash2 className="h-4 w-4" /> Delete
            </button>
          </div>
        </div>
      </DashCard>

      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        <div className="space-y-6">
          <DashCard>
            <SectionTitle>Interview Details</SectionTitle>
            <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
              <DetailTile
                icon={Calendar}
                label="Date & time"
                value={format(parseISO(interview.scheduled_at), "MMM d, yyyy 'at' h:mm a")}
              />
              <DetailTile
                icon={interview.mode === "online" ? Video : MapPin}
                label={interview.mode === "online" ? "Meeting link" : "Location"}
                value={
                  interview.mode === "online"
                    ? interview.link || "Online"
                    : interview.location || "Offline"
                }
              />
              {interview.interviewer && (
                <DetailTile icon={Users} label="Interviewer" value={interview.interviewer} />
              )}
              {resumeName && <DetailTile icon={FileText} label="Resume" value={resumeName} />}
            </div>
          </DashCard>

          {interview.notes && (
            <DashCard>
              <SectionTitle>Notes</SectionTitle>
              <div
                className="prose prose-sm mt-3 max-w-none text-[oklch(0.35_0.02_265)]"
                dangerouslySetInnerHTML={{ __html: renderRichTextHtml(interview.notes) }}
              />
            </DashCard>
          )}
        </div>

        <div className="space-y-4">
          <DashCard className="border-[#2563EB]/15 bg-gradient-to-br from-[#2563EB]/[0.03] to-[#7C3AED]/[0.04]">
            <div className="flex items-center gap-2">
              <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-[#2563EB]/15 to-[#7C3AED]/20 text-[#7C3AED]">
                <Sparkles className="h-4 w-4" />
              </div>
              <p className="font-display text-sm font-semibold text-[oklch(0.2_0.02_265)]">
                AI Interview Preparation
              </p>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-[oklch(0.45_0.02_265)]">
              {prep
                ? "Your personalized preparation is ready — questions, priority topics, and answers you can practice."
                : "Get a personalized workspace: likely questions, priority topics, resume weak areas and STAR story ideas — built from your resume and this job."}
            </p>
            <DashButton
              className="mt-4 w-full"
              onClick={() =>
                void navigate({
                  to: "/dashboard/interviews/$interviewId/prep",
                  params: { interviewId: interview.id },
                })
              }
            >
              <Sparkles className="h-4 w-4" /> {prep ? "Open Preparation" : "Start Preparation"}
            </DashButton>
          </DashCard>

          <DashCard className="border-[#2563EB]/15 bg-gradient-to-br from-[#2563EB]/[0.03] to-[#7C3AED]/[0.04]">
            <div className="flex items-center gap-2">
              <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-[#2563EB]/15 to-[#7C3AED]/20 text-[#7C3AED]">
                <Mic className="h-4 w-4" />
              </div>
              <p className="font-display text-sm font-semibold text-[oklch(0.2_0.02_265)]">
                AI Mock Interview
              </p>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-[oklch(0.45_0.02_265)]">
              {mockSessions.length > 0
                ? "Practice a realistic, adaptive interview and get evaluated — pick up a past session or start a new one."
                : prep
                  ? "Put your preparation into practice — a real, adaptive interview with an AI interviewer that probes, challenges and evaluates you like a human would."
                  : "Practice a realistic interview with an AI interviewer that adapts to your answers, then get a full evaluation report."}
            </p>
            <DashButton
              className="mt-4 w-full"
              onClick={() =>
                void navigate({
                  to: "/dashboard/interviews/$interviewId/mock",
                  params: { interviewId: interview.id },
                })
              }
            >
              <Mic className="h-4 w-4" />{" "}
              {mockSessions.length > 0 ? "Open Mock Interview" : "Start Mock Interview"}
            </DashButton>
          </DashCard>
        </div>
      </div>

      {editing && (
        <ScheduleInterviewDialog interview={interview} onClose={() => setEditing(false)} />
      )}

      {deleting && (
        <ConfirmDeleteDialog
          companyName={interview.company_name}
          busy={deleteInterview.isPending}
          onCancel={() => setDeleting(false)}
          onConfirm={() =>
            deleteInterview.mutate(
              { id: interview.id, applicationId: interview.application_id },
              {
                onSuccess: () => {
                  toast.success("Interview deleted.");
                  void navigate({ to: "/dashboard/interviews" });
                },
                onError: () => toast.error("Failed to delete interview."),
              },
            )
          }
        />
      )}
    </div>
  );
}

function DetailTile({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-[oklch(0.55_0.02_265)]" />
      <div className="min-w-0">
        <p className="text-[10px] font-medium uppercase tracking-wider text-[oklch(0.55_0.02_265)]">
          {label}
        </p>
        <p className="truncate text-sm text-[oklch(0.3_0.02_265)]" title={value}>
          {value}
        </p>
      </div>
    </div>
  );
}

function ConfirmDeleteDialog({
  companyName,
  busy,
  onCancel,
  onConfirm,
}: {
  companyName: string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const dialogRef = useDialogA11y<HTMLDivElement>(true, () => {
    if (!busy) onCancel();
  });

  return (
    <div
      ref={dialogRef}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
    >
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={busy ? undefined : onCancel}
      />
      <div className="relative z-10 w-full max-w-sm rounded-2xl border border-black/5 bg-white p-6 shadow-[0_24px_80px_-12px_rgba(0,0,0,0.25)]">
        <h2 className="font-display text-base font-semibold text-[oklch(0.2_0.02_265)]">
          Delete this interview?
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The interview with{" "}
          <span className="font-medium text-[oklch(0.3_0.02_265)]">{companyName}</span> and any AI
          preparation, mock interviews and reports for it will be permanently removed. This can't be
          undone.
        </p>
        <div className="mt-5 flex flex-col gap-2">
          <button
            onClick={onConfirm}
            disabled={busy}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-rose-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-rose-700 disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Delete permanently
          </button>
          <button
            onClick={onCancel}
            disabled={busy}
            className="inline-flex w-full items-center justify-center rounded-xl border border-black/5 bg-white py-2.5 text-sm font-medium text-[oklch(0.4_0.02_265)] transition-colors hover:bg-black/[0.03] disabled:opacity-60"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
