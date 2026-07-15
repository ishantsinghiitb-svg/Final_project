/**
 * Message bus type infrastructure.
 *
 * This module only defines the shape of messages that can travel between
 * the popup, content script, and background service worker. Handlers are
 * implemented in later modules — nothing here is wired up yet.
 */

export const MessageType = {
  PING: "PING",
  GET_AUTH_STATE: "GET_AUTH_STATE",
  SAVE_JOB: "SAVE_JOB",
  TRACK_APPLICATION: "TRACK_APPLICATION",
} as const;

export type MessageType = (typeof MessageType)[keyof typeof MessageType];

export type PingMessage = {
  type: typeof MessageType.PING;
};

export type GetAuthStateMessage = {
  type: typeof MessageType.GET_AUTH_STATE;
};

export type SaveJobMessage = {
  type: typeof MessageType.SAVE_JOB;
  payload: unknown;
};

export type TrackApplicationMessage = {
  type: typeof MessageType.TRACK_APPLICATION;
  payload: unknown;
};

export type ExtensionMessage =
  PingMessage | GetAuthStateMessage | SaveJobMessage | TrackApplicationMessage;

export type ExtensionResponse<TData = unknown> =
  { ok: true; data: TData } | { ok: false; error: string };
