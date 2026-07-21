import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  MapPin,
  Banknote,
  Calendar,
  ExternalLink,
  Loader2,
  AlertCircle,
  Building2,
  Briefcase,
  Wifi,
  Users,
  Landmark,
  CheckCircle2,
  ChevronDown,
  Flag,
  Archive,
  ArchiveRestore,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { DashCard, SectionTitle, Chip } from "@/components/dashboard/primitives";
import { CompanyMark } from "@/components/dashboard/primitives";
import { ApplicationTimeline } from "@/components/dashboard/applications/ApplicationTimeline";
import { ApplicationNotes } from "@/components/dashboard/applications/ApplicationNotes";
import { ApplicationContacts } from "@/components/dashboard/applications/ApplicationContacts";
import { ApplicationReminders } from "@/components/dashboard/applications/ApplicationReminders";
import { ApplicationAttachments } from "@/components/dashboard/applications/ApplicationAttachments";
import { ApplicationResumeCard } from "@/components/dashboard/applications/ApplicationResumeCard";
import { ApplicationCoverLetterCard } from "@/components/dashboard/applications/ApplicationCoverLetterCard";
import { PrioritySelector } from "@/components/dashboard/applications/PrioritySelector";
import { AddToCollectionMenu } from "@/components/dashboard/collections/AddToCollectionMenu";
import {
  useApplication,
  useUpdateApplicationStatus,
  useDeleteApplication,
  useUpdatePriority,
  useArchiveApplication,
  useRestoreApplication,
} from "@/features/applications/hooks";
import { useJob } from "@/features/jobs/hooks";
import { useCompany } from "@/features/companies/hooks";
import { STATUS_META, ALL_STATUSES, PRIORITY_META } from "@/features/applications/constants";
import { logoToneForCompany, getJobBadges, formatSourceLabel } from "@/features/jobs/utils";
import type { ApplicationPriority, ApplicationStatus } from "@/types";
import { cn } from "@/lib/utils";
import { format, parseISO } from "date-fns";

