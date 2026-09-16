// @vitest-environment jsdom
// @vitest-environment-options {"url": "https://www.linkedin.com/jobs/view/1000000001/"}
//
// ── Automatic detection/orchestration: LinkedIn ──
//
// Exercises the REAL, unmodified `content/index.ts` orchestrator (the one
// file the manifest actually injects) end to end for the exact product
// requirement: a user who opens a supported job page and does nothing still
// gets it parsed, normalized and sent to the existing SYNC_GLOBAL_JOB message
// — no Save/Apply/popup click anywhere in this file. Only the message
// transport (`chrome.runtime.sendMessage`) is faked; see `testHarness.ts` for
// why that boundary (not a second ingestion path) is the right place to stub.
//
// LinkedIn is the SPA case: job-to-job navigation never reloads the page
// (`history.pushState`), so this file is also where SPA-navigation and
// repeated-event dedup get covered.

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

// Mirrors the private constants in content/index.ts (not exported — this is a
// script, not a library). Kept here, commented, rather than imported, the
// same way userParsedEndToEnd.test.ts mirrors production SQL: if these ever
// drift from content/index.ts, the "bounded" assertions below start failing
// loudly instead of silently passing on the wrong budget.
const HYDRATION_RETRY_MS = 700;
const MAX_HYDRATION_ATTEMPTS = 4;
/** Generous upper bound for "the pipeline has definitely settled by now". */
const SETTLE_MS = JOB_CHANGE_DEBOUNCE_MS + HYDRATION_RETRY_MS * MAX_HYDRATION_ATTEMPTS + 500;

const JOB_A_URL = "https://www.linkedin.com/jobs/view/1000000001/";
const JOB_B_URL = "https://www.linkedin.com/jobs/view/1000000002/";
const JOB_C_URL = "https://www.linkedin.com/jobs/view/1000000003/";
const NO_JOB_URL = "https://www.linkedin.com/feed/";
const MESSAGING_URL = "https://www.linkedin.com/messaging/thread/abc123/";

/**
 * Reproduces the real production false positive (2 real global_jobs rows,
 * both `source_url: "https://www.linkedin.com/feed/"`): a shared job posting
 * rendered as a preview card INSIDE a feed post. It genuinely contains a
 * `/jobs/view/<id>` link and an "About the job"-style heading — the exact DOM
 * signals `LinkedInParser.tryParse` uses (deliberately, with no URL gating of
 * its own) to find the job-details pane wherever it lives on the page. This
 * is what the orchestrator-level `isLinkedInJobSurfaceUrl` guard exists to
 * block, since no DOM signal alone can distinguish this from a real job page.
 */
function buildFeedWithEmbeddedJobCard(): void {
  document.body.innerHTML = `
    <div id="feed">
      <div class="feed-shared-update-v2">
        <div class="job-card-preview">
          <a href="/company/leonis-capital">Leonis Capital</a>
          <a href="/jobs/view/4456164434/">Associate</a>
          <span>San Francisco, CA (On-site)</span>
          <button>View job</button>
        </div>
        <h3>About the job</h3>
        <p>133,513 reactions</p>
      </div>
    </div>
  `;
}

