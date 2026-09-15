// @vitest-environment jsdom
// @vitest-environment-options {"url": "https://internshala.com/internship/detail/marketing-intern-in-bengaluru-at-acme1234/99887766"}
//
// ── Automatic detection/orchestration: Internshala ──
//
// Internshala's detail parser returns a clean `null` while the DOM hasn't
// hydrated yet (no URL-id shortcut the way LinkedIn's does — see
// InternshalaJobParser#tryParse), which makes it the clearest platform to
// exercise the bounded hydration-retry mechanism in isolation: content missing
// -> retries -> content appears -> parses -> syncs, all with no click.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { JOB_CHANGE_DEBOUNCE_MS } from "../../shared/constants";
import {
  disposeContentScript,
  flushPipeline,
  installChromeMock,
  type ChromeMock,
} from "./testHarness";

// See foundit.test.ts for why this is bumped (full-suite parallelism, not a
// logical/fake-timer budget change).
vi.setConfig({ testTimeout: 20_000 });

// Mirrors content/index.ts's private retry constants (see linkedin.test.ts).
const HYDRATION_RETRY_MS = 700;

const DETAIL_URL =
  "https://internshala.com/internship/detail/marketing-intern-in-bengaluru-at-acme1234/99887766";

function buildInternshalaFixture(): void {
  document.body.innerHTML = `
    <div id="details_container">
      <div class="detail_view">
        <div class="individual_internship" internshipid="99887766">
          <h1 class="heading_title">Marketing Intern</h1>
          <div class="company_name"><a href="/company/acme-startup">Acme Startup</a></div>
          <div id="location_names">Bengaluru</div>
        </div>
      </div>
      <div class="internship_details">
        <div class="about_heading">About the internship</div>
        <div class="text-container">
          <p>Join our marketing team to run campaigns across digital channels.</p>
        </div>
      </div>
    </div>
    <div class="tags_container_outer"><span class="status-success">Posted 2 days ago</span></div>
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

describe("Internshala: initial load", () => {
  it("parses and syncs automatically with no Save/Apply/popup click", async () => {
    buildInternshalaFixture();

    await import("../index");
    await flushPipeline(JOB_CHANGE_DEBOUNCE_MS);

    const syncs = mock.syncCalls();
    expect(syncs).toHaveLength(1);
    expect(syncs[0].payload.source).toBe("internshala");
    expect(syncs[0].payload.title).toBe("Marketing Intern");
    expect(syncs[0].payload.companyName).toBe("Acme Startup");
    expect(syncs[0].payload.sourceJobId).toBe("99887766");
  });
});

describe("Internshala: readiness (DOM hydrates after initial load)", () => {
  it("retries on a bounded schedule and parses as soon as content appears, well inside a few seconds", async () => {
    // Nothing on the page yet — the SPA shell before its own data has loaded.
    document.body.innerHTML = "<div id='details_container'></div>";

    await import("../index");
    // First attempt (debounced) finds nothing; two bounded retries follow.
    await flushPipeline(JOB_CHANGE_DEBOUNCE_MS);
    await flushPipeline(HYDRATION_RETRY_MS);
    expect(mock.syncCalls()).toHaveLength(0); // not ready yet — must not have synced garbage

    // The real content arrives mid-grace-window.
    buildInternshalaFixture();
    await flushPipeline(HYDRATION_RETRY_MS);

    const syncs = mock.syncCalls();
    expect(syncs).toHaveLength(1);
    expect(syncs[0].payload.title).toBe("Marketing Intern");
    expect(syncs[0].payload.companyName).toBe("Acme Startup");
  });
});
