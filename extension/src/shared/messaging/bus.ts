import type { ExtensionMessage, ExtensionResponse } from "./types";

/**
 * Thin typed wrapper around `chrome.runtime.sendMessage`. The background
 * worker's `chrome.runtime.onMessage` listener (`background/service-worker.ts`)
 * dispatches per `MessageType` and responds through this same envelope shape.
 */
export async function sendMessage<TData = unknown>(
  message: ExtensionMessage,
): Promise<ExtensionResponse<TData>> {
  return chrome.runtime.sendMessage(message);
}
