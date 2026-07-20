import { DuplicateResolver } from "../core/dedup/DuplicateResolver";
import { JobNormalizer } from "../core/normalization/JobNormalizer";
import { ListingParserFactory } from "../core/parsers/ListingParserFactory";
import { ParserFactory } from "../core/parsers/ParserFactory";
import type { JobParser, UniversalJob } from "../core/parsers/types";
import { hasHiringPageSignals } from "../core/site-detection/hiringPageSignals";
import {
  JOB_CHANGE_DEBOUNCE_MS,
  JOB_CHANGE_MAX_WAIT_MS,
  MIN_RESYNC_INTERVAL_MS,
} from "../shared/constants";
import { env } from "../shared/env";
import { sendMessage } from "../shared/messaging/bus";
import { MessageType } from "../shared/messaging/types";
import type {
  AuthState,
  CurrentJobState,
  ExtensionMessage,
  ExtensionResponse,
  GlobalJobSyncResult,
} from "../shared/messaging/types";
import { debounceWithMaxWait } from "./util/debounce";
import { ListingCapture } from "./listing/ListingCapture";
import { PanelController } from "./inject-panel";
import type { PanelActions, PanelJob, PanelViewState, PendingAction } from "../panel/FloatingPanel";

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

/**
 * Orchestration only, per the Module 2D spec: detect the site, ask the
 * ParserFactory for a parser, hand its output to validation/sync, inject the
 * panel. No site-specific DOM selectors live in this file.
 */
const parser = ParserFactory.getParser(location.hostname);
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
    showNoJobState();
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
  console.debug("[NextOffer][DEBUG] 1. Unsupported hiring page detected?", isUnsupportedHiringPage);
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
  };
  const state: PanelViewState = { kind: "unsupported-hiring-page" };

  const mount = () => {
    console.debug("[NextOffer][DEBUG] 4. PanelController.update() called?", true);
    panel.update(state, actions, null);
  };
  mount();
  void sendMessage({
    type: MessageType.CURRENT_JOB_UPDATED,
    payload: { kind: "unsupported-hiring-page" },
  })
    .then(() => {
      console.debug("[NextOffer][DEBUG] 2. Message sent from content script?", true);
    })
    .catch((err) => {
      console.debug("[NextOffer][DEBUG] 2. Message sent from content script?", false, err);
    });

  const hostWatcher = new MutationObserver(mount);
  hostWatcher.observe(document.body, { childList: true });
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
  };
  const state: PanelViewState = { kind: "no-job" };

  const mount = () => panel.update(state, actions, null);
  mount();
  // The popup reads the same bridge; a listing page has no current single job.
  void sendMessage({ type: MessageType.CURRENT_JOB_UPDATED, payload: null }).catch(() => {});

  const hostWatcher = new MutationObserver(mount);
  hostWatcher.observe(document.body, { childList: true });
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

  let currentJob: UniversalJob | null = null;
  let currentGlobalJobId: string | null = null;
  let lastSyncResult: GlobalJobSyncResult | null = null;
  let lastSyncedKey: string | null = null;
  let lastSyncedAt = 0;
  let pending: PendingAction = null;

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
  };

  const run = debounceWithMaxWait(
    () => void runPipeline(),
    JOB_CHANGE_DEBOUNCE_MS,
    JOB_CHANGE_MAX_WAIT_MS,
  );

  run();
  watchForNavigation(run);

  async function runPipeline(): Promise<void> {
    // Website → Parser (extraction only) → Normalizer. Validation, dedup
    // resolution and persistence happen in the background handler.
    const raw = activeParser.tryParse({ document, url: location.href });

    if (!raw) {
      // No single job on this page right now (a listing/search/company page, or
      // a closed job modal). Keep the panel mounted showing "no job detected"
      // rather than tearing it down — the extension must never disappear on a
      // supported site; it re-populates when a job becomes active.
      currentJob = null;
      currentGlobalJobId = null;
      panel.update({ kind: "no-job" }, actions, null);
      publishCurrentJob(null);
      return;
    }

    const job = JobNormalizer.normalize(raw);
    currentJob = job;

    let authResponse: ExtensionResponse<AuthState>;
    try {
      authResponse = await sendMessageWithRetry<AuthState>({ type: MessageType.GET_AUTH_STATE });
    } catch {
      // Service worker never came up within the retry window — nothing
      // more to do this run; the next SPA navigation or mutation will
      // trigger another attempt.
      return;
    }

    if (!authResponse.ok || !authResponse.data.authenticated) {
      panel.update({ kind: "not-logged-in" }, actions, null);
      publishCurrentJob(null);
      return;
    }

    panel.update({ kind: "loading" }, actions, null);

    const dedupKey = DuplicateResolver.dedupKey(job);
    const now = Date.now();
    const canReuseLastSync =
      dedupKey === lastSyncedKey &&
      lastSyncResult !== null &&
      now - lastSyncedAt < MIN_RESYNC_INTERVAL_MS;

    if (canReuseLastSync) {
      renderFromSync(job, lastSyncResult!);
      return;
    }

    let syncResponse: ExtensionResponse<GlobalJobSyncResult>;
    try {
      syncResponse = await sendMessageWithRetry<GlobalJobSyncResult>({
        type: MessageType.SYNC_GLOBAL_JOB,
        payload: job,
      });
    } catch {
      return;
    }

    if (!syncResponse.ok) {
      // Invalid job (missing required fields, etc.) — nothing to save, but keep
      // the panel visible in its "no job detected" state rather than removing it.
      panel.update({ kind: "no-job" }, actions, null);
      publishCurrentJob(null);
      return;
    }

    lastSyncedKey = dedupKey;
    lastSyncedAt = now;
    lastSyncResult = syncResponse.data;
    currentGlobalJobId = syncResponse.data.globalJobId;
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
    };
    const kind: "ready" | "saved" | "tracked" = result.application
      ? "tracked"
      : result.isSaved
        ? "saved"
        : "ready";
    const state: PanelViewState = { kind, job: panelJob };

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
  const observer = new MutationObserver(() => onChange());
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });

  const originalPushState = history.pushState.bind(history);
  history.pushState = (...args: Parameters<History["pushState"]>) => {
    originalPushState(...args);
    onChange();
  };

  const originalReplaceState = history.replaceState.bind(history);
  history.replaceState = (...args: Parameters<History["replaceState"]>) => {
    originalReplaceState(...args);
    onChange();
  };

  window.addEventListener("popstate", onChange);
}
