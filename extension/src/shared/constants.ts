export const EXTENSION_NAME = "OfferLyst – AI Job Copilot";

export const EXTENSION_DESCRIPTION = "Track and manage job applications directly from job boards.";

/**
 * Origins the main content script (parsing + floating panel) runs on. A
 * single source of truth shared by the manifest's `content_scripts`/
 * `host_permissions` entries and the background worker's existing-tab
 * re-injection (see `service-worker.ts`) so the two lists can never drift
 * apart and silently stop covering the same tabs.
 *
 * Wellfound, Foundit, Indeed and Unstop have dedicated parsers (Module 4B
 * phase 2A/2B). The ATS hosts below (Greenhouse through ApplyToJob) don't yet — `SiteDetector`
 * resolves them to `Unsupported`, so today the content script only shows the
 * "not supported yet" informational state there (`hasHiringPageSignals` +
 * `content/index.ts`), never a parse/sync — see `ParserRegistry`'s note on
 * the decommissioned Generic Parser. They're staged here for the dedicated
 * parsers planned next (Greenhouse/Lever first, then Ashby/Workday/
 * SmartRecruiters/Teamtailor/Workable/BambooHR/Recruitee/ApplyToJob), so host
 * permissions don't need to change again when those ship. Deliberately NOT
 * `<all_urls>`: this stays a curated, reviewable list of well-known public
 * hiring platforms rather than a blanket "every site" permission.
 */
export const JOB_BOARD_MATCH_PATTERNS = [
  "*://*.linkedin.com/*",
  "*://internshala.com/*",
  "*://*.internshala.com/*",
  "*://naukri.com/*",
  "*://*.naukri.com/*",
  "*://wellfound.com/*",
  "*://*.wellfound.com/*",
  "*://foundit.in/*",
  "*://*.foundit.in/*",
  "*://indeed.com/*",
  "*://*.indeed.com/*",
  "*://unstop.com/*",
  "*://*.unstop.com/*",
  "*://boards.greenhouse.io/*",
  "*://jobs.lever.co/*",
  "*://jobs.ashbyhq.com/*",
  "*://*.myworkdayjobs.com/*",
  "*://*.smartrecruiters.com/*",
  "*://*.teamtailor.com/*",
  "*://apply.workable.com/*",
  "*://*.bamboohr.com/*",
  "*://*.recruitee.com/*",
  "*://*.applytojob.com/*",
] as const;

/**
 * ── THE ONE PLACE TO CHANGE WHEN THE PRODUCTION DOMAIN CHANGES ──
 *
 * The deployed OfferLyst web app's origin. No trailing slash — it is used
 * both as a URL base (see `shared/env.ts`'s `appUrl`, which builds
 * `${appUrl}/dashboard/...` links and `${appUrl}/api/extension/*` fetches)
 * and, with a `/*` suffix appended below, as an MV3 host-permission match
 * pattern.
 *
 * After buying a custom domain: change this single line, rebuild
 * (`npm run extension:build`, plus `npm run build:safari` for Safari), and
 * reload/republish the extension. Consider keeping the previous origin in
 * `TRUSTED_APP_ORIGINS` for a transition period so an already-open tab on
 * the old URL keeps bridging its session.
 */
export const PRODUCTION_APP_ORIGIN =
  "https://ishantsinghiitb-svg-final-project.ishantsingh-iitb.workers.dev";

/** Local dev server origin — the port `npm run dev` serves the web app on. */
export const LOCAL_APP_ORIGIN = "http://localhost:8080";

/**
 * Origins the extension trusts as "the OfferLyst web app": where the auth
 * bridge (`content/auth-bridge/session-reader.ts`) may read the
 * already-logged-in Supabase session from, and where the background worker's
 * privileged `/api/extension/*` fetches may go. Single source of truth for
 * BOTH `manifest.config.ts` (Chrome/Edge) and `manifest.safari.ts` (Safari).
 *
 * Localhost/127.0.0.1 stay listed so local development keeps working; being
 * in this list only means "the extension MAY talk to this origin", not "the
 * extension WILL navigate there" — which origin it actually navigates to and
 * calls is decided separately and unambiguously by `env.appUrl` (build-time,
 * one value, never both).
 *
 * Deliberately NOT `<all_urls>`: that would grant the extension access to
 * every site the user visits, which is a real privacy regression and a Web
 * Store review risk. MV3 gives no "whatever origin the app is on right now"
 * wildcard, so this list is necessarily explicit.
 */
export const TRUSTED_APP_ORIGINS = [
  "http://localhost:*/*",
  "http://127.0.0.1:*/*",
  `${PRODUCTION_APP_ORIGIN}/*`,
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
