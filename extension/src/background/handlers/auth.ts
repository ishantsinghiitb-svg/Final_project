import type { AuthState } from "../../shared/messaging/types";
import { getSupabaseClient } from "../../shared/supabase/client";
import { hydrateSupabaseSession, setStoredSession } from "../../shared/supabase/session-store";

/**
 * Resolves the current auth state, refreshing the bridged session if the
 * access token has expired. The MV3 service worker is ephemeral, so this
 * rehydrates from `chrome.storage.local` on every call rather than relying
 * on in-memory state surviving between messages.
 */
export async function getAuthState(): Promise<AuthState> {
  const hydrated = await hydrateSupabaseSession();
  if (!hydrated) return { authenticated: false, user: null };

  const { data, error } = await getSupabaseClient().auth.getUser();

  if (error) {
    const refreshed = await getSupabaseClient().auth.refreshSession();
    if (refreshed.error || !refreshed.data.session || !refreshed.data.user) {
      await setStoredSession(null);
      return { authenticated: false, user: null };
    }

    await setStoredSession({
      accessToken: refreshed.data.session.access_token,
      refreshToken: refreshed.data.session.refresh_token,
    });

    return {
      authenticated: true,
      user: { id: refreshed.data.user.id, email: refreshed.data.user.email ?? null },
    };
  }

  if (!data.user) return { authenticated: false, user: null };

  return { authenticated: true, user: { id: data.user.id, email: data.user.email ?? null } };
}
