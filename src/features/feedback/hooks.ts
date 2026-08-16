import { useMutation } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { feedbackService } from "@/services/FeedbackService";
import type { FeedbackCategory } from "@/types";

export function useSubmitFeedback() {
  const { user } = useAuth();
  return useMutation({
    mutationFn: ({
      category,
      message,
      pagePath,
    }: {
      category: FeedbackCategory;
      message: string;
      pagePath?: string | null;
    }) => {
      if (!user) throw new Error("Not authenticated");
      return feedbackService.submit(user.id, { category, message, pagePath });
    },
  });
}
