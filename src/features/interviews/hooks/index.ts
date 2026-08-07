import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { interviewService } from "@/services/InterviewService";
import { reminderService } from "@/services/ReminderService";
import type { ApplicationReminder, Interview, InterviewStatus } from "@/types";
import type { ScheduleInterviewInput, StandaloneInterviewInput } from "@/features/interviews/types";

// ── Query key factory ────────────────────────────────────────────────────────

export const interviewKeys = {
  all: ["interviews"] as const,
  allByUser: (userId: string) => [...interviewKeys.all, "all", userId] as const,
  detail: (id: string) => [...interviewKeys.all, "detail", id] as const,
  byApplication: (applicationId: string) =>
    [...interviewKeys.all, "by-application", applicationId] as const,
};

// ── useAllInterviews ─────────────────────────────────────────────────────────
// Fetches ALL interviews for the current user — the Interviews page filters
// and sorts client-side over this, same approach Applications' board/list use.

export function useAllInterviews() {
  const { user } = useAuth();
  return useQuery({
    queryKey: interviewKeys.allByUser(user?.id ?? ""),
    queryFn: () => interviewService.getAllInterviews(user!.id),
    enabled: Boolean(user),
    staleTime: 60 * 1_000,
  });
}

// ── useInterview ─────────────────────────────────────────────────────────────
// A single interview — powers the Details page (Module 7B). The query key was
// already reserved (`interviewKeys.detail`) but unused until that page existed.

export function useInterview(id: string | undefined) {
  return useQuery({
    queryKey: interviewKeys.detail(id ?? ""),
    queryFn: () => interviewService.getInterview(id!),
    enabled: Boolean(id),
    staleTime: 30 * 1_000,
  });
}

// ── useInterviewsForApplication ──────────────────────────────────────────────

export function useInterviewsForApplication(applicationId: string | undefined) {
  return useQuery({
    queryKey: interviewKeys.byApplication(applicationId ?? ""),
    queryFn: () => interviewService.getInterviewsForApplication(applicationId!),
    enabled: Boolean(applicationId),
    staleTime: 60 * 1_000,
  });
}

// ── useUpcomingRemindersByInterview ─────────────────────────────────────────
// Interview cards' "next reminder" indicator — one bulk fetch for the whole
// visible list rather than one query per card. See ReminderRepository.
// findUpcomingForOwners for the application-id-fallback matching rule.

export function useUpcomingRemindersByInterview(
  interviews: Interview[],
): Map<string, ApplicationReminder> {
  const { user } = useAuth();
  const applicationIds = useMemo(
    () =>
      Array.from(
        new Set(interviews.map((i) => i.application_id).filter((v): v is string => Boolean(v))),
      ).sort(),
    [interviews],
  );
  const interviewIds = useMemo(() => interviews.map((i) => i.id).sort(), [interviews]);

  const { data: reminders = [] } = useQuery({
    queryKey: [
      ...interviewKeys.all,
      "upcoming-reminders",
      user?.id ?? "",
      applicationIds,
      interviewIds,
    ],
    queryFn: () => reminderService.getUpcomingRemindersForOwners(applicationIds, interviewIds),
    enabled: Boolean(user) && interviews.length > 0,
    staleTime: 30 * 1_000,
  });

  return useMemo(() => {
    const map = new Map<string, ApplicationReminder>();
    for (const interview of interviews) {
      const exact = reminders.find((r) => r.interview_id === interview.id);
      if (exact) {
        map.set(interview.id, exact);
        continue;
      }
      if (interview.application_id) {
        const byApplication = reminders.find(
          (r) => r.application_id === interview.application_id && !r.interview_id,
        );
        if (byApplication) map.set(interview.id, byApplication);
      }
    }
    return map;
  }, [reminders, interviews]);
}

// ── useCreateInterview ───────────────────────────────────────────────────────
// Handles both flows: pass `applicationId` to schedule against an existing
// application, omit it to create a standalone interview.

