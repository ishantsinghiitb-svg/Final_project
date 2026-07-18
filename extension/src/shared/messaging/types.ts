import type { UniversalJob } from "../../core/parsers/types";
import type { PanelJob } from "../../panel/types";

/**
 * Message bus type infrastructure.
 *
 * Handlers live in `extension/src/background/handlers/*` — this module only
 * defines the shapes that travel between the popup, content scripts, and the
 * background service worker.
 */

export const MessageType = {
  PING: "PING",
  GET_AUTH_STATE: "GET_AUTH_STATE",
  SYNC_GLOBAL_JOB: "SYNC_GLOBAL_JOB",
  IMPORT_JOB_URL: "IMPORT_JOB_URL",
  CURRENT_JOB_UPDATED: "CURRENT_JOB_UPDATED",
  GET_CURRENT_JOB: "GET_CURRENT_JOB",
  SAVE_JOB: "SAVE_JOB",
  TRACK_APPLICATION: "TRACK_APPLICATION",
  APPLY_AND_TRACK: "APPLY_AND_TRACK",
  SESSION_UPDATED: "SESSION_UPDATED",
} as const;

export type MessageType = (typeof MessageType)[keyof typeof MessageType];

export type PingMessage = {
  type: typeof MessageType.PING;
};

export type GetAuthStateMessage = {
  type: typeof MessageType.GET_AUTH_STATE;
};

export type AuthUser = {
  id: string;
  email: string | null;
};

export type AuthState = {
  authenticated: boolean;
  user: AuthUser | null;
};

export type SyncGlobalJobMessage = {
  type: typeof MessageType.SYNC_GLOBAL_JOB;
  payload: UniversalJob;
};

/**
 * Manual URL import from the popup. The user supplies the URL plus minimal
 * identity fields; the background handler runs the same
 * ManualImport → Normalizer → Validator → DuplicateResolver → upsert pipeline.
 */
export type ImportJobUrlMessage = {
  type: typeof MessageType.IMPORT_JOB_URL;
  payload: {
    url: string;
    title?: string;
    company?: string;
    description?: string;
  };
};

export type ImportJobUrlResult = {
  globalJobId: string;
  source: string;
  parserConfidence: number;
  warnings: string[];
};

/**
 * The content script's current view of the active tab's job — published to
 * the background worker (keyed by tab) every time the floating panel's own
 * state changes, so the popup can show the same job/CTA state without a
 * direct channel to the content script. `null` means no job is currently
 * detected on the tab (nothing parsed, or not logged in).
 */
export type CurrentJobState = {
  job: PanelJob;
  state: "ready" | "saved" | "tracked";
  globalJobId: string;
  /** Set once an application exists, so "View in NextOffer" can deep-link to it instead of the job. */
  applicationId: string | null;
};

/** Content script → background. Fire-and-forget; keyed by the sender tab. */
export type CurrentJobUpdatedMessage = {
  type: typeof MessageType.CURRENT_JOB_UPDATED;
  payload: CurrentJobState | null;
};

/**
 * Popup → background. Carries the tab id the POPUP resolved for itself
 * (`chrome.tabs.query({ active: true, currentWindow: true })` called from the
 * popup's own context) rather than having the background re-resolve "current
 * window" from a context with no window of its own — removes any ambiguity
 * about which tab's job is being asked for.
 */
export type GetCurrentJobMessage = {
  type: typeof MessageType.GET_CURRENT_JOB;
  payload: { tabId: number };
};

export type ApplicationSummary = {
  id: string;
  status: string;
};

export type GlobalJobSyncResult = {
  globalJobId: string;
  isClosed: boolean;
  isSaved: boolean;
  application: ApplicationSummary | null;
};

export type SaveJobMessage = {
  type: typeof MessageType.SAVE_JOB;
  payload: { globalJobId: string };
};

export type SaveJobResult = {
  saved: true;
};

export type TrackApplicationMessage = {
  type: typeof MessageType.TRACK_APPLICATION;
  payload: { globalJobId: string };
};

export type TrackApplicationResult = {
  application: ApplicationSummary;
  alreadyTracked: boolean;
};

/**
 * The combined "Apply & Track" action — saves the job (idempotent) and
 * tracks it (idempotent via `TRACK_APPLICATION`'s existing dedup) in one
 * round trip. Same result shape as `TRACK_APPLICATION`; the content script
 * already holds the job's apply URL from its own parsed data, so the
 * response doesn't need to carry one.
 */
export type ApplyAndTrackMessage = {
  type: typeof MessageType.APPLY_AND_TRACK;
  payload: { globalJobId: string };
};

/** Internal: sent by the auth-bridge content script to the background worker. `null` = signed out / no session found. */
export type SessionUpdatedMessage = {
  type: typeof MessageType.SESSION_UPDATED;
  payload: { accessToken: string; refreshToken: string } | null;
};

export type ExtensionMessage =
  | PingMessage
  | GetAuthStateMessage
  | SyncGlobalJobMessage
  | ImportJobUrlMessage
  | CurrentJobUpdatedMessage
  | GetCurrentJobMessage
  | SaveJobMessage
  | TrackApplicationMessage
  | ApplyAndTrackMessage
  | SessionUpdatedMessage;

export type ExtensionResponse<TData = unknown> =
  { ok: true; data: TData } | { ok: false; error: string };
