import { JOB_BOARD_MATCH_PATTERNS } from "../shared/constants";
import type { ExtensionMessage, ExtensionResponse } from "../shared/messaging/types";
import { MessageType } from "../shared/messaging/types";
import { setStoredSession } from "../shared/supabase/session-store";
import { trackApplication } from "./handlers/applications";
import { getAuthState } from "./handlers/auth";
import {
  clearCurrentJobForTab,
  getCurrentJobForTab,
  setCurrentJobForTab,
} from "./handlers/currentJob";
import {
  getResumeMatchForResume,
  importJobFromUrl,
  saveGlobalJob,
  syncGlobalJob,
} from "./handlers/jobs";
import { analyzeMatch, uploadResume } from "./handlers/aiJobMatch";

/**
 * Chrome only auto-injects content scripts into tabs that navigate *after*
 * the extension's content-script registration is in place — a tab that was
 * already open (browser startup restoring a session, or a dev/prod reload
 * of the extension) never gets the script until it reloads. This
 * proactively injects the job-board content script into any already-open
 * matching tab so the floating panel appears without a manual refresh.
 * `content/index.ts` guards against running twice in a tab Chrome already
 * injected normally.
 */
async function injectIntoExistingJobBoardTabs(): Promise<void> {
  const jobBoardScript = chrome.runtime
    .getManifest()
    .content_scripts?.find((entry) => entry.matches?.some((m) => m.includes("linkedin.com")));
  if (!jobBoardScript?.js?.length) return;

  const tabs = await chrome.tabs.query({ url: [...JOB_BOARD_MATCH_PATTERNS] });

  await Promise.all(
    tabs
      .filter((tab): tab is chrome.tabs.Tab & { id: number } => typeof tab.id === "number")
      .map((tab) =>
        chrome.scripting
          .executeScript({ target: { tabId: tab.id }, files: jobBoardScript.js! })
          .catch(() => {
            // Restricted page (chrome://, the Chrome Web Store, a PDF viewer,
            // etc.) or a tab the script is somehow already running in —
            // safe to skip either way.
          }),
      ),
  );
}

chrome.runtime.onInstalled.addListener(() => void injectIntoExistingJobBoardTabs());
chrome.runtime.onStartup.addListener(() => void injectIntoExistingJobBoardTabs());

/** Drops a closed tab's stored current-job state so it never leaks/goes stale. */
chrome.tabs.onRemoved.addListener((tabId) => void clearCurrentJobForTab(tabId));

/**
 * Wires the message bus (extension/src/shared/messaging) to the handler
 * modules. Business logic lives in ./handlers/* — this file only dispatches.
 */
chrome.runtime.onMessage.addListener((message: ExtensionMessage, sender, sendResponse) => {
  handleMessage(message, sender)
    .then((data) => {
      sendResponse({ ok: true, data } satisfies ExtensionResponse);
    })
    .catch((error: unknown) => {
      const reason = error instanceof Error ? error.message : "Unknown error";
      sendResponse({ ok: false, error: reason } satisfies ExtensionResponse);
    });

  return true; // keep the message channel open for the async response
});

async function handleMessage(
  message: ExtensionMessage,
  sender: chrome.runtime.MessageSender,
): Promise<unknown> {
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

    case MessageType.IMPORT_JOB_URL: {
      await requireAuth();
      return importJobFromUrl(message.payload);
    }

    case MessageType.CURRENT_JOB_UPDATED: {
      // Sent by the content script, keyed by its own tab — no auth/response
      // data needed, just persist it for the popup to read later.
      if (typeof sender.tab?.id === "number") {
        await setCurrentJobForTab(sender.tab.id, message.payload);
      }
      return { acknowledged: true };
    }

    case MessageType.GET_CURRENT_JOB: {
      // The popup resolved its own tab id (see popup/App.tsx) — just read
      // what the content script last published for it.
      return getCurrentJobForTab(message.payload.tabId);
    }

    case MessageType.GET_RESUME_MATCH: {
      // Read-only cached-score lookup behind the panel's resume selector.
      // requireAuth first so the shared Supabase client is authenticated (RLS
      // scopes the read to this user).
      await requireAuth();
      return getResumeMatchForResume(message.payload.resumeId, message.payload.globalJobId);
    }

    case MessageType.ANALYZE_MATCH: {
      // No requireAuth() gate here — analyzeMatch resolves its own token (and
      // returns a structured `not_authenticated` result) so a signed-out user
      // gets a normal in-panel message instead of a thrown/rejected message.
      return analyzeMatch(
        message.payload.resumeId,
        message.payload.globalJobId,
        message.payload.forceRefresh,
      );
    }

    case MessageType.UPLOAD_RESUME: {
      return uploadResume(message.payload.name, message.payload.mimeType, message.payload.bytes);
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

    case MessageType.APPLY_AND_TRACK: {
      const auth = await requireAuth();
      // Reuses the existing Save and Track logic exactly (not reimplemented)
      // so both actions' dedup guarantees carry over: saveJob is idempotent
      // on (user_id, job_id), and trackApplication checks for an existing
      // application before creating one.
      await saveGlobalJob(message.payload.globalJobId, auth.user);
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
