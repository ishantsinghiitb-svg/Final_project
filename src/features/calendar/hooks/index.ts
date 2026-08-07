import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { rebuildCalendarEvents } from "@/server-functions/calendar";
import { googleKeys } from "@/features/google/hooks";
import { suggestionKeys } from "@/features/gmail/hooks";

// ── useRebuildCalendarEvents (DEVELOPMENT ONLY) ──────────────────────────────
// Re-runs the current relevance/matching logic over already-stored
// calendar_events using the current classifier — no Calendar API call, no
// change to the OAuth connection or sync checkpoint. The server function
// refuses outside dev regardless of whether any UI exposes it (see
// src/server-functions/calendar.ts).

export function useRebuildCalendarEvents() {
  const { session } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      if (!session?.access_token) throw new Error("Not authenticated");
      return rebuildCalendarEvents({ data: { accessToken: session.access_token } });
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: suggestionKeys.all });
      void queryClient.invalidateQueries({ queryKey: googleKeys.all });
    },
  });
}
