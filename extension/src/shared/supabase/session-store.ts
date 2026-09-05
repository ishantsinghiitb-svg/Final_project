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
 *
 * ⚠️ `auth.setSession()` is NOT a passive assignment: when the stored access
 * token has already expired it silently exchanges the refresh token for a
 * brand-new pair and reports no error. `client.ts` runs with
 * `persistSession: false` (a service worker has no localStorage), so that new
 * pair lives ONLY in this client's memory — nothing writes it back on its own.
 *
 * Writing it back here is what makes this function's contract true for BOTH
 * kinds of caller:
 *   - callers that go through the shared client (job sync, resume list, AI
 *     credits) were always fine, because they use the in-memory session; and
 *   - callers that read the raw token back out of storage to send it to the
 *     server (`background/handlers/aiJobMatch.ts` → `/api/extension/*`), which
 *     previously picked up the stale, already-expired access token and got a
 *     401 "Not authenticated." from `requireUser` — while the rest of the
 *     panel kept working, so the UI looked signed in.
 *
 * It also keeps the ROTATED refresh token. Supabase rotates on every refresh
 * and revokes the parent, so discarding it left storage holding a token that
 * was invalid from the next service-worker wake onward — the extension then
 * signed itself out even though the web app session was still good.
 */
export async function hydrateSupabaseSession(): Promise<boolean> {
  const stored = await getStoredSession();
  if (!stored) return false;

  const { data, error } = await getSupabaseClient().auth.setSession({
    access_token: stored.accessToken,
    refresh_token: stored.refreshToken,
  });

  if (error || !data.session) return false;

  if (
    data.session.access_token !== stored.accessToken ||
    data.session.refresh_token !== stored.refreshToken
  ) {
    await setStoredSession({
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
    });
  }

  return true;
}
