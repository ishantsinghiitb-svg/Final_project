import { DuplicateResolver } from "../core/dedup/DuplicateResolver";
import { JobNormalizer } from "../core/normalization/JobNormalizer";
import { ListingParserFactory } from "../core/parsers/ListingParserFactory";
import { ParserFactory } from "../core/parsers/ParserFactory";
import type { JobParser, UniversalJob } from "../core/parsers/types";
import { extractLinkedInJobIdFromUrl } from "../core/parsers/linkedin/externalId";
import { hasHiringPageSignals } from "../core/site-detection/hiringPageSignals";
import { SiteDetector } from "../core/site-detection/SiteDetector";
import { SupportedSite } from "../core/site-detection/types";
import {
  JOB_CHANGE_DEBOUNCE_MS,
  JOB_CHANGE_MAX_WAIT_MS,
  MIN_RESYNC_INTERVAL_MS,
} from "../shared/constants";
import { env } from "../shared/env";
import { buildMatchUrl } from "../shared/matchDeepLink";
import { ExtensionContextInvalidatedError, sendMessage } from "../shared/messaging/bus";
import { MessageType } from "../shared/messaging/types";
import type {
  AnalyzeMatchResult,
  AuthState,
  CurrentJobState,
  ExtensionMessage,
  ExtensionResponse,
  GlobalJobSyncResult,
  ResumeMatchSummary,
  UploadResumeResult,
} from "../shared/messaging/types";
import { debounceWithMaxWait } from "./util/debounce";
import { ListingCapture } from "./listing/ListingCapture";
import { PanelController } from "./inject-panel";
import type { PanelActions, PanelJob, PanelViewState, PendingAction } from "../panel/FloatingPanel";

// Hydration grace for the detail pipeline (see runPipeline): how many times a
// single url may parse empty — while still "loading" — before we conclude the
// page genuinely has no job. ~4 × 700ms ≈ 2.8s covers LinkedIn's slowest
// job-pane hydration without a visible "No job detected" flash.
const MAX_HYDRATION_ATTEMPTS = 4;
const HYDRATION_RETRY_MS = 700;

declare global {
  interface Window {
    /**
     * Guards against running twice in the same tab — the background worker
     * can proactively re-inject this script into a tab that was already
     * open before the extension loaded (see `service-worker.ts`), which
     * would otherwise race Chrome's own normal injection for that same
     * navigation and produce duplicate MutationObservers/panels.
     */
    __nextofferContentScriptActive?: boolean;
  }
}

// ── Dead-context self-termination (fixes the chrome-extension://invalid flood) ──
//
// When the extension is reloaded/updated in chrome://extensions while a job-
// board tab stays open, Chrome does NOT kill this already-injected content
// script — it keeps running with a now-dead `chrome.runtime` (its
// `chrome.runtime.id` reads `undefined`). Its MutationObserver keeps firing on
// LinkedIn's constant DOM churn, so its pipeline + panel keep running, and
// CRXJS's generated loader/module machinery keeps resolving extension URLs
// against the invalid id → a continuous flood of `chrome-extension://invalid/`.
//
// The fix is to STOP the dead instance the moment its context dies: disconnect
// every observer, clear every timer, remove the panel, and release the
// single-instance guard so a freshly re-injected LIVE instance can take over
// the tab instead of being blocked by this dead one. This is a real teardown,
// not a console filter — nothing is suppressed; the dead code simply stops.
let contentScriptDisposed = false;
const disposers: Array<() => void> = [];
function registerDisposer(fn: () => void): void {
  disposers.push(fn);
}
function disposeContentScript(): void {
  if (contentScriptDisposed) return;
  contentScriptDisposed = true;
  for (const fn of disposers) {
    try {
      fn();
    } catch {
      /* best-effort teardown */
    }
  }
  // Release the guard so a re-injected live instance isn't blocked by this
  // dead one (see the guarded activation block below).
  try {
    window.__nextofferContentScriptActive = false;
  } catch {
    /* window may be gone during unload */
  }
}
// `chrome.runtime?.id` flips to undefined the instant this script's context is
// invalidated. Poll it; on death, tear everything down.
const contextWatchdog = setInterval(() => {
  if (!chrome?.runtime?.id) disposeContentScript();
}, 1000);
registerDisposer(() => clearInterval(contextWatchdog));

