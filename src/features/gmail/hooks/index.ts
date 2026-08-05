import { useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { gmailService, type ResolveDecision } from "@/services/GmailService";
import {
  getGmailConnectUrl,
  disconnectGmail,
  checkAndSyncGmail,
  syncGmailNow,
  rebuildGmailSuggestions,
} from "@/server-functions/gmail";
import type { GmailSuggestionFilter } from "@/features/gmail/types";
import type { Json } from "@/types/database";

/** What a caller supplies — the hook injects `accessToken` itself. */
export type ResolveDecisionInput =
  { action: "dismiss" } | { action: "accept"; editedPayload?: Json };

// ── Query key factory ───────────────────────────────────────────────────────

export const gmailKeys = {
  all: ["gmail"] as const,
  connection: (userId: string) => [...gmailKeys.all, "connection", userId] as const,
  suggestions: (userId: string, filter: string, search: string) =>
    [...gmailKeys.all, "suggestions", userId, filter, search] as const,
  pendingCount: (userId: string) => [...gmailKeys.all, "pending-count", userId] as const,
};

// Every domain a suggestion accept can mutate — broad, cross-cutting
// invalidation on purpose, since a single accept can touch applications,
// interviews, reminders, and attachments (plus the application timeline,
// which nests under "applications" and invalidates along with it — see
// useApplicationTimeline's own comment).
const MUTATED_DOMAIN_KEYS = [
  ["applications"],
  ["interviews"],
  ["application-reminders"],
  ["application-attachments"],
];

function invalidateMutatedDomains(queryClient: ReturnType<typeof useQueryClient>) {
  for (const key of MUTATED_DOMAIN_KEYS) void queryClient.invalidateQueries({ queryKey: key });
}

// ── useGmailConnection ───────────────────────────────────────────────────────

export function useGmailConnection() {
  const { user } = useAuth();
  return useQuery({
    queryKey: gmailKeys.connection(user?.id ?? ""),
    queryFn: () => gmailService.getConnection(user!.id),
    enabled: Boolean(user),
    staleTime: 30 * 1_000,
  });
}

// ── useUpdateGmailAutoSync ───────────────────────────────────────────────────

export function useUpdateGmailAutoSync() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const userId = user?.id ?? "";

  return useMutation({
    mutationFn: (enabled: boolean) => gmailService.updateAutoSync(userId, enabled),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: gmailKeys.connection(userId) }),
  });
}

// ── useGmailConnectUrl ───────────────────────────────────────────────────────
// Redirects the browser to Google's consent screen on success — there is no
// "return value" the caller does anything else with.

export function useGmailConnectUrl() {
  const { session } = useAuth();

  return useMutation({
    mutationFn: async () => {
      if (!session?.access_token) throw new Error("Not authenticated");
      return getGmailConnectUrl({ data: { accessToken: session.access_token } });
    },
    onSuccess: ({ url }) => {
      window.location.href = url;
    },
  });
}

// ── useDisconnectGmail ───────────────────────────────────────────────────────

export function useDisconnectGmail() {
  const { user, session } = useAuth();
  const queryClient = useQueryClient();
  const userId = user?.id ?? "";

  return useMutation({
    mutationFn: async () => {
      if (!session?.access_token) throw new Error("Not authenticated");
      return disconnectGmail({ data: { accessToken: session.access_token } });
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: gmailKeys.connection(userId) }),
  });
}

// ── useSyncGmailNow ──────────────────────────────────────────────────────────
// The manual trigger — always runs, always awaited so the Settings/Inbox UI
// can show real progress and a completion toast.

export function useSyncGmailNow() {
  const { user, session } = useAuth();
  const queryClient = useQueryClient();
  const userId = user?.id ?? "";

  return useMutation({
    mutationFn: async () => {
      if (!session?.access_token) throw new Error("Not authenticated");
      return syncGmailNow({ data: { accessToken: session.access_token } });
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: gmailKeys.connection(userId) });
      void queryClient.invalidateQueries({ queryKey: gmailKeys.all });
    },
  });
}

// ── useRebuildGmailSuggestions (DEVELOPMENT ONLY) ────────────────────────────
// Regenerates suggestions from already-stored messages using the current
// classifier — no Gmail API call, no change to the OAuth connection or sync
// checkpoint. The server function refuses outside dev regardless of whether
// any UI exposes it (see src/server-functions/gmail.ts).

