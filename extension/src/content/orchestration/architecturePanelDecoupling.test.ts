// @vitest-environment jsdom
// @vitest-environment-options {"url": "https://www.linkedin.com/jobs/view/1000000001/"}
//
// ── THE architecture test for this task ──
//
// "Panel/UI loading is NOT a prerequisite for automatic job synchronization."
//
// The automatic capture pipeline (detect -> parse -> validate ->
// SYNC_GLOBAL_JOB -> dedupe, in content/index.ts#runPipeline) and the
// floating-panel UI pipeline (show loading -> show parsed job -> show
// errors) are two different concerns sharing one function. This file proves
// they are decoupled in the direction that matters: a UI failure can never
// prevent a sync. It does NOT touch LinkedInParser, the LinkedIn URL guard,
// the crawler, or any backend/eligibility code — only `PanelController` (the
// UI half) is replaced with a stand-in.
//
// `content/index.ts` imports `PanelController` from "./inject-panel"; this
// file mocks the SAME resolved module (one directory up from here) so the
// real orchestrator under test gets the broken/no-op panel instead of the
// real React one.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { JOB_CHANGE_DEBOUNCE_MS } from "../../shared/constants";
import {
  disposeContentScript,
  flushPipeline,
  installChromeMock,
  type ChromeMock,
} from "./testHarness";

vi.setConfig({ testTimeout: 20_000 });

const JOB_URL = "https://www.linkedin.com/jobs/view/1000000001/";

function buildJobFixture(): void {
  document.body.innerHTML = `
    <div id="wrapper">
      <div class="job-details-jobs-unified-top-card__container--two-pane">
        <h1 class="job-details-jobs-unified-top-card__job-title">
          <a href="/jobs/view/1000000001/">Senior Backend Engineer</a>
        </h1>
        <div class="job-details-jobs-unified-top-card__company-name">
          <a href="/company/acme-corp/">Acme Corp</a>
        </div>
        <div class="job-details-jobs-unified-top-card__primary-description-container">
          <span>2 hours ago</span>
        </div>
      </div>
      <div class="description-section">
        <div class="heading-wrapper"><h2>About the job</h2></div>
        <div class="jobs-description__content">
          <p>We are looking for a backend engineer to join our platform team.</p>
        </div>
      </div>
    </div>
  `;
}

let mock: ChromeMock;

beforeEach(() => {
  vi.useFakeTimers();
  document.head.innerHTML = "";
  document.body.innerHTML = "";
  history.pushState({}, "", JOB_URL);
  mock = installChromeMock();
});

afterEach(async () => {
  await disposeContentScript(mock);
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.resetModules();
  vi.doUnmock("../inject-panel");
});

describe("Architecture: panel/UI failure never blocks automatic capture", () => {
  it("a panel that THROWS on every render still lets the job reach SYNC_GLOBAL_JOB exactly once", async () => {
    vi.doMock("../inject-panel", () => ({
      PanelController: class {
        update(): void {
          throw new Error("simulated floating-panel render failure");
        }
        destroy(): void {}
      },
    }));
    buildJobFixture();

    await import("../index");
    await flushPipeline(JOB_CHANGE_DEBOUNCE_MS);

    const syncs = mock.syncCalls();
    expect(syncs).toHaveLength(1);
    expect(syncs[0].payload.title).toBe("Senior Backend Engineer");
    expect(syncs[0].payload.companyName).toBe("Acme Corp");
  });

  it("a panel that never renders anything (silently unavailable/hung) still lets the job reach SYNC_GLOBAL_JOB", async () => {
    const recordedStates: unknown[] = [];
    vi.doMock("../inject-panel", () => ({
      PanelController: class {
        update(state: unknown): void {
          // Records what it was ASKED to show, but never actually renders —
          // simulating a panel that is stuck/unavailable, not merely slow.
          recordedStates.push(state);
        }
        destroy(): void {}
      },
    }));
    buildJobFixture();

    await import("../index");
    await flushPipeline(JOB_CHANGE_DEBOUNCE_MS);

    const syncs = mock.syncCalls();
    expect(syncs).toHaveLength(1);
    expect(syncs[0].payload.title).toBe("Senior Backend Engineer");
    // The capture pipeline reached the real ingestion API regardless of
    // whether the panel ever visibly changed. We don't assert anything about
    // WHAT the panel showed — only that its behavior had zero effect on sync.
    expect(recordedStates.length).toBeGreaterThan(0);
  });

  it("the job is synced while the panel is still reporting its LOADING state — sync does not wait for a later panel state", async () => {
    // A panel stand-in that latches its FIRST recorded state and never lets
    // later updates change what this test reads back — modeling "the panel
    // is stuck showing Loading" as literally as possible, without touching
    // the real FloatingPanel/PanelController.
    let firstState: { kind?: string } | null = null;
    vi.doMock("../inject-panel", () => ({
      PanelController: class {
        update(state: { kind?: string }): void {
          if (!firstState) firstState = state;
        }
        destroy(): void {}
      },
    }));
    buildJobFixture();

    await import("../index");
    await flushPipeline(JOB_CHANGE_DEBOUNCE_MS);

    // The very first panel state this run ever asked for was "loading" (the
    // pre-sync update in runPipeline) — proving sync was dispatched from the
    // SAME run that had only just shown loading, not gated on any later
    // panel transition.
    expect(firstState).toEqual({ kind: "loading" });
    expect(mock.syncCalls()).toHaveLength(1);
  });
});
