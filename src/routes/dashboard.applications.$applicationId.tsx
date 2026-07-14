import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  MapPin,
  Banknote,
  Globe,
  Calendar,
  ExternalLink,
  Loader2,
  AlertCircle,
  Building2,
  CheckCircle2,
  ChevronDown,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { DashCard, SectionTitle, Chip } from "@/components/dashboard/primitives";
import { CompanyMark } from "@/components/dashboard/primitives";
import { StatusBadge } from "@/components/dashboard/applications/ApplicationCard";
import { useApplication, useUpdateApplicationStatus, useDeleteApplication } from "@/features/applications/hooks";
import { STATUS_META, ALL_STATUSES } from "@/features/applications/constants";
import { logoToneForCompany } from "@/features/jobs/utils";
import type { ApplicationStatus } from "@/types";
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

  const handleStatusChange = (status: ApplicationStatus) => {
    updateStatus.mutate(
      { id: applicationId, status },
      {
        onError: () => toast.error("Failed to update status."),
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
    <div className="mx-auto max-w-3xl space-y-6">
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
            <CompanyMark company={app.company_name} tone={tone} size={52} />
            <div>
              <h1 className="font-display text-xl font-semibold tracking-tight text-[oklch(0.2_0.02_265)]">
                {app.role}
              </h1>
              <p className="mt-0.5 text-sm text-[oklch(0.5_0.02_265)]">
                {app.company_name}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {app.source && (
                  <Chip tone="default">{app.source}</Chip>
                )}
                {app.location && (
                  <Chip tone="default">{app.location}</Chip>
                )}
              </div>
            </div>
          </div>

          {/* Status selector + delete */}
          <div className="flex flex-wrap items-center gap-2">
            <StatusSelector
              current={app.status}
              onChange={handleStatusChange}
              isPending={updateStatus.isPending}
            />
            <button
              onClick={handleDelete}
              disabled={deleteApp.isPending}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-black/5 bg-white px-3 text-sm font-medium text-rose-600 transition-colors hover:bg-rose-50 disabled:opacity-60"
            >
              Delete
            </button>
          </div>
        </div>

        {/* ── Detail grid ──────────────────────────────────────────────── */}
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <DetailTile
            icon={Building2}
            label="Status"
            value={STATUS_META[app.status].label}
            iconColor="text-[#7C3AED]"
          />
          {app.applied_at && (
            <DetailTile
              icon={Calendar}
              label="Applied"
              value={format(parseISO(app.applied_at), "MMM d, yyyy")}
            />
          )}
          {app.location && (
            <DetailTile
              icon={MapPin}
              label="Location"
              value={app.location}
            />
          )}
          {salary && (
            <DetailTile
              icon={Banknote}
              label="Salary"
              value={salary}
              iconColor="text-[#16A34A]"
            />
          )}
          {app.source && (
            <DetailTile
              icon={Globe}
              label="Source"
              value={app.source}
              iconColor="text-[oklch(0.5_0.02_265)]"
            />
          )}
        </div>
      </DashCard>

      {/* ── Links ──────────────────────────────────────────────────────── */}
      {(app.url || app.job_id) && (
        <DashCard>
          <SectionTitle>Links</SectionTitle>
          <div className="mt-4 flex flex-wrap gap-2">
            {app.url && (
              <a
                href={app.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-black/5 bg-white px-3 py-2 text-sm font-medium text-[oklch(0.4_0.02_265)] hover:bg-black/[0.03] transition-colors"
              >
                <ExternalLink className="h-4 w-4 text-[#2563EB]" />
                Job listing
              </a>
            )}
            {app.job_id && (
              <Link
                to="/dashboard/jobs/$jobId"
                params={{ jobId: app.job_id }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-black/5 bg-white px-3 py-2 text-sm font-medium text-[oklch(0.4_0.02_265)] hover:bg-black/[0.03] transition-colors"
              >
                <Building2 className="h-4 w-4 text-[#7C3AED]" />
                Global Job Board entry
              </Link>
            )}
          </div>
        </DashCard>
      )}

      {/* ── Dates metadata ─────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-4 text-[11px] text-[oklch(0.55_0.02_265)]">
        <span>Created {format(parseISO(app.created_at), "MMM d, yyyy 'at' h:mm a")}</span>
        <span>Last updated {format(parseISO(app.updated_at), "MMM d, yyyy 'at' h:mm a")}</span>
      </div>
    </div>
  );
}
