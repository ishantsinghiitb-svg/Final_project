import { useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { googleService } from "@/services/GoogleService";
import type { GoogleProduct } from "@/repositories/GoogleConnectionRepository";
import {
  getGoogleConnectUrl,
  disconnectGoogleProduct,
  checkAndSyncGmail,
  syncGmailNow,
} from "@/server-functions/gmail";
import { checkAndSyncCalendar, syncCalendarNow } from "@/server-functions/calendar";
import { suggestionKeys } from "@/features/gmail/hooks";
import { invalidateMutatedDomains } from "@/features/google/mutatedDomainKeys";

// ── Google connection hooks (Module 9A/9B) ──
//
// One shared Google OAuth connection, two independently-tracked products.
// Lives in its own feature directory (not features/gmail) because it's no
// longer Gmail-specific — Settings' unified "Google" card and both products'
// Sync Now / Auto Sync controls are built on these.

export const googleKeys = {
  all: ["google"] as const,
  connection: (userId: string) => [...googleKeys.all, "connection", userId] as const,
};

// ── useGoogleConnection ──────────────────────────────────────────────────────

export function useGoogleConnection() {
  const { user } = useAuth();
  return useQuery({
    queryKey: googleKeys.connection(user?.id ?? ""),
    queryFn: () => googleService.getConnection(user!.id),
    enabled: Boolean(user),
    staleTime: 30 * 1_000,
  });
}

// ── useUpdateGoogleAutoSync ──────────────────────────────────────────────────

export function useUpdateGoogleAutoSync(product: GoogleProduct) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const userId = user?.id ?? "";

  return useMutation({
    mutationFn: (enabled: boolean) => googleService.updateAutoSync(userId, product, enabled),
    onSettled: () =>
      void queryClient.invalidateQueries({ queryKey: googleKeys.connection(userId) }),
  });
}

// ── useConnectGoogleProduct ──────────────────────────────────────────────────
// Redirects the browser to Google's consent screen on success — there is no
// "return value" the caller does anything else with.

export function useConnectGoogleProduct() {
  const { session } = useAuth();

  return useMutation({
    mutationFn: async (product: GoogleProduct) => {
      if (!session?.access_token) throw new Error("Not authenticated");
      return getGoogleConnectUrl({ data: { accessToken: session.access_token, product } });
    },
    onSuccess: ({ url }) => {
      window.location.href = url;
    },
  });
}

// ── useDisconnectGoogleProduct ───────────────────────────────────────────────

export function useDisconnectGoogleProduct() {
  const { user, session } = useAuth();
  const queryClient = useQueryClient();
  const userId = user?.id ?? "";

  return useMutation({
    mutationFn: async (product: GoogleProduct) => {
      if (!session?.access_token) throw new Error("Not authenticated");
      return disconnectGoogleProduct({ data: { accessToken: session.access_token, product } });
    },
    onSettled: () =>
      void queryClient.invalidateQueries({ queryKey: googleKeys.connection(userId) }),
  });
}

// ── useSyncGmailNow / useSyncCalendarNow ─────────────────────────────────────
// The per-product manual triggers — always run, always awaited so the
// Settings UI can show real progress and a completion toast. Prefer
// useSyncGoogleNow below for anywhere that should sync "everything the user
// has connected" as one action (Settings' combined button, Inbox,
// Interviews) — these two stay exported because useSyncGoogleNow is built
// directly on top of them.
//
// Both invalidate `interviews` (via MUTATED_DOMAIN_KEYS) in addition to the
// connection/suggestion caches — a sync can silently update an unlocked
// interview's time/link/location server-side (see
// CalendarSyncService.syncAlreadyLinkedInterview), which the client's
// interview cache would otherwise never learn about until something else
// happened to invalidate it.

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
      void queryClient.invalidateQueries({ queryKey: googleKeys.connection(userId) });
      void queryClient.invalidateQueries({ queryKey: suggestionKeys.all });
      invalidateMutatedDomains(queryClient);
    },
  });
}

export function useSyncCalendarNow() {
  const { user, session } = useAuth();
  const queryClient = useQueryClient();
  const userId = user?.id ?? "";

  return useMutation({
    mutationFn: async () => {
      if (!session?.access_token) throw new Error("Not authenticated");
      return syncCalendarNow({ data: { accessToken: session.access_token } });
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: googleKeys.connection(userId) });
      void queryClient.invalidateQueries({ queryKey: suggestionKeys.all });
      invalidateMutatedDomains(queryClient);
    },
  });
}

// ── useSyncGoogleNow ─────────────────────────────────────────────────────────
// THE unified "Sync Now" — every sync button in the app calls this, and only
// this, so the user never has to think about which system is syncing.
// Syncs whichever product(s) are actually connected (mirrors the gating
// logic Inbox's own local handleSyncNow used to duplicate), refreshes
// connection status, suggestions, and every domain a sync can silently
// mutate. Returns both raw results so callers can build their own toast
// copy via `syncOutcomeMessage` (features/google/syncOutcome.ts).

export function useSyncGoogleNow() {
  const { data: connection } = useGoogleConnection();
  const syncGmail = useSyncGmailNow();
  const syncCalendar = useSyncCalendarNow();

  const isPending = syncGmail.isPending || syncCalendar.isPending;

  async function syncNow() {
    const gmailConnected = Boolean(
      connection?.gmail_status && connection.gmail_status !== "disconnected",
    );
    const calendarConnected = Boolean(
      connection?.calendar_status && connection.calendar_status !== "disconnected",
    );

    const [gmailResult, calendarResult] = await Promise.all([
      gmailConnected ? syncGmail.mutateAsync() : null,
      calendarConnected ? syncCalendar.mutateAsync() : null,
    ]);

    return { gmailResult, calendarResult };
  }

  return { syncNow, isPending };
}

// ── useGoogleAutoSyncOnOpen ──────────────────────────────────────────────────
// The "app open" trigger — fires both products' cheap due-checks once per
// mount (e.g. once when DashboardShell first renders for a session), never
// blocking render. Each check no-ops unless a sync is actually due AND
// auto-sync is enabled — see GmailSyncService.isSyncDue /
// CalendarSyncService.isCalendarSyncDue.

export function useGoogleAutoSyncOnOpen() {
  const { user, session } = useAuth();
  const queryClient = useQueryClient();
  const firedRef = useRef(false);

  useEffect(() => {
    if (firedRef.current || !user || !session?.access_token) return;
    firedRef.current = true;
    const accessToken = session.access_token;

    function onSynced() {
      void queryClient.invalidateQueries({ queryKey: suggestionKeys.all });
      invalidateMutatedDomains(queryClient);
    }

    void checkAndSyncGmail({ data: { accessToken } }).then((result) => {
      if (result.status === "synced") onSynced();
    });
    void checkAndSyncCalendar({ data: { accessToken } }).then((result) => {
      if (result.status === "synced") onSynced();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deliberately fire-once, keyed on mount not on session churn
  }, [user?.id]);
}
