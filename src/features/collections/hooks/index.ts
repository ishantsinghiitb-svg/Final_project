import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { collectionService } from "@/services/CollectionService";
import type { Collection, CollectionColor } from "@/types";

// ── Query key factory ────────────────────────────────────────────────────────
// Same shape as jobKeys / applicationKeys — centralised so any component can
// match or invalidate the exact same key.

export const collectionKeys = {
  all: ["collections"] as const,

  lists: (userId: string) => [...collectionKeys.all, "list", userId] as const,

  details: () => [...collectionKeys.all, "detail"] as const,
  detail: (id: string) => [...collectionKeys.details(), id] as const,

  jobs: (id: string) => [...collectionKeys.all, "jobs", id] as const,

  /**
   * Every (job_id → collection_ids[]) membership the user has, in one query —
   * powers the Add-to-Collection picker's checkmarks on every card at once.
   * One key per user (not per job), so every AddToCollectionMenu instance on
   * a page shares the same cache entry and fires exactly one request.
   */
  allMemberships: (userId: string) => [...collectionKeys.all, "all-memberships", userId] as const,
};

// ── useCollections ───────────────────────────────────────────────────────────
// All of the current user's collections, enriched with job_count/top_sources.

export function useCollections() {
  const { user } = useAuth();
  return useQuery({
    queryKey: collectionKeys.lists(user?.id ?? ""),
    queryFn: () => collectionService.getCollections(user!.id),
    enabled: Boolean(user),
    staleTime: 60 * 1_000,
  });
}

// ── useCollection ────────────────────────────────────────────────────────────

export function useCollection(id: string | undefined) {
  return useQuery({
    queryKey: collectionKeys.detail(id ?? ""),
    queryFn: () => collectionService.getCollection(id!),
    enabled: Boolean(id),
    staleTime: 60 * 1_000,
  });
}

// ── useCollectionJobs ────────────────────────────────────────────────────────
// Full GlobalJob rows for every job in a collection — used by Collection
// Details for both the job grid and the Statistics tiles (both need the same
// full list, so one query backs both).

export function useCollectionJobs(id: string | undefined) {
  return useQuery({
    queryKey: collectionKeys.jobs(id ?? ""),
    queryFn: () => collectionService.getCollectionJobs(id!),
    enabled: Boolean(id),
    staleTime: 30 * 1_000,
  });
}

// ── useAllJobCollectionMemberships ───────────────────────────────────────────
// Every (job_id → collection_ids[]) membership the user has, fetched once per
// page. Every AddToCollectionMenu instance derives its own job's slice
// locally (`data[job.id] ?? []`) instead of running its own query — the same
// "one query, every card reads its own slice" pattern useSavedJobIds already
// uses for Saved state. Replaces a prior per-job query (one request per
// visible job card) that this batches into one.

export function useAllJobCollectionMemberships() {
  const { user } = useAuth();
  return useQuery({
    queryKey: collectionKeys.allMemberships(user?.id ?? ""),
    queryFn: () => collectionService.getAllMembershipsForUser(user!.id),
    enabled: Boolean(user),
    staleTime: 60 * 1_000,
  });
}

// ── useCreateCollection ──────────────────────────────────────────────────────

export function useCreateCollection() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      name,
      description,
      color,
    }: {
      name: string;
      description?: string;
      color?: CollectionColor;
    }) => {
      if (!user) throw new Error("Not authenticated");
      return collectionService.createCollection(user.id, name, description, color);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: collectionKeys.lists(user?.id ?? "") });
      queryClient.invalidateQueries({ queryKey: ["sidebar", "collections-count", user?.id ?? ""] });
    },
  });
}

// ── useUpdateCollection ──────────────────────────────────────────────────────
// Powers both Rename and any other field edit (description/color) — a single
// mutation, since the DB update is the same shape either way.

