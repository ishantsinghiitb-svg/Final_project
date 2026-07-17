import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { resumeService } from "@/services/ResumeService";

export const resumeKeys = {
  all: ["resumes"] as const,
  byUser: (userId: string) => [...resumeKeys.all, "by-user", userId] as const,
  versions: (resumeId: string) => [...resumeKeys.all, "versions", resumeId] as const,
};

/** Lists the current user's resumes — powers the Resume Association picker. */
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

export function useUploadResume() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ name, file }: { name: string; file: File }) => {
      if (!user) throw new Error("Not authenticated");
      return resumeService.uploadResume(user.id, name, file);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: resumeKeys.all });
    },
  });
}
