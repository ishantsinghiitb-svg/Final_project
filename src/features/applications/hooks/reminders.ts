import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { reminderService } from "@/services/ReminderService";
import type { ApplicationReminderType } from "@/types";
import { applicationKeys } from "./index";

export const reminderKeys = {
  all: ["application-reminders"] as const,
  byApplication: (applicationId: string) => [...reminderKeys.all, applicationId] as const,
};

export function useReminders(applicationId: string) {
  return useQuery({
    queryKey: reminderKeys.byApplication(applicationId),
    queryFn: () => reminderService.getReminders(applicationId),
    enabled: Boolean(applicationId),
    staleTime: 30 * 1_000,
  });
}

// Reminder create/complete also emit `reminder_created` / `reminder_completed`
// timeline events via a DB trigger, so those mutations invalidate the shared
// timeline query too.

export function useCreateReminder(applicationId: string) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      type: ApplicationReminderType;
      title: string;
      remind_at: string;
      note?: string | null;
    }) => {
      if (!user) throw new Error("Not authenticated");
      return reminderService.createReminder(user.id, applicationId, input);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: reminderKeys.byApplication(applicationId) });
      void queryClient.invalidateQueries({ queryKey: applicationKeys.timeline(applicationId) });
    },
  });
}

export function useSetReminderCompleted(applicationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, completed }: { id: string; completed: boolean }) =>
      reminderService.setCompleted(id, completed),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: reminderKeys.byApplication(applicationId) });
      void queryClient.invalidateQueries({ queryKey: applicationKeys.timeline(applicationId) });
    },
  });
}

export function useDeleteReminder(applicationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string }) => reminderService.deleteReminder(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: reminderKeys.byApplication(applicationId) });
    },
  });
}
