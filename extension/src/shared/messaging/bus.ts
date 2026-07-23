import type { ExtensionMessage, ExtensionResponse } from "./types";

/**
 * Thrown by `sendMessage` when this script's extension context has been
 * invalidated — the extension was reloaded/updated/removed via
 * chrome://extensions (or a fresh unpacked load) while this page was already
 * open. Chrome does NOT re-inject a live script into already-open tabs on
 * reload; the old one keeps running with a dead `chrome.runtime` binding.
 * This is the evidenced cause of the flooding
 * `GET chrome-extension://invalid/ net::ERR_FAILED` requests: CRXJS's
 * generated content-script loader (`dist/assets/*-loader-*.js`) calls
 * `chrome.runtime.getURL(...)` to dynamically import the real bundle — once
 * invalidated, `chrome.runtime.id` is `undefined` and `getURL` returns the
 * literal string `"chrome-extension://invalid/" + path`, so the import 404s.
 *
 * Distinguished from every other failure so the UI can show an honest
 * "this extension was updated — refresh the page" state instead of the
 * generic (and, in this case, WRONG) "No job detected" — a dead context is
 * not "no job on this page," it's "nothing is running to check."
 */
export class ExtensionContextInvalidatedError extends Error {
  constructor() {
    super("Extension context invalidated");
    this.name = "ExtensionContextInvalidatedError";
  }
}

/**
 * Thin typed wrapper around `chrome.runtime.sendMessage`. The background
 * worker's `chrome.runtime.onMessage` listener (`background/service-worker.ts`)
 * dispatches per `MessageType` and responds through this same envelope shape.
 */
export async function sendMessage<TData = unknown>(
  message: ExtensionMessage,
): Promise<ExtensionResponse<TData>> {
  // Synchronous check BEFORE attempting the call — `chrome.runtime.id` reads
  // as `undefined` the instant this script's context is invalidated, so this
  // catches the dead-context case without even attempting (and failing) a
  // round trip.
  if (!chrome.runtime?.id) {
    throw new ExtensionContextInvalidatedError();
  }
  try {
    return await chrome.runtime.sendMessage(message);
  } catch (err) {
    // Belt-and-suspenders: the context can die between the check above and
    // this call landing. Matches ONLY the exact "context invalidated" phrase
    // — deliberately NOT "Receiving end does not exist", which is the
    // separate, recoverable MV3 service-worker cold-start race that
    // `sendMessageWithRetry` (content/index.ts) already retries through.
    // Reclassifying that one too would turn a normal cold start into a false
    // "extension needs refresh" state.
    const text = err instanceof Error ? err.message : String(err);
    if (text.includes("context invalidated")) {
      throw new ExtensionContextInvalidatedError();
    }
    throw err;
  }
}