/**
 * Orchestration only, per the Module 2D spec: detect the site, ask the
 * ParserFactory for a parser, hand its output to validation/sync, inject the
 * panel. No site-specific DOM selectors live in this file.
 */
console.log("[NextOffer] Content script loaded");
console.log("[NextOffer] Current URL:", window.location.href);

const detectedSite = SiteDetector.detect(location.hostname);
console.log("[NextOffer] Site detected:", detectedSite);

const parser = ParserFactory.getParser(location.hostname);
console.log("[NextOffer] Parser:", parser?.constructor?.name);

const listingParser = ListingParserFactory.getListingParser(location.hostname);
const listingActive = listingParser?.matches({ document, url: location.href }) ?? false;

if (!window.__nextofferContentScriptActive && (parser || listingActive)) {
  window.__nextofferContentScriptActive = true;

  // The floating panel must stay visible on EVERY page of a supported site
  // (homepage, search, listing, company, profile, job detail) — it never
  // unmounts; it just shows a "no job detected" state when the current page
  // has no single job to save.
  if (listingActive && listingParser) {
    // Listing/search page: capture the cards the user scrolls past in the
    // background, AND keep a persistent "no job detected" panel up. The
    // single-job detail pipeline is deliberately NOT run here — a search page
    // can carry a stray `JobPosting`, and we must never present a random
    // listed job as the one the user is viewing (nor run its heavy navigation
    // observer over an infinite-scroll list). A detail page is a different URL
    // that reloads into the `runDetailCapture` branch below.
    void new ListingCapture(listingParser).start();

    if (listingParser.detailOpensInline && parser) {
      // …EXCEPT on sites where a job opens INLINE on this same SPA URL (Indeed:
      // `/` + `?vjk=`). There the listing/detail dispatch is decided once at
      // load, so a page that starts as a bare listing would stay latched here
      // and never notice a job being opened without a reload. Running the
      // detail pipeline too lets `runDetailCapture` detect the inline job (via
      // its own navigation observer) and drive its Save/Track CTAs, while still
      // showing "no job detected" whenever none is open — so the bare listing
      // page reads correctly. The site's own parser is URL-gated, so this
      // safely reports no job until a job key appears in the URL.
      runDetailCapture(parser);
    } else {
      showNoJobState();
    }
  } else if (parser) {
    // Detail-capable page (LinkedIn/Naukri/Wellfound/Foundit detail, etc.):
    // parse the active job and drive the panel; shows "no job detected" until
    // a job becomes active (a Wellfound modal opening, an SPA nav into a
    // detail view) and re-populates automatically when it does.
    runDetailCapture(parser);
  }
} else if (!window.__nextofferContentScriptActive) {
  // No dedicated parser or listing parser matched this host (the Generic
  // Parser that used to fill this gap was decommissioned from production —
  // see ParserRegistry). If the page still looks like a hiring page, say so
  // instead of staying silently idle — but this branch never parses, syncs,
  // saves, or tracks anything; it only shows an informational message.
  const isUnsupportedHiringPage = hasHiringPageSignals(document, location.href);
  if (isUnsupportedHiringPage) {
    window.__nextofferContentScriptActive = true;
    showUnsupportedHiringPageState();
  }
}

/**
 * Informational-only: no dedicated parser exists for this host, but the page
 * still looks like a hiring page (see `hasHiringPageSignals`). The signal
 * check itself runs once at load, same as the parser/listing checks above —
 * it is never re-evaluated, so this never re-parses or re-scores the page.
 *
 * The panel mount is re-asserted on body-level DOM changes (a cheap,
 * non-`subtree` observer — bounded to `document.body`'s direct children,
 * nothing deeper) purely because some hiring-page SPAs keep rewriting the
 * DOM after `document_idle` (hydration, client-side routing) and can carry
 * the panel's host off along with whatever else they replace, leaving the
 * background's published state correct (so the popup still shows it) while
 * the on-page panel silently isn't there anymore. `PanelController.update`
 * is what actually decides whether to recreate anything — this only decides
 * when to ask it to check.
 */
