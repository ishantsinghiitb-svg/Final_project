import {
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { applicationService } from "@/services/ApplicationService";
import type { Application, ApplicationStatus, GlobalJob } from "@/types";
import type { ApplicationFilters, ApplicationSort } from "@/features/applications/types";
import type { PaginationParams } from "@/types";
import {
  DEFAULT_APPLICATION_SORT,
} from "@/features/applications/constants";

// ── Query key factory ────────────────────────────────────────────────────────

export const applicationKeys = {
  all: ["applications"] as const,

  /** All applications for a user (Kanban — no pagination) */
  allByUser: (userId: string) => [...applicationKeys.all, "all", userId] as const,

  lists: () => [...applicationKeys.all, "list"] as const,
  list: (userId: string, filters: ApplicationFilters, sort: ApplicationSort, pagination: PaginationParams) =>
    [...applicationKeys.lists(), userId, { filters, sort, pagination }] as const,

  details: () => [...applicationKeys.all, "detail"] as const,
  detail: (id: string) => [...applicationKeys.details(), id] as const,

  statusCounts: (userId: string) => [...applicationKeys.all, "status-counts", userId] as const,
};

// ── useAllApplications ───────────────────────────────────────────────────────
// Fetches ALL applications for the current user — used by the Kanban board.

export function useAllApplications() {
  const { user } = useAuth();
  return useQuery({
    queryKey: applicationKeys.allByUser(user?.id ?? ""),
    queryFn: () => applicationService.getAllApplications(user!.id),
    enabled: Boolean(user),
    staleTime: 60 * 1_000, // 1 minute
  });
}

// ── useApplications ──────────────────────────────────────────────────────────
// Paginated, filtered, sorted list (used in List view).

export function useApplications(
  filters: ApplicationFilters = {},
  sort: ApplicationSort = DEFAULT_APPLICATION_SORT,
  pagination: PaginationParams = { page: 1, pageSize: 50 },
) {
  const { user } = useAuth();
  return useQuery({
    queryKey: applicationKeys.list(user?.id ?? "", filters, sort, pagination),
    queryFn: () =>
      applicationService.getApplications(user!.id, filters, sort, pagination),
    enabled: Boolean(user),
    staleTime: 60 * 1_000,
  });
}

// ── useApplication ───────────────────────────────────────────────────────────
// Single application by ID — used on the detail page.

export function useApplication(id: string | undefined) {
  return useQuery({
    queryKey: applicationKeys.detail(id ?? ""),
    queryFn: () => applicationService.getApplication(id!),
    enabled: Boolean(id),
    staleTime: 2 * 60 * 1_000,
  });
}

// ── useStatusCounts ──────────────────────────────────────────────────────────
// Per-status counts for Kanban column headers.

export function useApplicationStatusCounts() {
  const { user } = useAuth();
  return useQuery({
    queryKey: applicationKeys.statusCounts(user?.id ?? ""),
    queryFn: () => applicationService.countByStatus(user!.id),
    enabled: Boolean(user),
    staleTime: 60 * 1_000,
  });
}

// ── useCreateApplication ─────────────────────────────────────────────────────
// Creates an application from a GlobalJob after user confirms "Did you apply?".
// Applies optimistic update to the allByUser cache.

export function useCreateApplication() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const userId = user?.id ?? "";

  return useMutation({
    mutationFn: ({ job }: { job: GlobalJob }) => {
      if (!user) throw new Error("Not authenticated");
      return applicationService.createFromJob(user.id, job);
    },

    onMutate: async ({ job }) => {
      await queryClient.cancelQueries({ queryKey: applicationKeys.allByUser(userId) });

      const previous = queryClient.getQueryData<Application[]>(
        applicationKeys.allByUser(userId),
      );

      // Optimistic application — will be replaced by server response on settle
      const optimistic: Application = {
        id: `optimistic-${Date.now()}`,
        user_id: userId,
        job_id: job.id,
        company_name: job.company_name,
        role: job.role,
        status: "applied",
        applied_at: new Date().toISOString(),
        location: job.location ?? null,
        salary_min: job.salary_min ?? null,
        salary_max: job.salary_max ?? null,
        salary_currency: job.salary_currency ?? null,
        source: job.source ?? null,
        url: job.url ?? null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      queryClient.setQueryData<Application[]>(
        applicationKeys.allByUser(userId),
        (old) => [optimistic, ...(old ?? [])],
      );

      return { previous };
    },

    onError: (_err, _vars, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(applicationKeys.allByUser(userId), context.previous);
      }
    },

    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: applicationKeys.all });
      // Also invalidate the sidebar applications count
      void queryClient.invalidateQueries({ queryKey: ["sidebar", "applications-count", userId] });
    },
  });
}

// ── useUpdateApplicationStatus ───────────────────────────────────────────────
// Kanban drag-and-drop status update with optimistic update.

export function useUpdateApplicationStatus() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const userId = user?.id ?? "";

  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: ApplicationStatus }) =>
      applicationService.updateStatus(id, status),

    onMutate: async ({ id, status }) => {
      await queryClient.cancelQueries({ queryKey: applicationKeys.allByUser(userId) });

      const previous = queryClient.getQueryData<Application[]>(
        applicationKeys.allByUser(userId),
      );

      // Optimistically update the status in the allByUser cache
      queryClient.setQueryData<Application[]>(
        applicationKeys.allByUser(userId),
        (old) =>
          (old ?? []).map((app) =>
            app.id === id
              ? { ...app, status, updated_at: new Date().toISOString() }
              : app,
          ),
      );

      // Also update the detail cache if it exists
      const detail = queryClient.getQueryData<Application>(applicationKeys.detail(id));
      if (detail) {
        queryClient.setQueryData<Application>(applicationKeys.detail(id), {
          ...detail,
          status,
          updated_at: new Date().toISOString(),
        });
      }

      return { previous };
    },

    onError: (_err, _vars, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(applicationKeys.allByUser(userId), context.previous);
      }
    },

    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: applicationKeys.all });
    },
  });
}

// ── useDeleteApplication ─────────────────────────────────────────────────────

export function useDeleteApplication() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const userId = user?.id ?? "";

  return useMutation({
    mutationFn: ({ id }: { id: string }) =>
      applicationService.deleteApplication(id),

    onMutate: async ({ id }) => {
      await queryClient.cancelQueries({ queryKey: applicationKeys.allByUser(userId) });

      const previous = queryClient.getQueryData<Application[]>(
        applicationKeys.allByUser(userId),
      );

      queryClient.setQueryData<Application[]>(
        applicationKeys.allByUser(userId),
        (old) => (old ?? []).filter((app) => app.id !== id),
      );

      return { previous };
    },

    onError: (_err, _vars, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(applicationKeys.allByUser(userId), context.previous);
      }
    },

    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: applicationKeys.all });
      void queryClient.invalidateQueries({ queryKey: ["sidebar", "applications-count", userId] });
    },
  });
}
