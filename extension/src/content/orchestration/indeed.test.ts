// @vitest-environment jsdom
// @vitest-environment-options {"url": "https://www.indeed.com/?vjk=5ac5bc5e22dbd27a"}
//
// ── Automatic detection/orchestration: Indeed ──
//
// Indeed's viewjob pane opens INLINE on the homepage/search SPA URL — a job
// is "the one the user opened" only when its key (`vjk`) is in the URL (see
// IndeedParser's own doc comment) — so this fixture puts the key in the URL,
// matching how the extension actually treats an inline-opened Indeed job as
// automatically detected, no click required.

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

const DETAIL_URL = "https://www.indeed.com/?vjk=5ac5bc5e22dbd27a";

function buildIndeedFixture(): void {
  document.body.innerHTML = `
    <div data-testid="vjJobDetails-test">
      <h2 data-testid="jobsearch-JobInfoHeader-title">Product Manager<span> - job post</span></h2>
      <div data-testid="jobsearch-CompanyInfoContainer">
        <div data-testid="inlineHeader-companyName">Acme India</div>
        <div data-testid="inlineHeader-companyLocation">Bengaluru, Karnataka</div>
      </div>
      <div id="jobDescriptionText">
        <p>Own the roadmap for our core platform team.</p>
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

describe("Indeed: initial load", () => {
  it("parses and syncs automatically with no Save/Apply/popup click, immediately (no artificial delay before the first attempt)", async () => {
    buildIndeedFixture();

    await import("../index");
    // 0ms — real microtask draining only, no fake-timer advancement.
    await flushPipeline(0);

    const syncs = mock.syncCalls();
    expect(syncs).toHaveLength(1);
    expect(syncs[0].payload.source).toBe("indeed");
    expect(syncs[0].payload.title).toBe("Product Manager");
    expect(syncs[0].payload.companyName).toBe("Acme India");
    expect(syncs[0].payload.sourceJobId).toBe("5ac5bc5e22dbd27a");
  });
});
