import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { coverLetterService } from "@/services/CoverLetterService";

export const coverLetterKeys = {
  all: ["cover-letters"] as const,
  byUser: (userId: string) => [...coverLetterKeys.all, "by-user", userId] as const,
};

/** Lists the current user's cover letters — powers the Cover Letter Association picker. */
export function useCoverLetters() {
  const { user } = useAuth();
  return useQuery({
    queryKey: coverLetterKeys.byUser(user?.id ?? ""),
    queryFn: () => coverLetterService.getCoverLetters(user!.id),
    enabled: Boolean(user),
    staleTime: 60 * 1_000,
  });
}

export function useUploadCoverLetter() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ name, file }: { name: string; file: File }) => {
      if (!user) throw new Error("Not authenticated");
      return coverLetterService.uploadCoverLetter(user.id, name, file);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: coverLetterKeys.all });
    },
  });
}
