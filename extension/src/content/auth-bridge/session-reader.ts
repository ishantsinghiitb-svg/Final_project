import { sendMessage } from "../../shared/messaging/bus";
import { MessageType } from "../../shared/messaging/types";

/**
 * Runs only on the NextOffer web app's own origin (see the second
 * content_scripts entry in manifest.config.ts, currently localhost-only).
 * Reads the Supabase session the web app already persisted to localStorage
 * and relays it to the background worker — this is the entire auth bridge;
 * there is no separate extension login.
 */
const SESSION_KEY_PATTERN = /^sb-.*-auth-token$/;
const POLL_INTERVAL_MS = 5000;

type BridgedSession = { accessToken: string; refreshToken: string };

function readSessionFromLocalStorage(): BridgedSession | null {
  for (let i = 0; i < window.localStorage.length; i++) {
    const key = window.localStorage.key(i);
    if (!key || !SESSION_KEY_PATTERN.test(key)) continue;

    const raw = window.localStorage.getItem(key);
    if (!raw) continue;

    try {
      const parsed = JSON.parse(raw) as { access_token?: string; refresh_token?: string };
      if (parsed.access_token && parsed.refresh_token) {
        return { accessToken: parsed.access_token, refreshToken: parsed.refresh_token };
      }
    } catch {
      // Not the Supabase session entry — keep looking.
    }
  }
  return null;
}

let lastReported: string | null = null;

function reportSessionIfChanged(): void {
  const session = readSessionFromLocalStorage();

  const signature = session ? `${session.accessToken}:${session.refreshToken}` : null;
  if (signature === lastReported) return;
  lastReported = signature;

  // Fire-and-forget — the next poll/storage event retries if this fails.
  void sendMessage({ type: MessageType.SESSION_UPDATED, payload: session }).catch(() => {});
}

reportSessionIfChanged();
window.addEventListener("storage", reportSessionIfChanged);
setInterval(reportSessionIfChanged, POLL_INTERVAL_MS);
