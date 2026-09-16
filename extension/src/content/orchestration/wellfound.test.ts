// @vitest-environment jsdom
// @vitest-environment-options {"url": "https://wellfound.com/jobs?job_listing_slug=1234567-backend-engineer"}
//
// ── Automatic detection/orchestration: Wellfound ──
//
// Wellfound's job opens as a slide-in MODAL over the search page at the same
// `/jobs` path (see WellfoundJobParser's doc comment — deliberately no
// listing parser is registered for this site so it never shadows this modal
// flow). Opening it (the modal appearing, `job_listing_slug` in the URL)
// still parses and syncs automatically, no click required.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  disposeContentScript,
  flushPipeline,
  installChromeMock,
  type ChromeMock,
} from "./testHarness";

// See foundit.test.ts for why this is bumped (full-suite parallelism, not a
// logical/fake-timer budget change).
vi.setConfig({ testTimeout: 20_000 });

const DETAIL_URL = "https://wellfound.com/jobs?job_listing_slug=1234567-backend-engineer";

function buildWellfoundFixture(): void {
  document.body.innerHTML = `
    <div data-test="JobListingSlideIn">
      <h1>Backend Engineer</h1>
      <a href="/company/acme-india">Acme India</a>
      <div id="job-description">
        <p>Build and scale our core backend systems.</p>
      </div>
    </div>
  `;
}

let mock: ChromeMock;

beforeEach(() => {
  vi.useFakeTimers();
  document.head.innerHTML = "";
  document.body.innerHTML = "";
  history.pushState({}, "", DETAIL_URL);
  mock = installChromeMock();
});

afterEach(async () => {
  await disposeContentScript(mock);
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("Wellfound: initial load", () => {
  it("parses and syncs automatically with no Save/Apply/popup click, immediately (no artificial delay before the first attempt)", async () => {
    buildWellfoundFixture();

    await import("../index");
    // 0ms — real microtask draining only, no fake-timer advancement.
    await flushPipeline(0);

    const syncs = mock.syncCalls();
    expect(syncs).toHaveLength(1);
    expect(syncs[0].payload.source).toBe("wellfound");
    expect(syncs[0].payload.title).toBe("Backend Engineer");
    expect(syncs[0].payload.companyName).toBe("Acme India");
    expect(syncs[0].payload.sourceJobId).toBe("1234567");
  });
});
