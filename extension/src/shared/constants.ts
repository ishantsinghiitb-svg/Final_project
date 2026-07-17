export const EXTENSION_NAME = "NextOffer";

export const EXTENSION_DESCRIPTION = "Track and manage job applications directly from job boards.";

/** chrome.storage.local key the auth-bridge session is persisted under. */
export const SESSION_STORAGE_KEY = "nextoffer_session";

/** Debounce window (ms) between detecting a job-details change and re-running the parse/sync pipeline. */
export const JOB_CHANGE_DEBOUNCE_MS = 600;

/** Upper bound (ms) on how long continuous DOM mutations can delay a run. */
export const JOB_CHANGE_MAX_WAIT_MS = 2000;

/** Minimum time (ms) between two syncs of the *same* job, to avoid hammering the RPC on rapid re-renders. */
export const MIN_RESYNC_INTERVAL_MS = 30_000;