function showUnsupportedHiringPageState(): void {
  const panel = new PanelController();
  const noop = (): void => {};
  const actions: PanelActions = {
    onApplyAndTrack: noop,
    onSaveForLater: noop,
    onTrackApplication: noop,
    onViewInNextOffer: noop,
    onOpenInNextOffer: () => window.open(env.appUrl, "_blank"),
    onViewMatchDetails: noop,
    onAnalyzeMatch: async () => ({
      ok: false,
      code: "unsupported",
      message: "Not available here.",
    }),
    onFetchResumeMatch: () => Promise.resolve(null),
    onUploadResume: async () => ({ ok: false, message: "Not available here." }),
  };
  const state: PanelViewState = { kind: "unsupported-hiring-page" };

  const mount = () => {
    if (contentScriptDisposed) return;
    panel.update(state, actions, null);
  };
  mount();
  void sendMessage({
    type: MessageType.CURRENT_JOB_UPDATED,
    payload: { kind: "unsupported-hiring-page" },
  }).catch(() => {});

  const hostWatcher = new MutationObserver(mount);
  hostWatcher.observe(document.body, { childList: true });
  registerDisposer(() => hostWatcher.disconnect());
  registerDisposer(() => panel.destroy());
}

/**
 * Persistent "no job detected" panel for a listing/search page — the page has
 * no single job to save, but the extension must stay visible (and the user can
 * still collapse/expand it) while `ListingCapture` imports cards in the
 * background. Deliberately the lightweight counterpart to `runDetailCapture`:
 * it never parses, syncs, or observes for job changes (a listing page has no
 * single job to change), just keeps the panel mounted — re-asserting the mount
 * on body-level DOM changes (a cheap, non-`subtree` observer) the same way
 * `showUnsupportedHiringPageState` does, since listing SPAs rewrite the DOM as
 * new cards load and can carry the panel host off with them.
 */
function showNoJobState(): void {
  const panel = new PanelController();
  const noop = (): void => {};
  const actions: PanelActions = {
    onApplyAndTrack: noop,
    onSaveForLater: noop,
    onTrackApplication: noop,
    onViewInNextOffer: noop,
    onOpenInNextOffer: () => window.open(env.appUrl, "_blank"),
    onViewMatchDetails: noop,
    onAnalyzeMatch: async () => ({
      ok: false,
      code: "unsupported",
      message: "Not available here.",
    }),
    onFetchResumeMatch: () => Promise.resolve(null),
    onUploadResume: async () => ({ ok: false, message: "Not available here." }),
  };
  const state: PanelViewState = { kind: "no-job" };

  const mount = () => {
    if (contentScriptDisposed) return;
    panel.update(state, actions, null);
  };
  mount();
  // The popup reads the same bridge; a listing page has no current single job.
  void sendMessage({ type: MessageType.CURRENT_JOB_UPDATED, payload: null }).catch(() => {});

  const hostWatcher = new MutationObserver(mount);
  hostWatcher.observe(document.body, { childList: true });
  registerDisposer(() => hostWatcher.disconnect());
  registerDisposer(() => panel.destroy());
}

/**
 * LinkedIn only: does the CURRENT url name a specific job posting?
 *
 * Every valid LinkedIn job surface carries the selected job's id in the url —
 * `/jobs/view/<id>` in the path, or `?currentJobId=`/`jobId=`/`trackingJobId=`
 * on the split-pane surfaces (/jobs/search, /jobs/collections/*, …). So this is
 * a deterministic, DOM-free signal that the page IS a job page, computed by the
 * exact id extractor the parser and manual-import already share (reused, never
 * re-implemented — the parser and its selectors are untouched).
 *
 * It exists purely so the content-script UI lifecycle can keep the panel in
 * `loading` (never `no-job`) while LinkedIn's details pane is still hydrating
 * between two valid jobs. Gated on the detected site, so it returns `false` for
 * every non-LinkedIn host — every other platform's lifecycle is byte-for-byte
 * unchanged.
 */
