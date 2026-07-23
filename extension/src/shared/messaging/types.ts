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
  GET_RESUME_MATCH: "GET_RESUME_MATCH",
  ANALYZE_MATCH: "ANALYZE_MATCH",
  UPLOAD_RESUME: "UPLOAD_RESUME",
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
 *
 * The second arm mirrors the floating panel's `unsupported-hiring-page`
 * state: the page has hiring-page signals but no dedicated parser exists for
 * it — informational only, never backed by an actual parse. It carries no
 * job data, unlike the first arm — narrow on `"job" in state` to tell them apart.
 */
export type CurrentJobState =
  | {
      job: PanelJob;
      state: "ready" | "saved" | "tracked";
      globalJobId: string;
      /** Set once an application exists, so "View in NextOffer" can deep-link to it instead of the job. */
      applicationId: string | null;
    }
  | { kind: "unsupported-hiring-page" };

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

/**
 * Score + plain-language label only (Module 6B) — never the full analysis
 * (whatMatches/whatToImprove/summary). The extension is a glance surface;
 * "View Details" deep-links to the dashboard for the rest. `null` covers
 * both "no default resume yet" and "not analyzed yet" — the panel only
 * needs to distinguish "have a cached score" from "don't".
 */
export type ResumeMatchSummary = {
  score: number;
  label: string;
};

/**
 * One selectable resume for the extension's Resume Match selector (Module 6C
 * stabilization). Only analyzable (parse-ready) resumes are surfaced. The
 * extension reads cached scores per resume; it never generates an analysis.
 */
export type ResumeOption = {
  id: string;
  name: string;
  isDefault: boolean;
};

export type GlobalJobSyncResult = {
  globalJobId: string;
  isClosed: boolean;
  isSaved: boolean;
  application: ApplicationSummary | null;
  /** The user's ready resumes (default first). Empty when none — the selector then hides. */
  resumes: ResumeOption[];
  /** Cached match for `resumes[0]` (the default, or the most-recent ready resume). */
  resumeMatch: ResumeMatchSummary | null;
  /** Remaining AI credits (RLS read). `null` when no usage row exists yet. */
  credits: number | null;
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

/**
 * Read the cached Resume Match for a SPECIFIC resume + job — the read behind
 * the extension's resume selector. Never generates an analysis (0 credits, no
 * provider call); returns `null` when that resume hasn't been analyzed for
 * this job yet. The panel/popup also cache results locally, so switching back
 * to a previously-selected resume restores instantly without even this message.
 */
export type GetResumeMatchMessage = {
  type: typeof MessageType.GET_RESUME_MATCH;
  payload: { resumeId: string; globalJobId: string };
};

/**
 * Runs the analysis directly from the extension (Module 6C) — background
 * forwards to the extension API route (`/api/extension/analyze-match`), which
 * reuses `ResumeMatchService.analyzeResumeMatch` exactly (same engine, cache,
 * versioning, AI-Credit accounting as the dashboard). The caller must already
 * have shown its own credit confirmation; this never confirms on its own.
 */
export type AnalyzeMatchMessage = {
  type: typeof MessageType.ANALYZE_MATCH;
  payload: { resumeId: string; globalJobId: string; forceRefresh: boolean };
};

export type AnalyzeMatchResult =
  | { ok: true; score: number; label: string; creditsRemaining: number }
  | { ok: false; code: string; message: string };

/**
 * Uploads + parses a PDF resume directly from the extension (Module 6C).
 * `bytes` is an ArrayBuffer (not a File/Blob) — the one payload shape that
 * survives structured-clone through `chrome.runtime.sendMessage` reliably
 * across every supported Chrome version.
 */
export type UploadResumeMessage = {
  type: typeof MessageType.UPLOAD_RESUME;
  payload: { name: string; mimeType: string; bytes: ArrayBuffer };
};

export type UploadResumeResult =
  | { ok: true; resume: ResumeOption }
  | { ok: false; message: string };

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
  | SessionUpdatedMessage
  | GetResumeMatchMessage
  | AnalyzeMatchMessage
  | UploadResumeMessage;

export type ExtensionResponse<TData = unknown> =
  { ok: true; data: TData } | { ok: false; error: string };
