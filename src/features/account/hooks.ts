import { useMutation } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { deleteMyAccount } from "@/server-functions/account";

// ── useDeleteAccount (production audit B6) ──
//
// No cache invalidation on success — there is nothing left to refetch: the
// account (and every query keyed off it) is gone, and the caller's own
// handler signs out and navigates away immediately after this resolves.

export function useDeleteAccount() {
  const { session } = useAuth();

  return useMutation({
    mutationFn: async () => {
      if (!session?.access_token) throw new Error("Not authenticated");
      return deleteMyAccount({ data: { accessToken: session.access_token } });
    },
  });
}
