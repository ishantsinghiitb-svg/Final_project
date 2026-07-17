import type { ApplicationReminder, ApplicationReminderType } from "@/types";
import { ReminderRepository } from "@/repositories/ReminderRepository";

const reminderRepo = new ReminderRepository();

export class ReminderService {
  async getReminders(applicationId: string): Promise<ApplicationReminder[]> {
    return reminderRepo.findByApplication(applicationId);
  }

  async createReminder(
    userId: string,
    applicationId: string,
    input: { type: ApplicationReminderType; title: string; remind_at: string; note?: string | null },
  ): Promise<ApplicationReminder> {
    return reminderRepo.create(userId, { application_id: applicationId, ...input });
  }

  async setCompleted(id: string, completed: boolean): Promise<ApplicationReminder> {
    return reminderRepo.setCompleted(id, completed);
  }

  async deleteReminder(id: string): Promise<void> {
    return reminderRepo.delete(id);
  }
}

export const reminderService = new ReminderService();
