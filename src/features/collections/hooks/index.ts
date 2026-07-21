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

  /** Which of a user's collections contain a given job — powers the Add-to-Collection picker. */
  membership: (userId: string, jobId: string) =>
    [...collectionKeys.all, "membership", userId, jobId] as const,
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

// ── useJobCollectionIds ──────────────────────────────────────────────────────
// Which collections (by id) a given job already belongs to. Backs the
// Add-to-Collection picker's checkmarks — so a job already in "Dream
// Companies" shows that immediately when the picker opens.

export function useJobCollectionIds(jobId: string | undefined) {
  const { user } = useAuth();
  return useQuery({
    queryKey: collectionKeys.membership(user?.id ?? "", jobId ?? ""),
    queryFn: () => collectionService.getCollectionIdsForJob(user!.id, jobId!),
    enabled: Boolean(user) && Boolean(jobId),
    staleTime: 30 * 1_000,
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
    },
  });
}

// ── useAddJobToCollection / useRemoveJobFromCollection ──────────────────────
// Same optimistic-update shape as useSaveJob/useUnsaveJob (features/jobs/hooks)
// applied to the membership query, so the picker's checkbox toggles instantly.

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
      await queryClient.cancelQueries({ queryKey: collectionKeys.membership(userId, jobId) });

      const previous = queryClient.getQueryData<string[]>(collectionKeys.membership(userId, jobId));

      queryClient.setQueryData<string[]>(collectionKeys.membership(userId, jobId), (old) =>
        old && old.includes(collectionId) ? old : [...(old ?? []), collectionId],
      );

      return { previous };
    },

    onError: (_err, { jobId }, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(collectionKeys.membership(userId, jobId), context.previous);
      }
    },

    onSettled: (_data, _err, { collectionId, jobId }) => {
      queryClient.invalidateQueries({ queryKey: collectionKeys.membership(userId, jobId) });
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
      await queryClient.cancelQueries({ queryKey: collectionKeys.membership(userId, jobId) });

      const previous = queryClient.getQueryData<string[]>(collectionKeys.membership(userId, jobId));

      queryClient.setQueryData<string[]>(collectionKeys.membership(userId, jobId), (old) =>
        (old ?? []).filter((id) => id !== collectionId),
      );

      return { previous };
    },

    onError: (_err, { jobId }, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(collectionKeys.membership(userId, jobId), context.previous);
      }
    },

    onSettled: (_data, _err, { collectionId, jobId }) => {
      queryClient.invalidateQueries({ queryKey: collectionKeys.membership(userId, jobId) });
      queryClient.invalidateQueries({ queryKey: collectionKeys.jobs(collectionId) });
      queryClient.invalidateQueries({ queryKey: collectionKeys.lists(userId) });
    },
  });
}
