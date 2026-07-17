import type { ExtensionMessage, ExtensionResponse } from "../shared/messaging/types";
import { MessageType } from "../shared/messaging/types";
import { setStoredSession } from "../shared/supabase/session-store";
import { trackApplication } from "./handlers/applications";
import { getAuthState } from "./handlers/auth";
import { saveGlobalJob, syncGlobalJob } from "./handlers/jobs";

/**
 * Wires the message bus (extension/src/shared/messaging) to the handler
 * modules. Business logic lives in ./handlers/* — this file only dispatches.
 */
chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
  handleMessage(message)
    .then((data) => {
      sendResponse({ ok: true, data } satisfies ExtensionResponse);
    })
    .catch((error: unknown) => {
      const reason = error instanceof Error ? error.message : "Unknown error";
      sendResponse({ ok: false, error: reason } satisfies ExtensionResponse);
    });

  return true; // keep the message channel open for the async response
});

async function handleMessage(message: ExtensionMessage): Promise<unknown> {
  switch (message.type) {
    case MessageType.PING:
      return { pong: true };

    case MessageType.GET_AUTH_STATE:
      return getAuthState();

    case MessageType.SESSION_UPDATED:
      await setStoredSession(message.payload);
      return { acknowledged: true };

    case MessageType.SYNC_GLOBAL_JOB: {
      const auth = await requireAuth();
      return syncGlobalJob(message.payload, auth.user);
    }

    case MessageType.SAVE_JOB: {
      const auth = await requireAuth();
      await saveGlobalJob(message.payload.globalJobId, auth.user);
      return { saved: true };
    }

    case MessageType.TRACK_APPLICATION: {
      const auth = await requireAuth();
      return trackApplication(message.payload.globalJobId, auth.user);
    }

    default: {
      const exhaustive: never = message;
      throw new Error(`Unhandled message type: ${JSON.stringify(exhaustive)}`);
    }
  }
}

async function requireAuth() {
  const auth = await getAuthState();
  if (!auth.authenticated || !auth.user) {
    throw new Error("Not authenticated");
  }
  return { user: auth.user };
}
