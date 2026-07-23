import type { CurrentJobState } from "../../shared/messaging/types";

const KEY_PREFIX = "current_job_";

/**
 * Per-tab "what job is the content script currently showing" store, backing
 * the popup's Current Job section. Uses `chrome.storage.session` (not an
 * in-memory Map) so the data survives the MV3 service worker being suspended
 * and restarted between the content script's last update and the popup
 * opening — a plain module-level variable would silently go stale.
 *
 * The popup never talks to the content script directly; this is the only
 * bridge between them.
 */
export async function setCurrentJobForTab(
  tabId: number,
  state: CurrentJobState | null,
): Promise<void> {
  const key = `${KEY_PREFIX}${tabId}`;
  if (state === null) {
    await chrome.storage.session.remove(key);
  } else {
    await chrome.storage.session.set({ [key]: state });
  }
}

export async function clearCurrentJobForTab(tabId: number): Promise<void> {
  await chrome.storage.session.remove(`${KEY_PREFIX}${tabId}`);
}

/**
 * Returns the stored state for a specific tab, if any. The caller (the popup)
 * resolves its own tab id rather than this function re-querying "the active
 * tab" — a background service worker has no window of its own, so
 * `currentWindow: true` there falls back to "the last-focused window," which
 * is an extra hop of ambiguity the popup doesn't have.
 */
export async function getCurrentJobForTab(tabId: number): Promise<CurrentJobState | null> {
  const key = `${KEY_PREFIX}${tabId}`;
  const result = await chrome.storage.session.get(key);
  return (result[key] as CurrentJobState | undefined) ?? null;
}
