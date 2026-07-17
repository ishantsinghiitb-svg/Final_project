import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { contactService } from "@/services/ContactService";
import type { ApplicationContactType } from "@/types";
import { applicationKeys } from "./index";

export const contactKeys = {
  all: ["application-contacts"] as const,
  byApplication: (applicationId: string) => [...contactKeys.all, applicationId] as const,
};

export function useContacts(applicationId: string) {
  return useQuery({
    queryKey: contactKeys.byApplication(applicationId),
    queryFn: () => contactService.getContacts(applicationId),
    enabled: Boolean(applicationId),
    staleTime: 30 * 1_000,
  });
}

// Contact writes also emit a `contact_added` timeline event via a DB trigger,
// so every mutation here invalidates the shared timeline query too.

export function useCreateContact(applicationId: string) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      type: ApplicationContactType;
      name: string;
      email?: string | null;
      linkedin_url?: string | null;
      notes?: string | null;
    }) => {
      if (!user) throw new Error("Not authenticated");
      return contactService.createContact(user.id, applicationId, input);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: contactKeys.byApplication(applicationId) });
      void queryClient.invalidateQueries({ queryKey: applicationKeys.timeline(applicationId) });
    },
  });
}

export function useUpdateContact(applicationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      updates,
    }: {
      id: string;
      updates: Partial<{
        type: ApplicationContactType;
        name: string;
        email: string | null;
        linkedin_url: string | null;
        notes: string | null;
      }>;
    }) => contactService.updateContact(id, updates),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: contactKeys.byApplication(applicationId) });
    },
  });
}

export function useDeleteContact(applicationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string }) => contactService.deleteContact(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: contactKeys.byApplication(applicationId) });
    },
  });
}