export function useRebuildGmailSuggestions() {
  const { user, session } = useAuth();
  const queryClient = useQueryClient();
  const userId = user?.id ?? "";

  return useMutation({
    mutationFn: async () => {
      if (!session?.access_token) throw new Error("Not authenticated");
      return rebuildGmailSuggestions({ data: { accessToken: session.access_token } });
    },
    onSettled: () => {
      // Suggestions AND their messages changed, so the whole Gmail cache is
      // stale — including the sidebar's pending badge count.
      void queryClient.invalidateQueries({ queryKey: gmailKeys.all });
      void queryClient.invalidateQueries({ queryKey: gmailKeys.connection(userId) });
    },
  });
}

// ── useGmailAutoSyncOnOpen ───────────────────────────────────────────────────
// The "app open" trigger — fires the cheap due-check once per mount (e.g.
// once when DashboardShell first renders for a session), never blocking
// render. checkAndSyncGmail itself no-ops unless a sync is actually due AND
// auto-sync is enabled — see GmailSyncService.isSyncDue.

export function useGmailAutoSyncOnOpen() {
  const { user, session } = useAuth();
  const queryClient = useQueryClient();
  const firedRef = useRef(false);

  useEffect(() => {
    if (firedRef.current || !user || !session?.access_token) return;
    firedRef.current = true;
    void checkAndSyncGmail({ data: { accessToken: session.access_token } }).then((result) => {
      if (result.status === "synced") {
        void queryClient.invalidateQueries({ queryKey: gmailKeys.all });
        invalidateMutatedDomains(queryClient);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deliberately fire-once, keyed on mount not on session churn
  }, [user?.id]);
}

// ── useGmailSuggestions ──────────────────────────────────────────────────────

export function useGmailSuggestions(filter: GmailSuggestionFilter, companySearch: string) {
  const { user } = useAuth();
  return useQuery({
    queryKey: gmailKeys.suggestions(user?.id ?? "", filter, companySearch.trim().toLowerCase()),
    queryFn: () => gmailService.listSuggestions(user!.id, filter, companySearch),
    enabled: Boolean(user),
    staleTime: 15 * 1_000,
  });
}

// ── usePendingGmailCount ─────────────────────────────────────────────────────
// Powers the sidebar nav badge — same 5-minute staleTime as every other
// badge in useSidebarCounts; a resolve/sync mutation invalidates it directly
// for prompt updates right after the user acts.

export function usePendingGmailCount() {
  const { user } = useAuth();
  return useQuery({
    queryKey: gmailKeys.pendingCount(user?.id ?? ""),
    queryFn: () => gmailService.getPendingCount(user!.id),
    enabled: Boolean(user),
    staleTime: 5 * 60 * 1_000,
  });
}

// ── useResolveGmailSuggestion ────────────────────────────────────────────────
// Single suggestion Review → Accept/Edit → Dismiss.

export function useResolveGmailSuggestion() {
  const { user, session } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      suggestionId,
      decision,
    }: {
      suggestionId: string;
      decision: ResolveDecisionInput;
    }) => {
      if (!user) throw new Error("Not authenticated");
      const withToken: ResolveDecision =
        decision.action === "accept"
          ? {
              action: "accept",
              accessToken: session?.access_token ?? "",
              editedPayload: decision.editedPayload,
            }
          : { action: "dismiss" };
      return gmailService.resolveSuggestion(user.id, suggestionId, withToken);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: gmailKeys.all });
      invalidateMutatedDomains(queryClient);
    },
  });
}

// ── useResolveGmailSuggestions (bulk) ────────────────────────────────────────

export function useResolveGmailSuggestions() {
  const { user, session } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      suggestionIds,
      action,
    }: {
      suggestionIds: string[];
      action: "accept" | "dismiss";
    }) => {
      if (!user) throw new Error("Not authenticated");
      return gmailService.resolveSuggestions(
        user.id,
        suggestionIds,
        action,
        session?.access_token ?? "",
      );
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: gmailKeys.all });
      invalidateMutatedDomains(queryClient);
    },
  });
}
