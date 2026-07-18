import {
  useQuery,
  useMutation,
  useQueryClient,
  keepPreviousData,
} from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { jobService } from "@/services/JobService";
import { manualImportService, type ManualImportInput } from "@/services/ManualImportService";
import type { JobFilters, JobSort } from "@/features/jobs/types";
import type { GlobalJob, PaginationParams } from "@/types";
import { DEFAULT_JOB_SORT, DEFAULT_PAGINATION } from "@/features/jobs/constants";

// ── Query key factory ────────────────────────────────────────────────────────
// Centralised here so any component can match or invalidate the exact same key.

export const jobKeys = {
  all: ["jobs"] as const,

  lists: () => [...jobKeys.all, "list"] as const,
  list: (filters: JobFilters, sort: JobSort, pagination: PaginationParams) =>
    [...jobKeys.lists(), { filters, sort, pagination }] as const,

  details: () => [...jobKeys.all, "detail"] as const,
  detail: (id: string) => [...jobKeys.details(), id] as const,

  skills: (jobId: string) => [...jobKeys.detail(jobId), "skills"] as const,
  similar: (jobId: string) => [...jobKeys.detail(jobId), "similar"] as const,

  /** Parent key for all saved-job queries for a given user */
  saved: (userId: string) => [...jobKeys.all, "saved", userId] as const,
  savedList: (userId: string, pagination: PaginationParams) =>
    [...jobKeys.saved(userId), "list", pagination] as const,
  /** All saved job IDs (no pagination) — used for optimistic save toggling */
  savedIds: (userId: string) => [...jobKeys.saved(userId), "ids"] as const,
};

// ── useJobs ──────────────────────────────────────────────────────────────────
// Fetches a paginated, filtered, sorted page of global jobs.
// - Caches for 5 minutes before going stale.
// - keepPreviousData keeps the last result visible while the next page loads.

export function useJobs(
  filters: JobFilters = {},
  sort: JobSort = DEFAULT_JOB_SORT,
  pagination: PaginationParams = DEFAULT_PAGINATION,
) {
  return useQuery({
    queryKey: jobKeys.list(filters, sort, pagination),
    queryFn: () => jobService.getJobs(filters, sort, pagination),
    staleTime: 5 * 60 * 1_000, // 5 minutes
    placeholderData: keepPreviousData,
  });
}

// ── useJob ───────────────────────────────────────────────────────────────────
// Fetches a single job by ID.
// - Disabled when `id` is undefined so callers can pass a nullable id safely.
// - Longer staleTime (10 min) — individual jobs change less often than lists.

export function useJob(id: string | undefined) {
  return useQuery({
    queryKey: jobKeys.detail(id ?? ""),
    queryFn: () => jobService.getJob(id!),
    enabled: Boolean(id),
    staleTime: 10 * 60 * 1_000, // 10 minutes
  });
}

// ── useJobSkills ─────────────────────────────────────────────────────────────
// Fetches skills for a single job via the job_skills junction table.
// Returns [] gracefully if no skills are stored.

export function useJobSkills(jobId: string | undefined) {
  return useQuery({
    queryKey: jobKeys.skills(jobId ?? ""),
    queryFn: () => jobService.getJobSkills(jobId!),
    enabled: Boolean(jobId),
    staleTime: 10 * 60 * 1_000,
  });
}

// ── useSimilarJobs ───────────────────────────────────────────────────────────
// Fetches 4-6 similar jobs based on role and location.
// Only fires when the reference job is loaded.

export function useSimilarJobs(jobId: string | undefined, job: GlobalJob | null | undefined) {
  return useQuery({
    queryKey: jobKeys.similar(jobId ?? ""),
    queryFn: () => jobService.getSimilarJobs(jobId!, job!.role, job!.location, 6),
    enabled: Boolean(jobId) && Boolean(job),
    staleTime: 5 * 60 * 1_000,
  });
}

// ── useSavedJobs ─────────────────────────────────────────────────────────────
// Paginated list of the current user's saved jobs as full GlobalJob records.
// Disabled until user is authenticated.

export function useSavedJobs(pagination: PaginationParams = DEFAULT_PAGINATION) {
  const { user } = useAuth();
  return useQuery({
    queryKey: jobKeys.savedList(user?.id ?? "", pagination),
    queryFn: () => jobService.getSavedJobs(user!.id, pagination),
    enabled: Boolean(user),
    staleTime: 2 * 60 * 1_000, // 2 minutes
    placeholderData: keepPreviousData,
  });
}

// ── useSavedJobIds ───────────────────────────────────────────────────────────
// Returns ALL saved job IDs (no pagination) for the current user.
// Used by job list UIs to render saved/unsaved state per card without a
// per-card query. Updated optimistically by useSaveJob / useUnsaveJob.

