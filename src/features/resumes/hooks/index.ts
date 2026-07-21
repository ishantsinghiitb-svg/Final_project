import { useQuery, useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { resumeService } from "@/services/ResumeService";
import { aiClient } from "@/services/ai/AIClient";

export const resumeKeys = {
  all: ["resumes"] as const,
  byUser: (userId: string) => [...resumeKeys.all, "by-user", userId] as const,
  versions: (resumeId: string) => [...resumeKeys.all, "versions", resumeId] as const,
  parsed: (resumeId: string) => [...resumeKeys.all, "parsed", resumeId] as const,
};

/** Lists the current user's resumes (default first, then most-recent). */
export function useResumes() {
  const { user } = useAuth();
  return useQuery({
    queryKey: resumeKeys.byUser(user?.id ?? ""),
    queryFn: () => resumeService.getResumes(user!.id),
    enabled: Boolean(user),
    staleTime: 60 * 1_000,
  });
}

export function useResumeVersions(resumeId: string | undefined) {
  return useQuery({
    queryKey: resumeKeys.versions(resumeId ?? ""),
    queryFn: () => resumeService.getVersions(resumeId!),
    enabled: Boolean(resumeId),
    staleTime: 5 * 60 * 1_000,
  });
}

/** Deterministic parse output (structured resume + health) for one resume. */
export function useResumeParsed(resumeId: string | undefined) {
  return useQuery({
    queryKey: resumeKeys.parsed(resumeId ?? ""),
    queryFn: () => resumeService.getParsed(resumeId!),
    enabled: Boolean(resumeId),
    staleTime: 5 * 60 * 1_000,
  });
}

/**
 * Invalidates only the resume list — never the broader `resumeKeys.all`
 * prefix, which (React Query matches by key prefix) would also invalidate
 * every resume's `parsed` query — a much heavier payload (full raw text +
 * structured JSON) that rename/default/delete never actually change.
 */
function invalidateList(queryClient: QueryClient, userId: string | undefined) {
  void queryClient.invalidateQueries({ queryKey: resumeKeys.byUser(userId ?? "") });
}

/**
 * Uploads a resume, then triggers the deterministic parse pipeline — unless an
 * identical file (by content hash) already exists for this user, in which
 * case the existing resume is reused as-is: no duplicate row, no re-upload,
 * no re-parse. `isDuplicate` tells the caller which happened so it can show
 * the right toast.
 */
export function useUploadResume() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ name, file }: { name: string; file: File }) => {
      if (!user) throw new Error("Not authenticated");
      const { resume, isDuplicate } = await resumeService.uploadResume(user.id, name, file);
      if (!isDuplicate) {
        // Best-effort parse — parsing failures must not fail the upload.
        try {
          await aiClient.parseResume(resume.id);
        } catch {
          /* surfaced via parse_status on the resume row */
        }
      }
      return { resume, isDuplicate };
    },
    onSuccess: ({ resume }) => {
      invalidateList(queryClient, user?.id);
      void queryClient.invalidateQueries({ queryKey: resumeKeys.parsed(resume.id) });
    },
  });
}

/** Manually re-run parsing for a resume (e.g. after a failed parse). */
export function useReparseResume() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (resumeId: string) => aiClient.parseResume(resumeId),
    onSuccess: (_res, resumeId) => {
      invalidateList(queryClient, user?.id);
      void queryClient.invalidateQueries({ queryKey: resumeKeys.parsed(resumeId) });
    },
  });
}

export function useSetDefaultResume() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (resumeId: string) => resumeService.setDefault(resumeId),
    onSuccess: () => invalidateList(queryClient, user?.id),
  });
}

export function useRenameResume() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      resumeService.renameResume(id, name),
    onSuccess: () => invalidateList(queryClient, user?.id),
  });
}

export function useDeleteResume() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (resumeId: string) => {
      if (!user) throw new Error("Not authenticated");
      return resumeService.deleteResume(user.id, resumeId);
    },
    onSuccess: () => invalidateList(queryClient, user?.id),
  });
}
