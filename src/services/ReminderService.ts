import type { ApplicationReminder, ApplicationReminderType } from "@/types";
import { ReminderRepository } from "@/repositories/ReminderRepository";

const reminderRepo = new ReminderRepository();

export class ReminderService {
  async getReminders(applicationId: string): Promise<ApplicationReminder[]> {
    return reminderRepo.findByApplication(applicationId);
  }

  /** Module 9B — reminders on a standalone (non-application-linked) interview. */
  async getRemindersForInterview(interviewId: string): Promise<ApplicationReminder[]> {
    return reminderRepo.findByInterview(interviewId);
  }

  /** Dashboard's "Next reminder" surface. */
  async getNextUpcomingReminder(userId: string): Promise<ApplicationReminder | null> {
    return reminderRepo.findNextUpcomingByUser(userId);
  }

  /** Interviews page's per-card "next reminder" indicator — one bulk fetch for the whole visible list. */
  async getUpcomingRemindersForOwners(
    applicationIds: string[],
    interviewIds: string[],
  ): Promise<ApplicationReminder[]> {
    return reminderRepo.findUpcomingForOwners(applicationIds, interviewIds);
  }

  async createReminder(
    userId: string,
    applicationId: string,
    input: {
      type: ApplicationReminderType;
      title: string;
      remind_at: string;
      note?: string | null;
      /** Module 9A/9B — set when this reminder was created by accepting a suggestion (Gmail- or Calendar-derived). */
      source_suggestion_id?: string | null;
    },
  ): Promise<ApplicationReminder> {
    return reminderRepo.create(userId, { application_id: applicationId, ...input });
  }

  /** Module 9B — for a standalone interview with no application to hang the reminder off of. */
  async createReminderForInterview(
    userId: string,
    interviewId: string,
    input: {
      type: ApplicationReminderType;
      title: string;
      remind_at: string;
      note?: string | null;
      source_suggestion_id?: string | null;
    },
  ): Promise<ApplicationReminder> {
    return reminderRepo.create(userId, { interview_id: interviewId, ...input });
  }

  async setCompleted(id: string, completed: boolean): Promise<ApplicationReminder> {
    return reminderRepo.setCompleted(id, completed);
  }

  async deleteReminder(id: string): Promise<void> {
    return reminderRepo.delete(id);
  }
}

export const reminderService = new ReminderService();
