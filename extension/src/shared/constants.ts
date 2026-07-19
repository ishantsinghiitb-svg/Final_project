export const EXTENSION_NAME = "NextOffer – AI Job Copilot";

export const EXTENSION_DESCRIPTION = "Track and manage job applications directly from job boards.";

/**
 * Origins the main content script (parsing + floating panel) runs on. A
 * single source of truth shared by the manifest's `content_scripts`/
 * `host_permissions` entries and the background worker's existing-tab
 * re-injection (see `service-worker.ts`) so the two lists can never drift
 * apart and silently stop covering the same tabs.
 */
export const JOB_BOARD_MATCH_PATTERNS = [
  "*://*.linkedin.com/*",
  "*://internshala.com/*",
  "*://*.internshala.com/*",
  "*://naukri.com/*",
  "*://*.naukri.com/*",
  "*://wellfound.com/*",
  "*://*.wellfound.com/*",
  "*://boards.greenhouse.io/*",
  "*://jobs.lever.co/*",
  "*://jobs.ashbyhq.com/*",
] as const;

/** chrome.storage.local key the auth-bridge session is persisted under. */
export const SESSION_STORAGE_KEY = "nextoffer_session";

/**
 * chrome.storage.local key the floating panel's expanded/collapsed
 * preference is persisted under. Absent (never set) means "no preference
 * yet" — the panel defaults to expanded on that first visit; once the user
 * manually expands/collapses, that choice is written here and wins on every
 * later page load or LinkedIn SPA navigation.
 */
export const PANEL_EXPANDED_STORAGE_KEY = "nextoffer_panel_expanded";

/** Debounce window (ms) between detecting a job-details change and re-running the parse/sync pipeline. */
export const JOB_CHANGE_DEBOUNCE_MS = 600;

/** Upper bound (ms) on how long continuous DOM mutations can delay a run. */
export const JOB_CHANGE_MAX_WAIT_MS = 2000;

/** Minimum time (ms) between two syncs of the *same* job, to avoid hammering the RPC on rapid re-renders. */
export const MIN_RESYNC_INTERVAL_MS = 30_000;