export function useSavedJobIds() {
  const { user } = useAuth();
  return useQuery({
    queryKey: jobKeys.savedIds(user?.id ?? ""),
    queryFn: () => jobService.getSavedJobIds(user!.id),
    enabled: Boolean(user),
    staleTime: 2 * 60 * 1_000,
  });
}

// ── useSaveJob ───────────────────────────────────────────────────────────────
// Saves a job for the current user.
// Applies an optimistic update to the savedIds cache so the UI toggles
// instantly — without waiting for the server round-trip.

export function useSaveJob() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const userId = user?.id ?? "";

  return useMutation({
    mutationFn: ({ jobId }: { jobId: string }) => {
      if (!user) throw new Error("Not authenticated");
      return jobService.saveJob(user.id, jobId);
    },

    onMutate: async ({ jobId }) => {
      // Prevent any in-flight refetch from overwriting the optimistic state
      await queryClient.cancelQueries({ queryKey: jobKeys.savedIds(userId) });

      // Snapshot the current value so we can roll back on error
      const previousIds = queryClient.getQueryData<string[]>(
        jobKeys.savedIds(userId),
      );

      // Optimistically add the new ID
      queryClient.setQueryData<string[]>(jobKeys.savedIds(userId), (old) => [
        ...(old ?? []),
        jobId,
      ]);

      return { previousIds };
    },

    onError: (_err, _vars, context) => {
      // Roll back to the pre-mutation snapshot
      if (context?.previousIds !== undefined) {
        queryClient.setQueryData(jobKeys.savedIds(userId), context.previousIds);
      }
    },

    onSettled: () => {
      // Always sync with the server after the mutation settles
      queryClient.invalidateQueries({ queryKey: jobKeys.saved(userId) });
    },
  });
}

// ── useUnsaveJob ─────────────────────────────────────────────────────────────
// Removes a saved job for the current user.
// Mirrors the optimistic update pattern of useSaveJob in reverse.

export function useUnsaveJob() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const userId = user?.id ?? "";

  return useMutation({
    mutationFn: ({ jobId }: { jobId: string }) => {
      if (!user) throw new Error("Not authenticated");
      return jobService.unsaveJob(user.id, jobId);
    },

    onMutate: async ({ jobId }) => {
      await queryClient.cancelQueries({ queryKey: jobKeys.savedIds(userId) });

      const previousIds = queryClient.getQueryData<string[]>(
        jobKeys.savedIds(userId),
      );

      // Optimistically remove the ID
      queryClient.setQueryData<string[]>(jobKeys.savedIds(userId), (old) =>
        (old ?? []).filter((id) => id !== jobId),
      );

      return { previousIds };
    },

    onError: (_err, _vars, context) => {
      if (context?.previousIds !== undefined) {
        queryClient.setQueryData(jobKeys.savedIds(userId), context.previousIds);
      }
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: jobKeys.saved(userId) });
    },
  });
}

// ── useImportJob ─────────────────────────────────────────────────────────────
// Manual URL import (dashboard). Runs through ManualImportService → the shared
// `upsert_global_job` RPC (same write path + dedup as the extension), then
// invalidates the job list and the sidebar count so the imported job appears.

export function useImportJob() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: ManualImportInput) => manualImportService.importFromUrl(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: jobKeys.lists() });
      queryClient.invalidateQueries({ queryKey: ["sidebar", "jobs-count"] });
    },
  });
}

// ── useSidebarCounts ─────────────────────────────────────────────────────────
// Returns live counts for the three sidebar badges: Jobs, Saved, Applications.
// Uses Supabase head-only count queries (no row data transferred).
// staleTime = 5 minutes — these don't need to be real-time.

type SidebarCounts = { jobs: number; saved: number; applications: number };

export function useSidebarCounts(): SidebarCounts {
  const { user } = useAuth();

  const { data: jobsCount = 0 } = useQuery({
    queryKey: ["sidebar", "jobs-count"],
    queryFn:  () => jobService.countDiscoverableJobs(),
    staleTime: 5 * 60 * 1_000,
  });

  const { data: savedCount = 0 } = useQuery({
    queryKey: ["sidebar", "saved-count", user?.id ?? ""],
    queryFn:  () => jobService.countSavedJobs(user!.id),
    enabled:   Boolean(user),
    staleTime: 5 * 60 * 1_000,
  });

  const { data: applicationsCount = 0 } = useQuery({
    queryKey: ["sidebar", "applications-count", user?.id ?? ""],
    queryFn:  () => jobService.countApplications(user!.id),
    enabled:   Boolean(user),
    staleTime: 5 * 60 * 1_000,
  });

  return { jobs: jobsCount, saved: savedCount, applications: applicationsCount };
}
