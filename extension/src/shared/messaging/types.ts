import type { NormalizedJob } from "../../core/parsers/types";

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
  payload: NormalizedJob;
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
  | SaveJobMessage
  | TrackApplicationMessage
  | ApplyAndTrackMessage
  | SessionUpdatedMessage;

export type ExtensionResponse<TData = unknown> =
  { ok: true; data: TData } | { ok: false; error: string };
