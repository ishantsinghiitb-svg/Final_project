// ── Module 10B.1: admin crawl hooks ──
//
// Thin React Query wrappers over the admin server functions, following the
// same shape as src/features/google/hooks: read the session out of AuthContext,
// pass the access token explicitly, and let the server function do the admin
// check. Nothing here decides whether the caller is an admin — that answer
// comes from the server (`overview.isAdmin`), because a client-side check
// would be advisory at best.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getCrawlAdminOverview,
  runRegistryCrawl,
  verifyRegistrySources,
  type CrawlAdminOverview,
} from "@/server-functions/jobIntelligence";
import { useAuth } from "@/context/AuthContext";
import type { CrawlReport } from "@/server/jobIntelligence/crawl/report/CrawlReport";
import type { SourceHealthReport } from "@/server/jobIntelligence/crawl/verify/SourceHealthService";

export const crawlAdminKeys = {
  all: ["crawl-admin"] as const,
  overview: (userId: string) => [...crawlAdminKeys.all, "overview", userId] as const,
};

/**
 * The whole admin panel's data. Returns `isAdmin: false` for ordinary users
 * rather than erroring, so the Settings page can simply not render the tab.
 */
export function useCrawlAdminOverview() {
  const { user, session } = useAuth();
  const userId = user?.id ?? "";

  return useQuery<CrawlAdminOverview>({
    queryKey: crawlAdminKeys.overview(userId),
    enabled: Boolean(session?.access_token),
    // A crawl is manual and infrequent; refetching this on every window focus
    // would be pure noise.
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      if (!session?.access_token) throw new Error("Not authenticated");
      return getCrawlAdminOverview({ data: { accessToken: session.access_token } });
    },
  });
}

export type RunCrawlVariables = {
  /** null / omitted = every enabled registry entry. */
  platform?: string | null;
  dryRun?: boolean;
};

/**
 * Runs the source-health sweep (Module 10B.1.5). Separate from `useRunCrawl`
 * because it is a different operation with a different cost: it imports
 * nothing and touches each source once.
 */
export function useVerifySources() {
  const { user, session } = useAuth();
  const queryClient = useQueryClient();
  const userId = user?.id ?? "";

  return useMutation<SourceHealthReport, Error, { platform?: string | null }>({
    mutationFn: async ({ platform }) => {
      if (!session?.access_token) throw new Error("Not authenticated");
      return verifyRegistrySources({
        data: { accessToken: session.access_token, platform: platform ?? null },
      });
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: crawlAdminKeys.overview(userId) });
    },
  });
}

export function useRunCrawl() {
  const { user, session } = useAuth();
  const queryClient = useQueryClient();
  const userId = user?.id ?? "";

  return useMutation<CrawlReport, Error, RunCrawlVariables>({
    mutationFn: async ({ platform, dryRun }) => {
      if (!session?.access_token) throw new Error("Not authenticated");
      return runRegistryCrawl({
        data: { accessToken: session.access_token, platform: platform ?? null, dryRun },
      });
    },
    onSettled: () => {
      // Registry timestamps and the run list both moved.
      void queryClient.invalidateQueries({ queryKey: crawlAdminKeys.overview(userId) });
    },
  });
}
