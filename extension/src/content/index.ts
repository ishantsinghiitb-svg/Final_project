import { ParserFactory } from "../core/parsers/ParserFactory";
import type { NormalizedJob } from "../core/parsers/types";
import {
  JOB_CHANGE_DEBOUNCE_MS,
  JOB_CHANGE_MAX_WAIT_MS,
  MIN_RESYNC_INTERVAL_MS,
} from "../shared/constants";
import { env } from "../shared/env";
import { sendMessage } from "../shared/messaging/bus";
import { MessageType } from "../shared/messaging/types";
import type { AuthState, GlobalJobSyncResult } from "../shared/messaging/types";
import { debounceWithMaxWait } from "./util/debounce";
import { PanelController } from "./inject-panel";
import type { PanelActions, PanelJob, PanelViewState } from "../panel/FloatingPanel";

/**
 * Orchestration only, per the Module 2D spec: detect the site, ask the
 * ParserFactory for a parser, hand its output to validation/sync, inject the
 * panel. No site-specific DOM selectors live in this file.
 */
const parser = ParserFactory.getParser(location.hostname);

if (parser) {
  const panel = new PanelController();

  let currentJob: NormalizedJob | null = null;
  let currentGlobalJobId: string | null = null;
  let lastSyncResult: GlobalJobSyncResult | null = null;
  let lastSyncedKey: string | null = null;
  let lastSyncedAt = 0;

  const actions: PanelActions = {
    onSave: () => void handleSave(),
    onTrack: () => void handleTrack(),
    onViewSaved: () => {
      if (currentGlobalJobId)
        window.open(`${env.appUrl}/dashboard/jobs/${currentGlobalJobId}`, "_blank");
    },
    onViewApplication: () => {
      const applicationId = lastSyncResult?.application?.id;
      if (applicationId)
        window.open(`${env.appUrl}/dashboard/applications/${applicationId}`, "_blank");
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
    const job = parser!.tryParse({ document, url: location.href });

    if (!job) {
      currentJob = null;
      currentGlobalJobId = null;
      panel.destroy();
      return;
    }

    currentJob = job;

    const authResponse = await sendMessage<AuthState>({ type: MessageType.GET_AUTH_STATE });
    if (!authResponse.ok || !authResponse.data.authenticated) {
      panel.update({ kind: "not-logged-in" }, actions);
      return;
    }

    panel.update({ kind: "loading" }, actions);

    const dedupKey = job.sourceJobId ?? `${job.title}|${job.companyName}|${job.location ?? ""}`;
    const now = Date.now();
    const canReuseLastSync =
      dedupKey === lastSyncedKey &&
      lastSyncResult !== null &&
      now - lastSyncedAt < MIN_RESYNC_INTERVAL_MS;

    if (canReuseLastSync) {
      renderFromSync(job, lastSyncResult!);
      return;
    }

    const syncResponse = await sendMessage<GlobalJobSyncResult>({
      type: MessageType.SYNC_GLOBAL_JOB,
      payload: job,
    });

    if (!syncResponse.ok) {
      // Invalid job (missing required fields, etc.) — nothing to show.
      panel.destroy();
      return;
    }

    lastSyncedKey = dedupKey;
    lastSyncedAt = now;
    lastSyncResult = syncResponse.data;
    currentGlobalJobId = syncResponse.data.globalJobId;
    renderFromSync(job, syncResponse.data);
  }

  function renderFromSync(job: NormalizedJob, result: GlobalJobSyncResult): void {
    const panelJob: PanelJob = {
      title: job.title,
      companyName: job.companyName,
      isClosed: result.isClosed,
    };
    const state: PanelViewState = result.application
      ? { kind: "tracking", job: panelJob }
      : result.isSaved
        ? { kind: "saved", job: panelJob }
        : { kind: "ready", job: panelJob };

    panel.update(state, actions);
  }

  async function handleSave(): Promise<void> {
    if (!currentGlobalJobId || !currentJob) return;
    panel.update({ kind: "loading" }, actions);

    const response = await sendMessage({
      type: MessageType.SAVE_JOB,
      payload: { globalJobId: currentGlobalJobId },
    });
    if (!response.ok || !lastSyncResult) return;

    lastSyncResult = { ...lastSyncResult, isSaved: true };
    renderFromSync(currentJob, lastSyncResult);
  }

  async function handleTrack(): Promise<void> {
    if (!currentGlobalJobId || !currentJob) return;
    panel.update({ kind: "loading" }, actions);

    const response = await sendMessage<{ application: { id: string; status: string } }>({
      type: MessageType.TRACK_APPLICATION,
      payload: { globalJobId: currentGlobalJobId },
    });
    if (!response.ok || !lastSyncResult) return;

    lastSyncResult = { ...lastSyncResult, application: response.data.application };
    renderFromSync(currentJob, lastSyncResult);
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
