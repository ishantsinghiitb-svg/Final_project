import { createFileRoute } from "@tanstack/react-router";
import { LayoutGrid, List, Briefcase, Loader2, AlertCircle } from "lucide-react";
import { useState, useCallback, useMemo } from "react";
import { toast } from "sonner";
import { PageHeader, EmptyState } from "@/components/dashboard/primitives";
import { KanbanBoard } from "@/components/dashboard/applications/KanbanBoard";
import { ApplicationListView } from "@/components/dashboard/applications/ApplicationListView";
import { ApplicationFiltersBar } from "@/components/dashboard/applications/ApplicationFiltersBar";
import {
  useAllApplications,
  useUpdateApplicationStatus,
  useDeleteApplication,
} from "@/features/applications/hooks";
import {
  SORT_OPTIONS,
  DEFAULT_APPLICATION_SORT_OPTION,
} from "@/features/applications/constants";
import type { ApplicationFilters, ApplicationSortOption } from "@/features/applications/types";
import type { ApplicationStatus } from "@/types";
import { cn } from "@/lib/utils";

// ── Route definition ──────────────────────────────────────────────────────────
export const Route = createFileRoute("/dashboard/applications/")({
  head: () => ({
    meta: [
      { title: "Applications — NextOffer" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AppsPage,
});

// ── View toggle ───────────────────────────────────────────────────────────────
type ViewMode = "board" | "list";

function AppsPage() {
  const [view, setView] = useState<ViewMode>("board");
  const [filters, setFilters] = useState<ApplicationFilters>({});
  const [sortOption, setSortOption] = useState<ApplicationSortOption>(
    DEFAULT_APPLICATION_SORT_OPTION,
  );

  const { data: applications = [], isLoading, isError, error } = useAllApplications();
  const updateStatus = useUpdateApplicationStatus();
  const deleteApp = useDeleteApplication();

  const sort = SORT_OPTIONS[sortOption];

  // Apply client-side filtering + sorting to the full application list
  const filtered = useMemo(() => {
    let apps = [...applications];

    // Text search
    if (filters.q) {
      const q = filters.q.toLowerCase();
      apps = apps.filter(
        (a) =>
          a.company_name.toLowerCase().includes(q) ||
          a.role.toLowerCase().includes(q) ||
          (a.notes ?? "").toLowerCase().includes(q),
      );
    }

    // Status filter
    if (filters.status) {
      const statuses = Array.isArray(filters.status) ? filters.status : [filters.status];
      apps = apps.filter((a) => statuses.includes(a.status));
    }

    // Company filter
    if (filters.company) {
      const company = filters.company.toLowerCase();
      apps = apps.filter((a) => a.company_name.toLowerCase().includes(company));
    }

    // Source filter
    if (filters.source) {
      apps = apps.filter((a) => a.source === filters.source);
    }

    // Sort
    apps.sort((a, b) => {
      const field = sort.field;
      const dir = sort.direction === "asc" ? 1 : -1;

      const av = (a as Record<string, unknown>)[field];
      const bv = (b as Record<string, unknown>)[field];

      if (av === null || av === undefined) return 1;
      if (bv === null || bv === undefined) return -1;

      if (typeof av === "string" && typeof bv === "string") {
        return av.localeCompare(bv) * dir;
      }
      return 0;
    });

    return apps;
  }, [applications, filters, sort]);

  const handleStatusChange = useCallback(
    (id: string, status: ApplicationStatus) => {
      updateStatus.mutate(
        { id, status },
        {
          onError: () => toast.error("Failed to update status. Please try again."),
        },
      );
    },
    [updateStatus],
  );

  const handleDelete = useCallback(
    (id: string) => {
      deleteApp.mutate(
        { id },
        {
          onSuccess: () => toast.success("Application deleted."),
          onError: () => toast.error("Failed to delete application."),
        },
      );
    },
    [deleteApp],
  );

  // ── States ────────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-24 text-sm text-[oklch(0.5_0.02_265)]">
        <Loader2 className="h-5 w-5 animate-spin" />
        Loading applications…
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center gap-3 py-24 text-center">
        <AlertCircle className="h-8 w-8 text-rose-500" />
        <p className="font-display text-sm font-semibold">Failed to load applications</p>
        <p className="max-w-xs text-xs text-[oklch(0.5_0.02_265)]">
          {error instanceof Error ? error.message : "An unexpected error occurred."}
        </p>
      </div>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Applications"
        title="Track every step, without losing the thread."
        subtitle="Apply to jobs and confirm to start tracking. Drag cards between stages to update your pipeline."
        actions={
          <div className="inline-flex items-center rounded-lg border border-black/5 bg-white p-0.5 text-xs">
            {(["board", "list"] as ViewMode[]).map((v) => (
              <button
                key={v}
                id={`view-toggle-${v}`}
                onClick={() => setView(v)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition-all",
                  view === v
                    ? "bg-[oklch(0.95_0.02_265)] text-[#2563EB]"
                    : "text-[oklch(0.5_0.02_265)] hover:text-[oklch(0.3_0.02_265)]",
                )}
              >
                {v === "board" ? (
                  <LayoutGrid className="h-3.5 w-3.5" />
                ) : (
                  <List className="h-3.5 w-3.5" />
                )}
                {v === "board" ? "Board" : "List"}
              </button>
            ))}
          </div>
        }
      />

      {/* Filters bar */}
      <ApplicationFiltersBar
        filters={filters}
        sortOption={sortOption}
        onFiltersChange={setFilters}
        onSortChange={setSortOption}
        totalCount={filtered.length}
      />

      {/* Empty state */}
      {applications.length === 0 && (
        <EmptyState
          icon={Briefcase}
          title="No applications yet"
          body="Browse the Jobs board, click a job, then hit 'Apply Now'. When you return, confirm you applied and it'll appear here."
        />
      )}

      {/* Board view */}
      {view === "board" && applications.length > 0 && (
        <KanbanBoard
          applications={filtered}
          onStatusChange={handleStatusChange}
          onDelete={handleDelete}
        />
      )}

      {/* List view */}
      {view === "list" && applications.length > 0 && (
        <ApplicationListView
          applications={filtered}
          onStatusChange={handleStatusChange}
          onDelete={handleDelete}
        />
      )}
    </>
  );
}
