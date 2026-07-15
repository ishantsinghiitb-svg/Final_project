import type { ExtensionMessage, ExtensionResponse } from "./types";

/**
 * Thin typed wrapper around `chrome.runtime.sendMessage`.
 *
 * No listeners are registered anywhere yet — later modules will add
 * `chrome.runtime.onMessage` handlers per `MessageType` in the background
 * worker and respond through this same envelope shape.
 */
export async function sendMessage<TData = unknown>(
  message: ExtensionMessage,
): Promise<ExtensionResponse<TData>> {
  return chrome.runtime.sendMessage(message);
}