function urlNamesLinkedInJob(url: string): boolean {
  return detectedSite === SupportedSite.LinkedIn && extractLinkedInJobIdFromUrl(url) !== null;
}

/**
 * The single-job detail-page pipeline (LinkedIn, plus Internshala/Naukri detail
 * pages): parse the one job on the page, sync it, and drive the floating panel
 * and its CTAs. Behaviour is unchanged from before Module 4B — it was only
 * lifted into a function so a listing page can take the branch above instead of
 * running this.
 */
function runDetailCapture(activeParser: JobParser): void {
  const panel = new PanelController();
  registerDisposer(() => panel.destroy());

  let currentJob: UniversalJob | null = null;
  let currentGlobalJobId: string | null = null;
  let lastSyncResult: GlobalJobSyncResult | null = null;
  let lastSyncedKey: string | null = null;
  let lastSyncedAt = 0;
  let lastSyncedHadDescription = false;
  let pending: PendingAction = null;
  // Monotonic run token. The pipeline is async and the observer/debounce can
  // fire it repeatedly, so several invocations may be in flight at once. Each
  // run captures its token and, after every await, bails if a newer run has
  // started — so a slow/older run can never clobber a newer run's render (the
  // core race behind the intermittent "No job detected").
  let generation = 0;
  // The url we last rendered a real job for. A later EMPTY parse on the SAME
  // url is a transient re-render blip (LinkedIn constantly re-renders its
  // shell) and must NOT flip the panel to "no job" — we keep the job on screen.
  // Only a different url (real navigation) or a never-rendered url can go empty.
  let renderedUrl: string | null = null;
  // Identity of the job we last rendered (dedup key + a description-present bit).
  // The MutationObserver fires on LinkedIn's constant UNRELATED DOM churn; when
  // a re-fire re-parses the SAME job on the SAME url, nothing changed, so we
  // skip the whole pipeline (no re-sync, no re-render). This is what stops the
  // continuous execution / repeated-parse / needless-rerender loop.
  let renderedKey: string | null = null;
  // Hydration grace: on a url we have NOT rendered a job for yet, the details
  // pane may still be mounting — retry a bounded number of times (showing
  // "loading") before concluding there is genuinely no job.
  let hydrationUrl: string | null = null;
  let hydrationAttempts = 0;

  const actions: PanelActions = {
    onApplyAndTrack: () => void handleApplyAndTrack(),
    onSaveForLater: () => void handleSaveForLater(),
    onTrackApplication: () => void handleTrackApplication(),
    onViewInNextOffer: () => {
      const applicationId = lastSyncResult?.application?.id;
      if (applicationId) {
        window.open(`${env.appUrl}/dashboard/applications/${applicationId}`, "_blank");
      } else if (currentGlobalJobId) {
        window.open(`${env.appUrl}/dashboard/jobs/${currentGlobalJobId}`, "_blank");
      }
    },
    onOpenInNextOffer: () => window.open(env.appUrl, "_blank"),
    onViewMatchDetails: (resumeId) => {
      if (!currentGlobalJobId) return;
      window.open(buildMatchUrl(currentGlobalJobId, resumeId, "view"), "_blank");
    },
    onAnalyzeMatch: async (resumeId, forceRefresh) => {
      if (!currentGlobalJobId) {
        return { ok: false, code: "no_job", message: "No job detected on this page." };
      }
      try {
        const response = await sendMessage<AnalyzeMatchResult>({
          type: MessageType.ANALYZE_MATCH,
          payload: { resumeId, globalJobId: currentGlobalJobId, forceRefresh },
        });
        if (!response.ok) return { ok: false, code: "error", message: response.error };
        return response.data;
      } catch (err) {
        if (err instanceof ExtensionContextInvalidatedError) {
          panel.update({ kind: "extension-invalidated" }, actions, null);
        }
        return { ok: false, code: "error", message: "Couldn't reach NextOffer. Try again." };
      }
    },
    onFetchResumeMatch: async (resumeId) => {
      if (!currentGlobalJobId) return null;
      try {
        const response = await sendMessage<ResumeMatchSummary | null>({
          type: MessageType.GET_RESUME_MATCH,
          payload: { resumeId, globalJobId: currentGlobalJobId },
        });
        return response.ok ? response.data : null;
      } catch {
        return null;
      }
    },
    onUploadResume: async (file) => {
      try {
        const response = await sendMessage<UploadResumeResult>({
          type: MessageType.UPLOAD_RESUME,
          payload: { name: file.name, mimeType: file.type, bytes: file.bytes },
        });
        if (!response.ok) return { ok: false, message: response.error };
        if (!response.data.ok) return response.data;

        // Splice the new resume into the current job's list and re-render —
        // avoids a full re-sync round trip just to pick up one new resume.
        // Default-first, matching getUserResumes()'s own ordering: if this
        // upload was the user's first-ever resume it comes back marked
        // default, and resumes[0] must stay the default for the "is this
        // already the freshest, no fetch needed" logic in ResumeMatchRow.
        const newResume = response.data.resume;
        if (lastSyncResult && currentJob) {
          const withoutDup = lastSyncResult.resumes.filter((r) => r.id !== newResume.id);
          const resumes = newResume.isDefault
            ? [newResume, ...withoutDup]
            : [...withoutDup, newResume];
          lastSyncResult = { ...lastSyncResult, resumes };
          renderFromSync(currentJob, lastSyncResult);
        }
        return { ok: true, resume: newResume };
      } catch (err) {
        if (err instanceof ExtensionContextInvalidatedError) {
          panel.update({ kind: "extension-invalidated" }, actions, null);
        }
        return { ok: false, message: "Couldn't reach NextOffer. Try again." };
      }
    },
  };

  const run = debounceWithMaxWait(
    () => void runPipeline(),
    JOB_CHANGE_DEBOUNCE_MS,
    JOB_CHANGE_MAX_WAIT_MS,
  );

  run();
  watchForNavigation(run);

  async function runPipeline(): Promise<void> {
    // A disposed (dead-context) instance must do nothing — this is the loop
    // that would otherwise keep driving the invalid-URL machinery.
    if (contentScriptDisposed) return;
    const gen = ++generation;
    // Website → Parser (extraction only) → Normalizer. Validation, dedup
    // resolution and persistence happen in the background handler.
    const currentUrl = location.href;
    const raw = activeParser.tryParse({ document, url: currentUrl });

    if (!raw) {
      // Transient empty re-render of a page we already show a job for — keep
      // the job on screen. LinkedIn re-renders its shell constantly; a blank
      // parse here does NOT mean the user navigated away.
      if (currentUrl === renderedUrl) return;

      // A url we haven't rendered a job for yet: it may still be hydrating.
      if (currentUrl !== hydrationUrl) {
        hydrationUrl = currentUrl;
        hydrationAttempts = 0;
      }

      if (hydrationAttempts < MAX_HYDRATION_ATTEMPTS) {
        // Hold "loading" and retry shortly rather than prematurely declaring
        // "no job detected".
        hydrationAttempts += 1;
        if (gen === generation) {
          console.log("[NextOffer] Panel state: loading (hydration retry)");
          panel.update({ kind: "loading" }, actions, null);
        }
        setTimeout(() => run(), HYDRATION_RETRY_MS);
        return;
      }

      // Grace exhausted. On LinkedIn the url itself names the selected job
      // (/jobs/view/<id>, or a ?currentJobId=<id> split-pane surface), so if it
      // STILL names a job the posting genuinely belongs on this page and simply
      // hasn't hydrated within the grace window — LinkedIn's details pane can
      // take longer than MAX_HYDRATION_ATTEMPTS × HYDRATION_RETRY_MS to mount,
      // especially while switching between two jobs. That is NOT "no job"; it is
      // the exact transition that was flashing "No job detected". Hold "loading"
      // and let the navigation MutationObserver re-drive the pipeline the moment
      // the pane mounts — no added delay/timer/retry/poll; recovery rides the
      // observer that already watches this SPA (see watchForNavigation).
      if (urlNamesLinkedInJob(currentUrl)) {
        if (gen === generation) {
          console.log("[NextOffer] Panel state: loading (url still names a job)");
          panel.update({ kind: "loading" }, actions, null);
        }
        return;
      }

      // Grace exhausted and the url names no job — this page genuinely has no
      // single job right now (a listing/search/company page, or a closed job
      // modal). Keep the panel mounted showing "no job detected" rather than
      // tearing it down.
      currentJob = null;
      currentGlobalJobId = null;
      renderedUrl = null;
      renderedKey = null;
      if (gen === generation) {
        console.log("[NextOffer] Panel state: no-job (hydration grace exhausted)");
        panel.update({ kind: "no-job" }, actions, null);
        publishCurrentJob(null);
      }
      return;
    }

    // A real job parsed — clear the grace state for this url.
    hydrationUrl = currentUrl;
    hydrationAttempts = 0;

    const job = JobNormalizer.normalize(raw);
    currentJob = job;

    // Idempotency gate — the single most important loop-stopper. The observer
    // fires on LinkedIn's unrelated DOM churn; if this re-fire re-parsed the
    // SAME job on the SAME url (and its description-present state is unchanged),
    // nothing changed, so do NOTHING: no log, no auth, no sync, no re-render.
    // The description bit lets the ONE enrich re-sync through when the body
    // finally hydrates, then goes stable again.
    const dedupKey = DuplicateResolver.dedupKey(job);
    const jobHasDescription = Boolean(job.description);
    const renderKey = `${dedupKey}${jobHasDescription ? ":d" : ""}`;
    if (currentUrl === renderedUrl && renderKey === renderedKey) return;

    console.log("[NextOffer] Normalization:", job);

    let authResponse: ExtensionResponse<AuthState>;
    try {
      authResponse = await sendMessageWithRetry<AuthState>({ type: MessageType.GET_AUTH_STATE });
    } catch (err) {
      if (err instanceof ExtensionContextInvalidatedError) {
        if (gen === generation) {
          console.log("[NextOffer] Panel state: extension-invalidated (auth call)");
          panel.update({ kind: "extension-invalidated" }, actions, null);
        }
        return;
      }
      // Service worker never came up within the retry window — nothing
      // more to do this run; the next SPA navigation or mutation will
      // trigger another attempt.
      return;
    }
    if (gen !== generation) return; // superseded by a newer run

    if (!authResponse.ok || !authResponse.data.authenticated) {
      console.log("[NextOffer] Panel state: not-logged-in");
      panel.update({ kind: "not-logged-in" }, actions, null);
      publishCurrentJob(null);
      return;
    }

    // Only show "loading" if we don't already have this exact page rendered —
    // avoids a re-sync (e.g. description enrichment) blanking the visible card.
    if (currentUrl !== renderedUrl) {
      console.log("[NextOffer] Panel state: loading (pre-sync)");
      panel.update({ kind: "loading" }, actions, null);
    }

    const now = Date.now();
    const canReuseLastSync =
      dedupKey === lastSyncedKey &&
      lastSyncResult !== null &&
      now - lastSyncedAt < MIN_RESYNC_INTERVAL_MS &&
      // Don't reuse a description-less sync once the description has finally
      // hydrated — re-sync once so upsert_global_job COALESCE-enriches it.
      (lastSyncedHadDescription || !jobHasDescription);

    if (canReuseLastSync) {
      renderedUrl = currentUrl;
      renderedKey = renderKey;
      renderFromSync(job, lastSyncResult!);
      return;
    }

    let syncResponse: ExtensionResponse<GlobalJobSyncResult>;
    try {
      console.log("[NextOffer] Sending SYNC_GLOBAL_JOB");
      syncResponse = await sendMessageWithRetry<GlobalJobSyncResult>({
        type: MessageType.SYNC_GLOBAL_JOB,
        payload: job,
      });
      console.log("[NextOffer] Response:", syncResponse);
    } catch (err) {
      if (err instanceof ExtensionContextInvalidatedError) {
        if (gen === generation) {
          console.log("[NextOffer] Panel state: extension-invalidated (sync call)");
          panel.update({ kind: "extension-invalidated" }, actions, null);
        }
        return;
      }
      return;
    }
    if (gen !== generation) return; // superseded by a newer run

    if (!syncResponse.ok) {
      // Identity invalid (no title/company/id) — genuinely nothing to save.
      // Never overwrite a job we're already showing for this same url.
      if (currentUrl === renderedUrl) return;
      // …but on LinkedIn a url that STILL names a specific job is a job page:
      // the id resolves from the url before the title/company hydrate, so a
      // transiently-partial parse can fail validation mid-navigation. Hold
      // "loading" instead of flashing "no job" — the observer re-drives a full
      // parse the moment the details pane finishes mounting (same rationale as
      // the hydration-grace branch above).
      if (urlNamesLinkedInJob(currentUrl)) {
        console.log("[NextOffer] Panel state: loading (url still names a job)");
        panel.update({ kind: "loading" }, actions, null);
        return;
      }
      console.log("[NextOffer] Panel state: no-job (invalid sync response)");
      panel.update({ kind: "no-job" }, actions, null);
      publishCurrentJob(null);
      return;
    }

    lastSyncedKey = dedupKey;
    lastSyncedAt = now;
    lastSyncedHadDescription = jobHasDescription;
    lastSyncResult = syncResponse.data;
    currentGlobalJobId = syncResponse.data.globalJobId;
    renderedUrl = currentUrl;
    renderedKey = renderKey;
    renderFromSync(job, syncResponse.data);
  }

  function renderFromSync(job: UniversalJob, result: GlobalJobSyncResult): void {
    const panelJob: PanelJob = {
      title: job.title,
      companyName: job.companyName,
      companyLogoUrl: job.companyLogoUrl,
      location: job.location,
      workMode: job.workMode,
      employmentType: job.employmentType,
      isClosed: result.isClosed,
      resumes: result.resumes,
      resumeMatch: result.resumeMatch,
      credits: result.credits,
    };
    const kind: "ready" | "saved" | "tracked" = result.application
      ? "tracked"
      : result.isSaved
        ? "saved"
        : "ready";
    const state: PanelViewState = { kind, job: panelJob };

    console.log("[NextOffer] Rendering:", state);
    panel.update(state, actions, pending);
    // Same state the floating panel just rendered — republished on every
    // sync and every CTA response so the popup (which has no direct channel
    // to this content script) always reflects it too. See background/
    // handlers/currentJob.ts.
    publishCurrentJob({
      job: panelJob,
      state: kind,
      globalJobId: result.globalJobId,
      applicationId: result.application?.id ?? null,
    });
  }

  /** Fire-and-forget: the popup polls this on open, so a lost message just means a stale/empty popup, never a broken page. */
  function publishCurrentJob(state: CurrentJobState | null): void {
    void sendMessage({ type: MessageType.CURRENT_JOB_UPDATED, payload: state }).catch(() => {});
  }

  /** Secondary CTA for the `ready` state only — bookmark without applying. */
  async function handleSaveForLater(): Promise<void> {
    if (!currentGlobalJobId || !currentJob || pending) return;
    pending = "save";
    renderFromSync(currentJob, lastSyncResult!);

    const response = await sendMessage({
      type: MessageType.SAVE_JOB,
      payload: { globalJobId: currentGlobalJobId },
    });

    pending = null;
    if (!response.ok || !lastSyncResult) return;

    lastSyncResult = { ...lastSyncResult, isSaved: true };
    renderFromSync(currentJob, lastSyncResult);
  }

  /**
   * Primary CTA for the `ready` state — reuses the existing Save and Track
   * messages' server-side idempotency (never a duplicate save or
   * application) rather than reimplementing dedup on the client. Per the
   * Module 2 spec, this only prepares the job inside NextOffer — it never
   * redirects the user off the LinkedIn page; LinkedIn's own "Apply" button
   * remains the way the user actually submits the application.
   */
  async function handleApplyAndTrack(): Promise<void> {
    if (!currentGlobalJobId || !currentJob || pending) return;
    pending = "applyAndTrack";
    renderFromSync(currentJob, lastSyncResult!);

    const response = await sendMessage<{ application: { id: string; status: string } }>({
      type: MessageType.APPLY_AND_TRACK,
      payload: { globalJobId: currentGlobalJobId },
    });

    pending = null;
    if (!response.ok || !lastSyncResult) return;

    lastSyncResult = { ...lastSyncResult, isSaved: true, application: response.data.application };
    renderFromSync(currentJob, lastSyncResult);
  }

  /** Primary CTA for the `saved` state — the job is already saved, so this only creates the tracked application. */
  async function handleTrackApplication(): Promise<void> {
    if (!currentGlobalJobId || !currentJob || pending) return;
    pending = "track";
    renderFromSync(currentJob, lastSyncResult!);

    const response = await sendMessage<{ application: { id: string; status: string } }>({
      type: MessageType.TRACK_APPLICATION,
      payload: { globalJobId: currentGlobalJobId },
    });

    pending = null;
    if (!response.ok || !lastSyncResult) return;

    lastSyncResult = { ...lastSyncResult, application: response.data.application };
    renderFromSync(currentJob, lastSyncResult);
  }
}

