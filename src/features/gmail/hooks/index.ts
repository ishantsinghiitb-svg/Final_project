import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { gmailService, type ResolveDecision } from "@/services/GmailService";
import { rebuildGmailSuggestions } from "@/server-functions/gmail";
import type { SuggestionFilter } from "@/features/gmail/types";
import type { Json } from "@/types/database";
import { invalidateMutatedDomains } from "@/features/google/mutatedDomainKeys";

// ── Suggestion queue hooks (Module 9A/9B) ──
//
// One unified queue regardless of source (Gmail/Calendar/Both) — there is no
// separate "calendar suggestions" query, just a `source` filter over the
// same list (see SuggestionRepository.findSuggestionsByUser). Connection
// management (connect/disconnect/sync-now/auto-sync) lives in
// src/features/google/hooks — this file stays scoped to the review queue
// itself, plus the Gmail-only dev rebuild tool.

/** What a caller supplies — the hook injects `accessToken` itself. */
export type ResolveDecisionInput =
  { action: "dismiss" } | { action: "accept"; editedPayload?: Json };

// ── Query key factory ───────────────────────────────────────────────────────
//
// `sourceScope` MUST be part of both keys below — Inbox ("gmail" scope) and
// Interviews/Dashboard/notifications ("calendar" scope) fetch the same
// underlying (userId, filter, search) tuple through different scopes, and
// without the scope in the key they'd collide on one cache entry: whichever
// fetch resolved last would silently overwrite the other's data.

export const suggestionKeys = {
  all: ["suggestions"] as const,
  list: (userId: string, filter: string, search: string, sourceScope: string) =>
    [...suggestionKeys.all, "list", userId, filter, search, sourceScope] as const,
  pendingCount: (userId: string, sourceScope: string) =>
    [...suggestionKeys.all, "pending-count", userId, sourceScope] as const,
};

// ── useRebuildGmailSuggestions (DEVELOPMENT ONLY) ────────────────────────────
// Regenerates Gmail-sourced suggestions from already-stored messages using
// the current classifier — no Gmail API call, no change to the OAuth
// connection or sync checkpoint, and never touches a calendar-sourced
// suggestion. The server function refuses outside dev regardless of whether
// any UI exposes it (see src/server-functions/gmail.ts).

export function useRebuildGmailSuggestions() {
  const { session } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      if (!session?.access_token) throw new Error("Not authenticated");
      return rebuildGmailSuggestions({ data: { accessToken: session.access_token } });
    },
    onSettled: () => {
      // Suggestions AND their messages changed, so the whole queue cache is
      // stale — including the sidebar's pending badge count. Also
      // invalidates the broader "google" root (not imported here to avoid a
      // circular dependency with features/google/hooks) since
      // last_synced_at-style fields aren't touched by this dev tool but a
      // future connection-status read shouldn't ever be stale after it runs.
      void queryClient.invalidateQueries({ queryKey: suggestionKeys.all });
      void queryClient.invalidateQueries({ queryKey: ["google"] });
    },
  });
}

// ── useSuggestions ───────────────────────────────────────────────────────────
// The Inbox's own query — Inbox is Gmail-only (Module 9 UX pass), so this
// always scopes to "gmail" (keeps gmail + both, drops pure-calendar rows).
// Calendar-sourced review items live on Interviews instead — see
// usePendingCalendarSuggestions below, a separate hook with its own cache
// key so the two surfaces never fight over one cache entry.

export function useSuggestions(filter: SuggestionFilter, companySearch: string) {
  const { user } = useAuth();
  return useQuery({
    queryKey: suggestionKeys.list(
      user?.id ?? "",
      filter,
      companySearch.trim().toLowerCase(),
      "gmail",
    ),
    queryFn: () => gmailService.listSuggestions(user!.id, filter, companySearch, "gmail"),
    enabled: Boolean(user),
    staleTime: 15 * 1_000,
  });
}

// ── usePendingCalendarSuggestions ───────────────────────────────────────────
// Every calendar-sourced pending review item (new interview/application
// candidates, and reschedule-conflict updates to an already-tracked
// interview) — the ONE query behind the Interviews page's pending panel,
// the Dashboard's "pending interview actions" banner, and the notification
// bell's suggestion-backed items. One fetch, three consumers, cached once.

export function usePendingCalendarSuggestions() {
  const { user } = useAuth();
  return useQuery({
    queryKey: suggestionKeys.list(user?.id ?? "", "pending", "", "calendar"),
    queryFn: () => gmailService.listSuggestions(user!.id, "pending", "", "calendar"),
    enabled: Boolean(user),
    staleTime: 15 * 1_000,
  });
}

// ── usePendingSuggestionCount ────────────────────────────────────────────────
// Powers the sidebar Inbox nav badge — scoped to "gmail" so it matches what
// the Inbox actually shows (a pending calendar-only suggestion is no longer
// visible there, so it shouldn't count toward this badge either). Same
// 5-minute staleTime as every other badge in useSidebarCounts; a resolve/
// sync mutation invalidates it directly for prompt updates right after the
// user acts.

export function usePendingSuggestionCount() {
  const { user } = useAuth();
  return useQuery({
    queryKey: suggestionKeys.pendingCount(user?.id ?? "", "gmail"),
    queryFn: () => gmailService.getPendingCount(user!.id, "gmail"),
    enabled: Boolean(user),
    staleTime: 5 * 60 * 1_000,
  });
}

// ── useResolveSuggestion ─────────────────────────────────────────────────────
// Single suggestion Review → Accept/Edit → Dismiss.

export function useResolveSuggestion() {
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
      void queryClient.invalidateQueries({ queryKey: suggestionKeys.all });
      invalidateMutatedDomains(queryClient);
    },
  });
}

// ── useResolveSuggestions (bulk) ─────────────────────────────────────────────

export function useResolveSuggestions() {
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
      void queryClient.invalidateQueries({ queryKey: suggestionKeys.all });
      invalidateMutatedDomains(queryClient);
    },
  });
}
