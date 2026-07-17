import { X, ArchiveRestore, Loader2, Inbox } from "lucide-react";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { CompanyMark } from "@/components/dashboard/primitives";
import { StatusBadge } from "@/components/dashboard/applications/ApplicationCard";
import { useArchivedApplications, useRestoreApplication } from "@/features/applications/hooks";
import { logoToneForCompany } from "@/features/jobs/utils";

type Props = {
  open: boolean;
  onClose: () => void;
};

/**
 * ArchivedApplicationsPanel
 *
 * Opened from the header Archive icon. Lists applications the user archived
 * (hidden from the active board) and lets them restore any of them.
 */
export function ArchivedApplicationsPanel({ open, onClose }: Props) {
  const { data: archived = [], isLoading } = useArchivedApplications();
  const restore = useRestoreApplication();

  if (!open) return null;

  const handleRestore = (id: string, label: string) => {
    restore.mutate(
      { id },
      {
        onSuccess: () => toast.success(`Restored ${label}.`),
        onError: () => toast.error("Failed to restore application."),
      },
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="archived-apps-title"
    >
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={onClose}
      />

      <div className="relative z-10 flex max-h-[80vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-black/5 bg-white shadow-[0_24px_80px_-12px_rgba(0,0,0,0.25)] animate-in slide-in-from-bottom-4 duration-300">
        <div className="h-1.5 w-full shrink-0 bg-gradient-to-r from-[#2563EB] to-[#7C3AED]" />

        <div className="flex shrink-0 items-start justify-between border-b border-black/5 p-5">
          <div>
            <h2 id="archived-apps-title" className="font-display text-base font-semibold text-[oklch(0.2_0.02_265)]">
              Archived Applications
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Hidden from your active board. Restore any of them at any time.
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-[oklch(0.55_0.02_265)] hover:bg-black/[0.05] transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          {isLoading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-[oklch(0.5_0.02_265)]">
              <Loader2 className="h-5 w-5 animate-spin" />
              Loading…
            </div>
          ) : archived.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-16 text-center">
              <Inbox className="h-6 w-6 text-[oklch(0.7_0.02_265)]" />
              <p className="text-sm font-medium text-[oklch(0.35_0.02_265)]">No archived applications</p>
              <p className="max-w-xs text-xs text-[oklch(0.55_0.02_265)]">
                Applications you archive from the board or list will show up here.
              </p>
            </div>
          ) : (
            <ul className="space-y-1.5">
              {archived.map((app) => {
                const tone = logoToneForCompany(app.company_name);
                const label = `${app.role} at ${app.company_name}`;
                const isRestoring = restore.isPending && restore.variables?.id === app.id;

                return (
                  <li
                    key={app.id}
                    className="flex items-center gap-3 rounded-xl border border-black/5 bg-white p-3 hover:bg-[oklch(0.99_0.005_265)] transition-colors"
                  >
                    <CompanyMark company={app.company_name} tone={tone} size={32} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-[oklch(0.2_0.02_265)]">{app.role}</p>
                      <p className="truncate text-xs text-[oklch(0.5_0.02_265)]">{app.company_name}</p>
                      <div className="mt-1 flex items-center gap-2">
                        <StatusBadge status={app.status} />
                        {app.archived_at && (
                          <span className="text-[10px] text-[oklch(0.6_0.02_265)]">
                            Archived {format(parseISO(app.archived_at), "MMM d, yyyy")}
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => handleRestore(app.id, label)}
                      disabled={isRestoring}
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-black/5 bg-white px-2.5 py-1.5 text-xs font-medium text-[#2563EB] hover:bg-[#2563EB]/5 transition-colors disabled:opacity-60"
                    >
                      {isRestoring ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <ArchiveRestore className="h-3.5 w-3.5" />
                      )}
                      Restore
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
