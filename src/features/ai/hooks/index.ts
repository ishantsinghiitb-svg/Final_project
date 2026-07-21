import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { aiClient } from "@/services/ai/AIClient";

export const aiKeys = {
  all: ["ai"] as const,
  credits: (userId: string) => [...aiKeys.all, "credits", userId] as const,
};

/**
 * Current AI credit balance (paywall-ready). The frontend can read
 * `featureLocked` / `creditsRemaining` / `upgradeRequired` to gate AI features
 * and later show an upgrade screen. No AI generation ships in 6A.
 */
export function useAICredits() {
  const { user } = useAuth();
  return useQuery({
    queryKey: aiKeys.credits(user?.id ?? ""),
    queryFn: () => aiClient.getCredits(),
    enabled: Boolean(user),
    staleTime: 30 * 1_000,
  });
}
