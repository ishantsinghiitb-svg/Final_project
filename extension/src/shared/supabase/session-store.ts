import { SESSION_STORAGE_KEY } from "../constants";
import { getSupabaseClient } from "./client";

export type StoredSession = {
  accessToken: string;
  refreshToken: string;
};

export async function getStoredSession(): Promise<StoredSession | null> {
  const result = await chrome.storage.local.get(SESSION_STORAGE_KEY);
  return (result[SESSION_STORAGE_KEY] as StoredSession | undefined) ?? null;
}

export async function setStoredSession(session: StoredSession | null): Promise<void> {
  if (session) {
    await chrome.storage.local.set({ [SESSION_STORAGE_KEY]: session });
  } else {
    await chrome.storage.local.remove(SESSION_STORAGE_KEY);
  }
}

/**
 * Rehydrates the shared Supabase client's in-memory session from
 * `chrome.storage.local`. The MV3 background service worker can be killed
 * and restarted between messages, so this must run before any authenticated
 * call rather than once at startup.
 */
export async function hydrateSupabaseSession(): Promise<boolean> {
  const stored = await getStoredSession();
  if (!stored) return false;

  const { error } = await getSupabaseClient().auth.setSession({
    access_token: stored.accessToken,
    refresh_token: stored.refreshToken,
  });

  return !error;
}
