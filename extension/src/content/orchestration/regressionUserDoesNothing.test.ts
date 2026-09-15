// @vitest-environment jsdom
// @vitest-environment-options {"url": "https://www.linkedin.com/jobs/view/9990000001/"}
//
// ── THE regression test for this task ──
//
// The core product requirement, verbatim: "User opens a supported job page
// and does nothing." Everything else in this directory covers a mechanism
// (SPA nav, dedup, readiness, timeout); this file asserts the end-to-end
// product behavior those mechanisms exist to serve, on the platform named
// first in the requirement.
//
// This test performs NO Save click, NO Apply click, NO extension-button
// click, NO popup open, and NO manual URL trigger — the only actions it takes
// are: put a job on the page, import the real content script, and let fake
// time pass. If this test ever needs a `sendMessage({type: "SAVE_JOB", ...})`
// (or APPLY_AND_TRACK, or TRACK_APPLICATION, or any popup-only message) to
// pass, the requirement has been violated.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { JOB_CHANGE_DEBOUNCE_MS } from "../../shared/constants";
import type { MessageType } from "../../shared/messaging/types";
import {
  disposeContentScript,
  flushPipeline,
  installChromeMock,
  type ChromeMock,
} from "./testHarness";

// See foundit.test.ts (in this same directory) for why this is bumped (full-
// suite parallelism, not a logical/fake-timer budget change).
vi.setConfig({ testTimeout: 20_000 });

const JOB_URL = "https://www.linkedin.com/jobs/view/9990000001/";

/** A realistic, fully-hydrated job — the state a real job page settles into. */
function buildRealJobPage(): void {
  document.body.innerHTML = `
    <div id="wrapper">
      <div class="job-details-jobs-unified-top-card__container--two-pane">
        <h1 class="job-details-jobs-unified-top-card__job-title">
          <a href="/jobs/view/9990000001/">Full Stack Engineer</a>
        </h1>
        <div class="job-details-jobs-unified-top-card__company-name">
          <a href="/company/acme-corp/">Acme Corp</a>
        </div>
        <div class="job-details-jobs-unified-top-card__primary-description-container">
          <span>3 hours ago</span>
        </div>
      </div>
      <div class="description-section">
        <div class="heading-wrapper"><h2>About the job</h2></div>
        <div class="jobs-description__content">
          <p>Build features across our web and API layers.</p>
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
});

describe("Regression: user opens a supported job page and does nothing", () => {
  it("automatically parses, normalizes, and ingests the job within the readiness window — with zero user action", async () => {
    // ── Arrange: the job content is already on the page, as it is the moment
    // a real job-details pane finishes rendering. ──
    buildRealJobPage();

    // ── Act: the ONLY thing this test does is load the real content script
    // and let time pass. No function representing Save/Apply/a popup/a
    // manual import is ever called. ──
    await import("../index");
    await flushPipeline(JOB_CHANGE_DEBOUNCE_MS);

    // ── Assert: within the simulated readiness window... ──

    // 1. The parser ran and produced a normalized job automatically.
    const syncs = mock.syncCalls();
    expect(syncs).toHaveLength(1);
    const job = syncs[0].payload;

    // 2. The ingestion API (the existing SYNC_GLOBAL_JOB message — the same
    //    one the background worker forwards to `upsert_global_job`) was
    //    called automatically.
    expect(job.title).toBe("Full Stack Engineer");
    expect(job.companyName).toBe("Acme Corp");
    expect(job.sourceUrl).toBe(JOB_URL);

    // 3. The correct platform/source is included.
    expect(job.source).toBe("linkedin");
    expect(job.sourceJobId).toBe("9990000001");

    // 4. No Save click, no Apply click, no popup action — verify by absence:
    //    the ONLY message types that were ever sent are the automatic ones.
    const observedTypes = new Set(mock.allCalls().map((m) => m.type));
    const userActionTypes: MessageType[] = [
      "SAVE_JOB",
      "APPLY_AND_TRACK",
      "TRACK_APPLICATION",
      "IMPORT_JOB_URL",
    ];
    for (const forbidden of userActionTypes) {
      expect(observedTypes.has(forbidden)).toBe(false);
    }
    expect(observedTypes.has("SYNC_GLOBAL_JOB")).toBe(true);

    // 5. It happened within the "1-3 seconds after content is available"
    //    budget: only the initial debounce window elapsed above, not an
    //    arbitrary long fixed wait.
    expect(JOB_CHANGE_DEBOUNCE_MS).toBeLessThanOrEqual(3000);
  });
});
