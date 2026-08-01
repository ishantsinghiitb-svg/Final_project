import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { aiClient } from "@/services/ai/AIClient";

// ── useAIRecommendations (Module 8B) ──
//
// Mirrors useAnalytics (features/analytics/hooks/index.ts): auto-fires on
// mount, no manual "Generate" trigger — this capability is free. The short
// staleTime only avoids a redundant network call on rapid re-renders/
// remounts within the same browser session; the server itself never caches
// the AI response (see RecommendationsService.ts), so every call that does
// reach the server is a genuinely fresh computation.

export const recommendationsKeys = {
  all: ["ai-recommendations"] as const,
  data: (userId: string) => [...recommendationsKeys.all, userId] as const,
};

export function useAIRecommendations() {
  const { user } = useAuth();
  return useQuery({
    queryKey: recommendationsKeys.data(user?.id ?? ""),
    queryFn: () => aiClient.getRecommendations(),
    enabled: Boolean(user),
    staleTime: 60 * 1_000,
  });
}