/**
 * The MV3 background service worker is event-driven and can still be
 * finishing its own startup (evaluating its top-level module code and
 * registering its `onMessage` listener) at the exact moment the pipeline's
 * very first message goes out — this can happen within milliseconds of the
 * content script loading, since LinkedIn job pages embed JSON-LD job data
 * server-side, so `tryParse` can succeed on the very first `run()` call
 * before any DOM mutation even occurs. In that narrow window,
 * `chrome.runtime.sendMessage` rejects with "Receiving end does not exist"
 * rather than queuing the message. Only the pipeline's own automatic
 * startup messages (`GET_AUTH_STATE`, `SYNC_GLOBAL_JOB`) can land in that
 * window — user-triggered CTA messages fire long after the worker is
 * already warm — so this retry is scoped to those two call sites rather
 * than the shared message bus. A short, error-driven, bounded retry rides
 * out that one-time race without an arbitrary upfront delay; once the
 * worker is warm, delivery is reliable for the rest of the session.
 */
async function sendMessageWithRetry<TData>(
  message: ExtensionMessage,
  attempts = 5,
  delayMs = 200,
): Promise<ExtensionResponse<TData>> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await sendMessage<TData>(message);
    } catch (error) {
      // A dead context can never recover — retrying just burns time before
      // the caller finds out. Rethrow immediately so it can show the honest
      // "extension was updated" state instead of five silent, doomed retries.
      if (error instanceof ExtensionContextInvalidatedError) throw error;
      if (attempt >= attempts) throw error;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

/**
 * LinkedIn is a SPA: the job-details panel can change without a URL change
 * (clicking another card in a list) or with one (deep link / back-forward).
 * Both signals feed the same debounced callback.
 */
function watchForNavigation(onChange: () => void): void {
  // Every entry point is inert once the instance is disposed — a dead context's
  // observer/history/popstate signals must not keep the pipeline churning.
  const guarded = () => {
    if (contentScriptDisposed) return;
    onChange();
  };

  const observer = new MutationObserver(guarded);
  // childList + subtree only — NOT characterData. Job navigation (a card click,
  // an SPA route change) always adds/removes/replaces DOM nodes; it never
  // manifests as a bare text-content edit. Watching characterData made this
  // callback fire on every unrelated text change on the page (LinkedIn's feed,
  // chat, timers), churning the debounce far more than detection ever needs.
  observer.observe(document.body, { childList: true, subtree: true });
  registerDisposer(() => observer.disconnect());

  const originalPushState = history.pushState.bind(history);
  history.pushState = (...args: Parameters<History["pushState"]>) => {
    originalPushState(...args);
    guarded();
  };

  const originalReplaceState = history.replaceState.bind(history);
  history.replaceState = (...args: Parameters<History["replaceState"]>) => {
    originalReplaceState(...args);
    guarded();
  };

  window.addEventListener("popstate", guarded);
  registerDisposer(() => window.removeEventListener("popstate", guarded));
}
