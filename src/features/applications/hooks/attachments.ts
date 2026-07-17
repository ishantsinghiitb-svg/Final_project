import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { attachmentService } from "@/services/AttachmentService";
import type { ApplicationAttachmentKind } from "@/types";

export const attachmentKeys = {
  all: ["application-attachments"] as const,
  byApplication: (applicationId: string) => [...attachmentKeys.all, "by-application", applicationId] as const,
  byReminder: (reminderId: string) => [...attachmentKeys.all, "by-reminder", reminderId] as const,
};

/** General application attachments only — excludes reminder-scoped ones, see useReminderAttachments. */
export function useAttachments(applicationId: string) {
  return useQuery({
    queryKey: attachmentKeys.byApplication(applicationId),
    queryFn: () => attachmentService.getAttachments(applicationId),
    enabled: Boolean(applicationId),
    staleTime: 30 * 1_000,
  });
}

export function useReminderAttachments(reminderId: string) {
  return useQuery({
    queryKey: attachmentKeys.byReminder(reminderId),
    queryFn: () => attachmentService.getReminderAttachments(reminderId),
    enabled: Boolean(reminderId),
    staleTime: 30 * 1_000,
  });
}

export function useUploadAttachment(applicationId: string) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      kind,
      file,
      reminderId,
    }: {
      kind: ApplicationAttachmentKind;
      file: File;
      reminderId?: string;
    }) => {
      if (!user) throw new Error("Not authenticated");
      return attachmentService.uploadAttachment(user.id, applicationId, kind, file, reminderId);
    },
    // Attachments can belong to either the general list or a specific
    // reminder — invalidate the whole attachments key space rather than
    // tracking exactly which sub-key changed.
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: attachmentKeys.all });
    },
  });
}

export function useDeleteAttachment(applicationId: string) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string }) => {
      if (!user) throw new Error("Not authenticated");
      return attachmentService.deleteAttachment(user.id, id);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: attachmentKeys.all });
    },
  });
}
