import type { Feedback, FeedbackCategory } from "@/types";
import { FeedbackRepository } from "@/repositories/FeedbackRepository";

const repo = new FeedbackRepository();

export class FeedbackService {
  async submit(
    userId: string,
    input: { category: FeedbackCategory; message: string; pagePath?: string | null },
  ): Promise<Feedback | null> {
    const message = input.message.trim();
    if (!message) throw new Error("Feedback message is required.");
    return repo.create({
      user_id: userId,
      category: input.category,
      message,
      page_path: input.pagePath ?? null,
    });
  }
}

export const feedbackService = new FeedbackService();