export function useUpdateCollection() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      ...fields
    }: {
      id: string;
      name?: string;
      description?: string | null;
      color?: CollectionColor | null;
    }) => collectionService.updateCollection(id, fields),
    onSuccess: (updated: Collection) => {
      queryClient.invalidateQueries({ queryKey: collectionKeys.lists(user?.id ?? "") });
      queryClient.setQueryData(collectionKeys.detail(updated.id), updated);
    },
  });
}

// ── useDeleteCollection ──────────────────────────────────────────────────────
// Deletes the collection row only — ON DELETE CASCADE removes its
// collection_jobs membership rows; global_jobs is never touched (see
// CollectionRepository.remove).

export function useDeleteCollection() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id }: { id: string }) => collectionService.deleteCollection(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: collectionKeys.lists(user?.id ?? "") });
      queryClient.invalidateQueries({ queryKey: ["sidebar", "collections-count", user?.id ?? ""] });
    },
  });
}

// ── useAddJobToCollection / useRemoveJobFromCollection ──────────────────────
// Same optimistic-update shape as useSaveJob/useUnsaveJob (features/jobs/hooks)
// applied to the batched allMemberships map, so the picker's checkbox toggles
// instantly without waiting on the round trip.

export function useAddJobToCollection() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const userId = user?.id ?? "";

  return useMutation({
    mutationFn: ({ collectionId, jobId }: { collectionId: string; jobId: string }) => {
      if (!user) throw new Error("Not authenticated");
      return collectionService.addJobToCollection(user.id, collectionId, jobId);
    },

    onMutate: async ({ collectionId, jobId }) => {
      await queryClient.cancelQueries({ queryKey: collectionKeys.allMemberships(userId) });

      const previous = queryClient.getQueryData<Record<string, string[]>>(
        collectionKeys.allMemberships(userId),
      );

      queryClient.setQueryData<Record<string, string[]>>(collectionKeys.allMemberships(userId), (old) => {
        const prev = old ?? {};
        const existing = prev[jobId] ?? [];
        if (existing.includes(collectionId)) return prev;
        return { ...prev, [jobId]: [...existing, collectionId] };
      });

      return { previous };
    },

    onError: (_err, _vars, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(collectionKeys.allMemberships(userId), context.previous);
      }
    },

    onSettled: (_data, _err, { collectionId }) => {
      queryClient.invalidateQueries({ queryKey: collectionKeys.allMemberships(userId) });
      queryClient.invalidateQueries({ queryKey: collectionKeys.jobs(collectionId) });
      queryClient.invalidateQueries({ queryKey: collectionKeys.lists(userId) });
    },
  });
}

export function useRemoveJobFromCollection() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const userId = user?.id ?? "";

  return useMutation({
    mutationFn: ({ collectionId, jobId }: { collectionId: string; jobId: string }) =>
      collectionService.removeJobFromCollection(collectionId, jobId),

    onMutate: async ({ collectionId, jobId }) => {
      await queryClient.cancelQueries({ queryKey: collectionKeys.allMemberships(userId) });

      const previous = queryClient.getQueryData<Record<string, string[]>>(
        collectionKeys.allMemberships(userId),
      );

      queryClient.setQueryData<Record<string, string[]>>(collectionKeys.allMemberships(userId), (old) => {
        const prev = old ?? {};
        const existing = prev[jobId] ?? [];
        return { ...prev, [jobId]: existing.filter((id) => id !== collectionId) };
      });

      return { previous };
    },

    onError: (_err, _vars, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(collectionKeys.allMemberships(userId), context.previous);
      }
    },

    onSettled: (_data, _err, { collectionId }) => {
      queryClient.invalidateQueries({ queryKey: collectionKeys.allMemberships(userId) });
      queryClient.invalidateQueries({ queryKey: collectionKeys.jobs(collectionId) });
      queryClient.invalidateQueries({ queryKey: collectionKeys.lists(userId) });
    },
  });
}
