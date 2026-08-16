// ── Module 13 · Phase 5: Admin Platform hooks ──
//
// Same shape as features/jobCrawlers/hooks.ts: read the session out of
// AuthContext, pass the access token explicitly, let the server function do
// the actual admin check. Nothing here decides admin-ness — that answer
// always comes from the server.

import { useQuery } from "@tanstack/react-query";
import {
  getIsAdmin,
  getAdminOverview,
  searchAdminUsers,
  listAdminFeedback,
  type AdminOverviewResult,
} from "@/server-functions/admin";
import type { AdminUserSummary } from "@/server/admin/AdminUsers";
import type { AdminFeedbackItem } from "@/server/admin/AdminFeedback";
import { useAuth } from "@/context/AuthContext";

export const adminKeys = {
  all: ["admin"] as const,
  isAdmin: (userId: string) => [...adminKeys.all, "is-admin", userId] as const,
  overview: (userId: string) => [...adminKeys.all, "overview", userId] as const,
  users: (userId: string, query: string) => [...adminKeys.all, "users", userId, query] as const,
  feedback: (userId: string) => [...adminKeys.all, "feedback", userId] as const,
};

/** Cheap admin check, used only to decide whether the Admin nav link renders. */
export function useIsAdmin() {
  const { user, session } = useAuth();
  const userId = user?.id ?? "";

  return useQuery({
    queryKey: adminKeys.isAdmin(userId),
    enabled: Boolean(session?.access_token),
    staleTime: 5 * 60_000,
    queryFn: async () => {
      if (!session?.access_token) throw new Error("Not authenticated");
      return getIsAdmin({ data: { accessToken: session.access_token } });
    },
  });
}

export function useAdminOverview() {
  const { user, session } = useAuth();
  const userId = user?.id ?? "";

  return useQuery<AdminOverviewResult>({
    queryKey: adminKeys.overview(userId),
    enabled: Boolean(session?.access_token),
    staleTime: 30_000,
    queryFn: async () => {
      if (!session?.access_token) throw new Error("Not authenticated");
      return getAdminOverview({ data: { accessToken: session.access_token } });
    },
  });
}

export function useAdminUsers(query: string) {
  const { user, session } = useAuth();
  const userId = user?.id ?? "";

  return useQuery<AdminUserSummary[]>({
    queryKey: adminKeys.users(userId, query),
    enabled: Boolean(session?.access_token),
    staleTime: 15_000,
    queryFn: async () => {
      if (!session?.access_token) throw new Error("Not authenticated");
      return searchAdminUsers({ data: { accessToken: session.access_token, query } });
    },
  });
}

export function useAdminFeedback() {
  const { user, session } = useAuth();
  const userId = user?.id ?? "";

  return useQuery<AdminFeedbackItem[]>({
    queryKey: adminKeys.feedback(userId),
    enabled: Boolean(session?.access_token),
    staleTime: 30_000,
    queryFn: async () => {
      if (!session?.access_token) throw new Error("Not authenticated");
      return listAdminFeedback({ data: { accessToken: session.access_token } });
    },
  });
}