export function useCreateInterview() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const userId = user?.id ?? "";

  return useMutation({
    mutationFn: (
      params:
        | { applicationId: string; input: ScheduleInterviewInput }
        | { applicationId?: undefined; input: StandaloneInterviewInput },
    ) => {
      if (!user) throw new Error("Not authenticated");
      return params.applicationId
        ? interviewService.scheduleForApplication(user.id, params.applicationId, params.input)
        : interviewService.createStandalone(user.id, params.input as StandaloneInterviewInput);
    },

    onSettled: (_data, _err, params) => {
      void queryClient.invalidateQueries({ queryKey: interviewKeys.allByUser(userId) });
      if (params.applicationId) {
        void queryClient.invalidateQueries({
          queryKey: interviewKeys.byApplication(params.applicationId),
        });
      }
    },
  });
}

// ── useUpdateInterview ───────────────────────────────────────────────────────
// Edits an existing interview's fields (round, date/time, mode, link/location,
// interviewer, resume, notes).

export function useUpdateInterview() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const userId = user?.id ?? "";

  return useMutation({
    mutationFn: ({
      id,
      updates,
    }: {
      id: string;
      updates: Partial<Omit<Interview, "id" | "user_id" | "created_at" | "updated_at">>;
    }) => interviewService.updateInterview(id, updates),

    onSettled: (data) => {
      void queryClient.invalidateQueries({ queryKey: interviewKeys.allByUser(userId) });
      if (data) {
        void queryClient.invalidateQueries({ queryKey: interviewKeys.detail(data.id) });
      }
      if (data?.application_id) {
        void queryClient.invalidateQueries({
          queryKey: interviewKeys.byApplication(data.application_id),
        });
      }
    },
  });
}

// ── useUpdateInterviewStatus ─────────────────────────────────────────────────
// Quick-action status change, with an optimistic update to the allByUser cache
// (the same list the card/table quick-action menu and filters read from).

export function useUpdateInterviewStatus() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const userId = user?.id ?? "";

  return useMutation({
    mutationFn: ({ interview, status }: { interview: Interview; status: InterviewStatus }) =>
      interviewService.updateStatus(interview, status),

    onMutate: async ({ interview, status }) => {
      await queryClient.cancelQueries({ queryKey: interviewKeys.allByUser(userId) });

      const previous = queryClient.getQueryData<Interview[]>(interviewKeys.allByUser(userId));

      queryClient.setQueryData<Interview[]>(interviewKeys.allByUser(userId), (old) =>
        (old ?? []).map((i) => (i.id === interview.id ? { ...i, status } : i)),
      );

      return { previous };
    },

    onError: (_err, _vars, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(interviewKeys.allByUser(userId), context.previous);
      }
    },

    onSettled: (_data, _err, { interview }) => {
      void queryClient.invalidateQueries({ queryKey: interviewKeys.allByUser(userId) });
      void queryClient.invalidateQueries({ queryKey: interviewKeys.detail(interview.id) });
      if (interview.application_id) {
        void queryClient.invalidateQueries({
          queryKey: interviewKeys.byApplication(interview.application_id),
        });
      }
    },
  });
}

// ── useResyncInterviewFromCalendar ──────────────────────────────────────────
// "Resync from calendar" (Module 9B) — clears calendar_fields_locked and
// pulls the linked calendar event's current details. Only ever offered on a
// locked, calendar-linked interview (see InterviewDetail's gating).

export function useResyncInterviewFromCalendar() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const userId = user?.id ?? "";

  return useMutation({
    mutationFn: (id: string) => interviewService.resyncFromCalendar(id),

    onSettled: (data) => {
      void queryClient.invalidateQueries({ queryKey: interviewKeys.allByUser(userId) });
      if (data) {
        void queryClient.invalidateQueries({ queryKey: interviewKeys.detail(data.id) });
      }
      if (data?.application_id) {
        void queryClient.invalidateQueries({
          queryKey: interviewKeys.byApplication(data.application_id),
        });
      }
    },
  });
}

// ── useDeleteInterview ───────────────────────────────────────────────────────

export function useDeleteInterview() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const userId = user?.id ?? "";

  return useMutation({
    mutationFn: ({ id }: { id: string; applicationId?: string | null }) =>
      interviewService.deleteInterview(id),

    onSettled: (_data, _err, { applicationId }) => {
      void queryClient.invalidateQueries({ queryKey: interviewKeys.allByUser(userId) });
      if (applicationId) {
        void queryClient.invalidateQueries({
          queryKey: interviewKeys.byApplication(applicationId),
        });
      }
    },
  });
}
