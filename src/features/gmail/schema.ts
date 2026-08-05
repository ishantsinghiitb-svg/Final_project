import { z } from "zod";

// Mirrors the 10-value category CHECK constraint on gmail_messages.category.
export const GmailClassificationSchema = z.object({
  category: z.enum([
    "application_confirmation",
    "recruiter_reply",
    "interview_invitation",
    "online_assessment",
    "assignment",
    "follow_up_required",
    "offer",
    "rejection",
    "application_update",
    "unknown",
  ]),
  confidence: z.number().min(0).max(1),
});