function buildLinkedInFixture(opts: { id: string; title: string; company: string }): void {
  document.body.innerHTML = `
    <div id="wrapper">
      <div class="job-details-jobs-unified-top-card__container--two-pane">
        <h1 class="job-details-jobs-unified-top-card__job-title">
          <a href="/jobs/view/${opts.id}/">${opts.title}</a>
        </h1>
        <div class="job-details-jobs-unified-top-card__company-name">
          <a href="/company/acme-corp/">${opts.company}</a>
        </div>
        <div class="job-details-jobs-unified-top-card__primary-description-container">
          <span>2 hours ago</span>
        </div>
      </div>
      <div class="description-section">
        <div class="heading-wrapper"><h2>About the job</h2></div>
        <div class="jobs-description__content">
          <p>We are looking for a ${opts.title} to join our growing platform team.</p>
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
  history.pushState({}, "", JOB_A_URL);
  mock = installChromeMock();
});

afterEach(async () => {
  await disposeContentScript(mock);
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("LinkedIn: initial load", () => {
  it("parses and syncs automatically with no Save/Apply/popup click", async () => {
    buildLinkedInFixture({
      id: "1000000001",
      title: "Senior Backend Engineer",
      company: "Acme Corp",
    });

    await import("../index");
    await flushPipeline(JOB_CHANGE_DEBOUNCE_MS);

    const syncs = mock.syncCalls();
    expect(syncs).toHaveLength(1);
    expect(syncs[0].payload.source).toBe("linkedin");
    expect(syncs[0].payload.title).toBe("Senior Backend Engineer");
    expect(syncs[0].payload.companyName).toBe("Acme Corp");
    expect(syncs[0].payload.sourceJobId).toBe("1000000001");
    expect(syncs[0].payload.sourceUrl).toBe(JOB_A_URL);

    // Never anything the user would have had to click.
    const types = mock.allCalls().map((m) => m.type);
    expect(types).not.toContain("SAVE_JOB");
    expect(types).not.toContain("APPLY_AND_TRACK");
    expect(types).not.toContain("TRACK_APPLICATION");
  });

  it("SYNC_GLOBAL_JOB is dispatched immediately after a successful parse — the first attempt is never debounced", async () => {
    // Job content is already fully present when the content script loads
    // (exactly like a LinkedIn page whose server-rendered top card is ready
    // at document_idle). Flushing by 0ms — real microtask draining only, NO
    // fake-timer advancement at all — is the point: if the sync call is only
    // visible after also advancing time, the first attempt is still gated
    // behind an artificial delay.
    buildLinkedInFixture({
      id: "1000000001",
      title: "Senior Backend Engineer",
      company: "Acme Corp",
    });

    await import("../index");
    await flushPipeline(0);

    const syncs = mock.syncCalls();
    expect(syncs).toHaveLength(1);
    expect(syncs[0].payload.title).toBe("Senior Backend Engineer");
  });
});

describe("LinkedIn: SPA navigation (no full page reload)", () => {
  it("job A -> job B -> job C are each detected and synced exactly once", async () => {
    buildLinkedInFixture({
      id: "1000000001",
      title: "Senior Backend Engineer",
      company: "Acme Corp",
    });
    await import("../index");
    await flushPipeline(JOB_CHANGE_DEBOUNCE_MS);
    expect(mock.syncCalls()).toHaveLength(1);
    expect(mock.syncCalls()[0].payload.sourceJobId).toBe("1000000001");

    // Job B: LinkedIn swaps the details pane via history.pushState — no reload.
    buildLinkedInFixture({
      id: "1000000002",
      title: "Staff Frontend Engineer",
      company: "Globex Inc",
    });
    history.pushState({}, "", JOB_B_URL);
    await flushPipeline();
    await flushPipeline(JOB_CHANGE_DEBOUNCE_MS);
    expect(mock.syncCalls()).toHaveLength(2);
    expect(mock.syncCalls()[1].payload.sourceJobId).toBe("1000000002");
    expect(mock.syncCalls()[1].payload.title).toBe("Staff Frontend Engineer");

    // Job C.
    buildLinkedInFixture({
      id: "1000000003",
      title: "Principal Data Engineer",
      company: "Initech",
    });
    history.pushState({}, "", JOB_C_URL);
    await flushPipeline();
    await flushPipeline(JOB_CHANGE_DEBOUNCE_MS);
    expect(mock.syncCalls()).toHaveLength(3);
    expect(mock.syncCalls()[2].payload.sourceJobId).toBe("1000000003");
    expect(mock.syncCalls()[2].payload.title).toBe("Principal Data Engineer");

    // None of the three payloads bled into another (stale-data check).
    const titles = mock.syncCalls().map((c) => c.payload.title);
    expect(new Set(titles).size).toBe(3);
  });
});

describe("LinkedIn: repeated events dedupe to one sync", () => {
  it("repeated DOM mutations on the SAME job cause exactly one sync", async () => {
    buildLinkedInFixture({
      id: "1000000001",
      title: "Senior Backend Engineer",
      company: "Acme Corp",
    });
    await import("../index");
    await flushPipeline(JOB_CHANGE_DEBOUNCE_MS);
    expect(mock.syncCalls()).toHaveLength(1);

    // LinkedIn re-renders its shell constantly for reasons unrelated to the
    // job (feed polling, presence indicators, …) — none of that should
    // re-sync the job that's already on screen.
    for (let i = 0; i < 3; i++) {
      const decoy = document.createElement("span");
      decoy.textContent = `unrelated churn ${i}`;
      document.body.appendChild(decoy);
      await flushPipeline();
      await flushPipeline(JOB_CHANGE_DEBOUNCE_MS);
      decoy.remove();
      await flushPipeline();
      await flushPipeline(JOB_CHANGE_DEBOUNCE_MS);
    }

    expect(mock.syncCalls()).toHaveLength(1);
  });

  it("a same-URL history event fired together with a no-op DOM mutation still causes exactly one sync", async () => {
    buildLinkedInFixture({
      id: "1000000001",
      title: "Senior Backend Engineer",
      company: "Acme Corp",
    });
    await import("../index");
    await flushPipeline(JOB_CHANGE_DEBOUNCE_MS);
    expect(mock.syncCalls()).toHaveLength(1);

    // A URL event (replaceState to the SAME href) and a DOM event (a no-op
    // mutation) firing back-to-back must debounce/dedupe to at most the one
    // run already synced — never a second SYNC_GLOBAL_JOB for the same job.
    history.replaceState({}, "", location.href);
    const decoy = document.createElement("span");
    document.body.appendChild(decoy);
    await flushPipeline();
    await flushPipeline(JOB_CHANGE_DEBOUNCE_MS);

    expect(mock.syncCalls()).toHaveLength(1);
  });
});

describe("LinkedIn: unsupported/no-job page", () => {
  it("bounded retries then stops, with no SYNC_GLOBAL_JOB call and no API spam", async () => {
    history.pushState({}, "", NO_JOB_URL);
    document.body.innerHTML = "<div id='wrapper'></div>"; // feed shell, no job anywhere

    await import("../index");
    // Advance well past the full bounded hydration-retry window.
    await flushPipeline(SETTLE_MS);

    expect(mock.syncCalls()).toHaveLength(0);

    // Nothing keeps polling forever: advancing further doesn't add more calls.
    const callCountAtSettle = mock.allCalls().length;
    await flushPipeline(SETTLE_MS);
    expect(mock.allCalls().length).toBe(callCountAtSettle);
  });
});

describe("LinkedIn: non-job pages never trigger a sync (feed false-positive guard)", () => {
  it("a feed page containing an embedded job-preview card produces ZERO SYNC_GLOBAL_JOB calls", async () => {
    // This exact DOM shape (a /jobs/view/<id> link + an "About the job"
    // heading, both inside a feed card) is what produced two real garbage
    // rows in production before the isLinkedInJobSurfaceUrl guard existed.
    history.pushState({}, "", NO_JOB_URL);
    buildFeedWithEmbeddedJobCard();

    await import("../index");
    await flushPipeline(SETTLE_MS);

    expect(mock.syncCalls()).toHaveLength(0);
  });

  it("a plain non-job page (messaging) produces ZERO SYNC_GLOBAL_JOB calls", async () => {
    history.pushState({}, "", MESSAGING_URL);
    document.body.innerHTML = "<div id='messaging-shell'></div>";

    await import("../index");
    await flushPipeline(SETTLE_MS);

    expect(mock.syncCalls()).toHaveLength(0);
  });

  it("navigating from the feed (with an embedded job card) to a real job page still captures the real job exactly once", async () => {
    // The guard must not break the legitimate path: feed -> a real job page
    // (no refresh) has to start capturing the instant the URL becomes a real
    // job surface, exactly like any other SPA navigation.
    history.pushState({}, "", NO_JOB_URL);
    buildFeedWithEmbeddedJobCard();
    await import("../index");
    await flushPipeline(JOB_CHANGE_DEBOUNCE_MS);
    expect(mock.syncCalls()).toHaveLength(0);

    buildLinkedInFixture({
      id: "1000000001",
      title: "Senior Backend Engineer",
      company: "Acme Corp",
    });
    history.pushState({}, "", JOB_A_URL);
    await flushPipeline();
    await flushPipeline(JOB_CHANGE_DEBOUNCE_MS);

    const syncs = mock.syncCalls();
    expect(syncs).toHaveLength(1);
    expect(syncs[0].payload.title).toBe("Senior Backend Engineer");
    expect(syncs[0].payload.sourceJobId).toBe("1000000001");
  });
});
