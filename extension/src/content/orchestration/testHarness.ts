import { vi } from "vitest";
import type { UniversalJob } from "../../core/parsers/types";
import { JobValidator } from "../../core/validation/JobValidator";
import type {
  AuthState,
  ExtensionMessage,
  ExtensionResponse,
  GlobalJobSyncResult,
} from "../../shared/messaging/types";

/**
 * Shared test-only harness for the content-script orchestration tests in this
 * directory (`linkedin.test.ts`, `internshala.test.ts`, …). NOT a test file
 * itself — no `.test.ts` suffix — and never imported by production code
 * (`content/index.ts` is the only real manifest entry; this lives alongside
 * it purely for these specs).
 *
 * `content/index.ts` is a top-level, self-running script (Module 2D
 * orchestration lives inline, not behind an exported function/class), so
 * these tests exercise it the same way a real browser does: set up
 * `document`/`location`/`chrome` for the scenario, dynamically `import()` the
 * real module fresh (via `vi.resetModules()`), and assert on the
 * `chrome.runtime.sendMessage` calls it makes — the real message-bus contract
 * the background service worker (and, from there, `upsert_global_job`)
 * actually receives. No second/parallel ingestion path is introduced; this
 * only observes the one that exists.
 */

export type SyncGlobalJobCall = { type: "SYNC_GLOBAL_JOB"; payload: UniversalJob };

export type ChromeMock = {
  chrome: typeof chrome;
  sendMessage: ReturnType<typeof vi.fn>;
  /** Every SYNC_GLOBAL_JOB call observed so far, in order. */
  syncCalls: () => SyncGlobalJobCall[];
  /** Every distinct message type observed, in order (for API-spam assertions). */
  allCalls: () => ExtensionMessage[];
};

const DEFAULT_AUTH: AuthState = {
  authenticated: true,
  user: { id: "test-user-1", email: "user@test.com" },
};

const DEFAULT_SYNC_RESULT: GlobalJobSyncResult = {
  globalJobId: "global-job-stub",
  isClosed: false,
  isSaved: false,
  application: null,
  resumes: [],
  resumeMatch: null,
  credits: null,
};

/**
 * Installs a global `chrome` mock that resolves GET_AUTH_STATE / SYNC_GLOBAL_JOB
 * / CURRENT_JOB_UPDATED the way the real background service worker does for a
 * signed-in user — but without a real worker, real Supabase client, or real
 * network. `chrome.runtime.id` stays truthy (a live context) unless the test
 * explicitly flips it. `syncGlobalJobId` lets a test give each captured job a
 * distinct id (so `currentGlobalJobId` differs per job in a SPA-nav test).
 */
export function installChromeMock(
  options: { syncGlobalJobId?: (payload: UniversalJob, callIndex: number) => string } = {},
): ChromeMock {
  const calls: ExtensionMessage[] = [];
  let syncCallIndex = 0;

  const sendMessage = vi.fn(async (message: ExtensionMessage): Promise<ExtensionResponse> => {
    calls.push(message);
    switch (message.type) {
      case "GET_AUTH_STATE":
        return { ok: true, data: DEFAULT_AUTH };
      case "SYNC_GLOBAL_JOB": {
        // Real validation (the exact gate `background/handlers/jobs.ts#syncGlobalJob`
        // runs before ever calling `upsert_global_job`), so a still-hydrating
        // payload (e.g. LinkedIn's url-names-a-job-before-title-hydrates case)
        // is rejected here exactly as the real backend would reject it —
        // instead of every test needing a live Supabase RPC to prove that.
        const validation = JobValidator.validate(message.payload);
        if (!validation.valid) {
          return { ok: false, error: validation.reason };
        }
        const id =
          options.syncGlobalJobId?.(message.payload, syncCallIndex) ??
          `${DEFAULT_SYNC_RESULT.globalJobId}-${syncCallIndex}`;
        syncCallIndex += 1;
        return { ok: true, data: { ...DEFAULT_SYNC_RESULT, globalJobId: id } };
      }
      case "CURRENT_JOB_UPDATED":
        return { ok: true, data: { acknowledged: true } };
      default:
        return { ok: true, data: null };
    }
  });

  const mock = {
    runtime: {
      id: "test-extension-id",
      sendMessage,
      onMessage: { addListener: vi.fn(), removeListener: vi.fn() },
      getManifest: vi.fn(() => ({ content_scripts: [] })),
    },
    storage: {
      local: {
        get: vi.fn(async () => ({})),
        set: vi.fn(async () => undefined),
      },
    },
  } as unknown as typeof chrome;

  vi.stubGlobal("chrome", mock);

  return {
    chrome: mock,
    sendMessage,
    syncCalls: () =>
      calls.filter(
        (m): m is SyncGlobalJobCall => m.type === "SYNC_GLOBAL_JOB",
      ) as unknown as SyncGlobalJobCall[],
    allCalls: () => calls,
  };
}

/**
 * Flushes the pipeline's chained `await`s after advancing fake timers by
 * `ms`. `advanceTimersByTimeAsync` drains microtasks between fired timers,
 * but a handful of extra microtask turns are added on top for safety — the
 * pipeline chains several `await`s (auth → sync → render) that don't
 * themselves go through another timer.
 */
export async function flushPipeline(ms = 0): Promise<void> {
  if (ms > 0) {
    await vi.advanceTimersByTimeAsync(ms);
  }
  for (let i = 0; i < 8; i++) {
    await Promise.resolve();
  }
}

/**
 * Simulates the extension being reloaded/updated while this tab stays open
 * (see content/index.ts's dead-context self-termination): flips
 * `chrome.runtime.id` to undefined, lets the 1s watchdog interval observe it
 * and tear the instance down (disconnecting observers/timers, and — crucially
 * — resetting `window.__nextofferContentScriptActive` so the NEXT test's
 * fresh `import()` isn't blocked by this test's now-dead instance), then
 * restores a live id for the next test.
 */
export async function disposeContentScript(mock: ChromeMock): Promise<void> {
  (mock.chrome.runtime as { id?: string }).id = undefined;
  await flushPipeline(1100);
  (mock.chrome.runtime as { id?: string }).id = "test-extension-id";
}