// ── Route definition ──────────────────────────────────────────────────────────
export const Route = createFileRoute("/dashboard/applications/$applicationId")({
  head: () => ({
    meta: [
      { title: "Application Details — NextOffer" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ApplicationDetailPage,
});

// ── Status selector ───────────────────────────────────────────────────────────
function StatusSelector({
  current,
  onChange,
  isPending,
}: {
  current: ApplicationStatus;
  onChange: (s: ApplicationStatus) => void;
  isPending: boolean;
}) {
  const [open, setOpen] = useState(false);
  const meta = STATUS_META[current];

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        disabled={isPending}
        className={cn(
          "inline-flex items-center gap-2 rounded-xl border border-black/5 bg-white px-3 py-2 text-sm font-medium transition-colors hover:border-black/10",
          isPending && "opacity-60 cursor-not-allowed",
        )}
      >
        <span className={cn("h-2 w-2 rounded-full", meta.dot)} />
        <span className={meta.text}>{meta.label}</span>
        <ChevronDown className={cn("h-3.5 w-3.5 text-[oklch(0.5_0.02_265)] transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="absolute left-0 top-11 z-20 w-52 overflow-hidden rounded-xl border border-black/5 bg-white shadow-[0_12px_40px_-8px_rgba(0,0,0,0.18)]">
          {ALL_STATUSES.map((s) => {
            const sm = STATUS_META[s];
            return (
              <button
                key={s}
                onClick={() => { onChange(s); setOpen(false); }}
                className={cn(
                  "flex w-full items-center gap-2.5 px-3 py-2.5 text-sm transition-colors",
                  s === current
                    ? "bg-[oklch(0.95_0.02_265)] font-medium text-[#2563EB]"
                    : "text-[oklch(0.35_0.02_265)] hover:bg-black/[0.03]",
                )}
              >
                <span className={cn("h-2 w-2 rounded-full", sm.dot)} />
                {sm.label}
                {s === current && <CheckCircle2 className="ml-auto h-3.5 w-3.5 text-[#2563EB]" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Detail tile ───────────────────────────────────────────────────────────────
function DetailTile({
  icon: Icon,
  label,
  value,
  iconColor = "text-[#2563EB]",
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  iconColor?: string;
}) {
  return (
    <div className="flex items-start gap-2.5 rounded-xl bg-[oklch(0.97_0.01_265)] p-3">
      <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", iconColor)} />
      <div>
        <p className="text-[10px] font-medium uppercase tracking-wide text-[oklch(0.55_0.02_265)]">
          {label}
        </p>
        <p className="mt-0.5 text-sm font-medium text-[oklch(0.2_0.02_265)]">{value}</p>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
function ApplicationDetailPage() {
  const { applicationId } = Route.useParams();
  const navigate = useNavigate();

  const { data: app, isLoading, isError, error } = useApplication(applicationId);
  const updateStatus = useUpdateApplicationStatus();
  const deleteApp = useDeleteApplication();
  const updatePriority = useUpdatePriority(applicationId);
  const archiveApp = useArchiveApplication();
  const restoreApp = useRestoreApplication();

  // Best-effort enrichment from the linked GlobalJob — never renders the
  // description, only structural fields the Application itself doesn't store.
  const { data: job } = useJob(app?.job_id ?? undefined);
  const { data: company } = useCompany(job?.company_id ?? undefined);

  const handleStatusChange = (status: ApplicationStatus) => {
    updateStatus.mutate(
      { id: applicationId, status },
      {
        onError: () => toast.error("Failed to update status."),
      },
    );
  };

  const handlePriorityChange = (priority: ApplicationPriority | null) => {
    updatePriority.mutate(priority, {
      onError: () => toast.error("Failed to update priority."),
    });
  };

  const handleArchive = () => {
    archiveApp.mutate(
      { id: applicationId },
      {
        onSuccess: () => toast.success("Application archived."),
        onError: () => toast.error("Failed to archive application."),
      },
    );
  };

  const handleRestore = () => {
    restoreApp.mutate(
      { id: applicationId },
      {
        onSuccess: () => toast.success("Application restored."),
        onError: () => toast.error("Failed to restore application."),
      },
    );
  };

  const handleDelete = () => {
    if (!confirm("Delete this application? This cannot be undone.")) return;
    deleteApp.mutate(
      { id: applicationId },
      {
        onSuccess: () => {
          toast.success("Application deleted.");
          void navigate({ to: "/dashboard/applications" });
        },
        onError: () => toast.error("Failed to delete application."),
      },
    );
  };

  // ── Loading ───────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-24 text-sm text-[oklch(0.5_0.02_265)]">
        <Loader2 className="h-5 w-5 animate-spin" />
        Loading application…
      </div>
    );
  }

  // ── Error ─────────────────────────────────────────────────────────────────
  if (isError) {
    return (
      <div className="flex flex-col items-center gap-3 py-24 text-center">
        <AlertCircle className="h-8 w-8 text-rose-500" />
        <p className="font-display text-sm font-semibold">Failed to load application</p>
        <p className="max-w-xs text-xs text-[oklch(0.5_0.02_265)]">
          {error instanceof Error ? error.message : "An unexpected error occurred."}
        </p>
        <Link
          to="/dashboard/applications"
          className="mt-2 text-xs text-[#2563EB] hover:underline"
        >
          ← Back to Applications
        </Link>
      </div>
    );
  }

  // ── Not found ─────────────────────────────────────────────────────────────
  if (!app) {
    return (
      <div className="flex flex-col items-center gap-3 py-24 text-center">
        <AlertCircle className="h-8 w-8 text-amber-500" />
        <p className="font-display text-sm font-semibold">Application not found</p>
        <Link
          to="/dashboard/applications"
          className="mt-2 text-xs text-[#2563EB] hover:underline"
        >
          ← Back to Applications
        </Link>
      </div>
    );
  }

  const tone = logoToneForCompany(app.company_name);

  const salary = (() => {
    if (!app.salary_min && !app.salary_max) return null;
    const currency = app.salary_currency ?? "USD";
    const fmt = (n: number) =>
      new Intl.NumberFormat("en-US", {
        style: "currency",
        currency,
        notation: "compact",
        maximumFractionDigits: 0,
      }).format(n);
    if (app.salary_min && app.salary_max)
      return `${fmt(app.salary_min)} – ${fmt(app.salary_max)}`;
    if (app.salary_min) return `${fmt(app.salary_min)}+`;
    if (app.salary_max) return `Up to ${fmt(app.salary_max)}`;
    return null;
  })();

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Back button */}
      <Link
        to="/dashboard/applications"
        className="inline-flex items-center gap-1.5 text-sm text-[oklch(0.5_0.02_265)] hover:text-[oklch(0.2_0.02_265)] transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Applications
      </Link>

      {/* ── Header card ─────────────────────────────────────────────────── */}
      <DashCard>
        <div className="flex flex-wrap items-start justify-between gap-4">
          {/* Company + role */}
          <div className="flex items-start gap-4">
            <CompanyMark company={app.company_name} tone={tone} size={52} logoUrl={job?.company_logo_url} />
            <div>
              <h1 className="font-display text-xl font-semibold tracking-tight text-[oklch(0.2_0.02_265)]">
                {app.role}
              </h1>
              <p className="mt-0.5 text-sm text-[oklch(0.5_0.02_265)]">
                {app.company_name}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {app.archived && (
                  <Chip tone="default">
                    Archived
                    {app.archived_at && ` ${format(parseISO(app.archived_at), "MMM d, yyyy")}`}
                  </Chip>
                )}
                {app.source && (
                  <Chip tone="default">{formatSourceLabel(app.source)}</Chip>
                )}
                {app.location && (
                  <Chip tone="default">{app.location}</Chip>
                )}
                {job &&
                  getJobBadges(job).map((badge) => (
                    <Chip key={badge.key} tone={badge.tone}>
                      {badge.label}
                    </Chip>
                  ))}
              </div>
            </div>
          </div>

          {/* Status + priority selectors + delete */}
          <div className="flex flex-wrap items-center gap-2">
            <StatusSelector
              current={app.status}
              onChange={handleStatusChange}
              isPending={updateStatus.isPending}
            />
            <PrioritySelector
              value={app.priority}
              onChange={handlePriorityChange}
              isPending={updatePriority.isPending}
            />
            {/* Reuses the same AddToCollectionMenu as Jobs/Saved/Job Detail —
                only rendered once the linked GlobalJob has loaded, since
                collections reference global_jobs, not applications. */}
            {job && <AddToCollectionMenu job={job} label="Collections" />}
            {app.archived ? (
              <button
                onClick={handleRestore}
                disabled={restoreApp.isPending}
                className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-black/5 bg-white px-3 text-sm font-medium text-[#2563EB] transition-colors hover:bg-[#2563EB]/5 disabled:opacity-60"
              >
                <ArchiveRestore className="h-4 w-4" /> Restore
              </button>
            ) : (
              <button
                onClick={handleArchive}
                disabled={archiveApp.isPending}
                className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-black/5 bg-white px-3 text-sm font-medium text-[oklch(0.4_0.02_265)] transition-colors hover:bg-black/[0.03] disabled:opacity-60"
              >
                <Archive className="h-4 w-4" /> Archive
              </button>
            )}
            <button
              onClick={handleDelete}
              disabled={deleteApp.isPending}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-black/5 bg-white px-3 text-sm font-medium text-rose-600 transition-colors hover:bg-rose-50 disabled:opacity-60"
            >
              Delete
            </button>
          </div>
        </div>
      </DashCard>

      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        {/* ── Left: Application Summary + Timeline ────────────────────── */}
        <div className="space-y-6">
          {/* Application summary */}
          <DashCard>
            <SectionTitle>Application Summary</SectionTitle>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {app.applied_at && (
                <DetailTile
                  icon={Calendar}
                  label="Applied Date"
                  value={format(parseISO(app.applied_at), "MMM d, yyyy")}
                />
              )}
              {app.priority && (
                <DetailTile
                  icon={Flag}
                  label="Priority"
                  value={PRIORITY_META[app.priority].label}
                  iconColor="text-[#F59E0B]"
                />
              )}
              {app.location && (
                <DetailTile icon={MapPin} label="Location" value={app.location} />
              )}
              {salary && (
                <DetailTile icon={Banknote} label="Salary" value={salary} iconColor="text-[#16A34A]" />
              )}
              {job?.employment_type && (
                <DetailTile icon={Briefcase} label="Employment Type" value={job.employment_type} />
              )}
              {job?.work_mode && (
                <DetailTile icon={Wifi} label="Work Mode" value={job.work_mode} iconColor="text-[#0EA5E9]" />
              )}
              {job?.experience_level && (
                <DetailTile
                  icon={Building2}
                  label="Experience Level"
                  value={job.experience_level}
                  iconColor="text-[#F59E0B]"
                />
              )}
              {company?.size && (
                <DetailTile icon={Landmark} label="Company Size" value={company.size} />
              )}
              {typeof job?.applicant_count === "number" && (
                <DetailTile icon={Users} label="Applicants" value={String(job.applicant_count)} />
              )}
            </div>
          </DashCard>

          {/* Notes */}
          <DashCard>
            <SectionTitle>Notes</SectionTitle>
            <div className="mt-4">
              <ApplicationNotes application={app} />
            </div>
          </DashCard>

          {/* Contacts */}
          <DashCard>
            <SectionTitle>Contacts</SectionTitle>
            <div className="mt-3">
              <ApplicationContacts applicationId={app.id} />
            </div>
          </DashCard>

          {/* Reminders */}
          <DashCard>
            <SectionTitle>Reminders</SectionTitle>
            <div className="mt-3">
              <ApplicationReminders applicationId={app.id} />
            </div>
          </DashCard>

          {/* Timeline */}
          <DashCard>
            <SectionTitle>Timeline</SectionTitle>
            <ApplicationTimeline applicationId={app.id} />
          </DashCard>
        </div>

        {/* ── Right: Links + Resume + Cover Letter + Attachments ────────── */}
        <div className="space-y-4">
          {(app.url || app.job_id) && (
            <DashCard>
              <SectionTitle>Links</SectionTitle>
              <div className="mt-4 flex flex-col gap-2">
                {app.url && (
                  <a
                    href={app.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-black/5 bg-white px-3 py-2 text-sm font-medium text-[oklch(0.4_0.02_265)] hover:bg-black/[0.03] transition-colors"
                  >
                    <ExternalLink className="h-4 w-4 text-[#2563EB]" />
                    Job Listing
                  </a>
                )}
                {app.job_id && (
                  <Link
                    to="/dashboard/jobs/$jobId"
                    params={{ jobId: app.job_id }}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-black/5 bg-white px-3 py-2 text-sm font-medium text-[oklch(0.4_0.02_265)] hover:bg-black/[0.03] transition-colors"
                  >
                    <Building2 className="h-4 w-4 text-[#7C3AED]" />
                    View Job
                  </Link>
                )}
              </div>
            </DashCard>
          )}

          <DashCard>
            <SectionTitle>Resume</SectionTitle>
            <div className="mt-3">
              <ApplicationResumeCard applicationId={app.id} resumeId={app.resume_id} />
            </div>
          </DashCard>

          <DashCard>
            <SectionTitle>Cover Letter</SectionTitle>
            <div className="mt-3">
              <ApplicationCoverLetterCard applicationId={app.id} coverLetterId={app.cover_letter_id} />
            </div>
          </DashCard>

          <DashCard>
            <SectionTitle>Attachments</SectionTitle>
            <div className="mt-3">
              <ApplicationAttachments applicationId={app.id} />
            </div>
          </DashCard>
        </div>
      </div>

      {/* ── Dates metadata ─────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-4 text-[11px] text-[oklch(0.55_0.02_265)]">
        <span>Created {format(parseISO(app.created_at), "MMM d, yyyy 'at' h:mm a")}</span>
        <span>Last updated {format(parseISO(app.updated_at), "MMM d, yyyy 'at' h:mm a")}</span>
      </div>
    </div>
  );
}
