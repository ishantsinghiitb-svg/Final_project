import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { useProfile } from "@/context/ProfileContext";
import { analyticsService } from "@/services/AnalyticsService";
import { resolveGoalTargets } from "@/features/analytics/utils";
import type { AnalyticsRangePreset } from "@/features/analytics/types";

// ── Query key factory ────────────────────────────────────────────────────────

export const analyticsKeys = {
  all: ["analytics"] as const,
  data: (userId: string, range: AnalyticsRangePreset) =>
    [...analyticsKeys.all, userId, range] as const,
};

// ── useAnalytics ──────────────────────────────────────────────────────────────
// The full Analytics Dashboard payload for the selected time range.

export function useAnalytics(range: AnalyticsRangePreset) {
  const { user } = useAuth();
  return useQuery({
    queryKey: analyticsKeys.data(user?.id ?? "", range),
    queryFn: () => analyticsService.getAnalytics(user!.id, range),
    enabled: Boolean(user),
    staleTime: 60 * 1_000,
  });
}

// ── useAnalyticsGoals ─────────────────────────────────────────────────────────
// Goals live on `profiles` (see supabase/migrations/20260807000001_module8a_...),
// not a new table/context — this just wraps the existing useProfile() update
// flow so the route doesn't need new mutation plumbing.

export type GoalUpdates = {
  goal_applications?: number | null;
  goal_interviews?: number | null;
  goal_offers?: number | null;
};

export function useAnalyticsGoals() {
  const { profile, update } = useProfile();
  const targets = useMemo(() => resolveGoalTargets(profile), [profile]);
  return {
    targets,
    setGoals: (updates: GoalUpdates) => update(updates),
  };
}
