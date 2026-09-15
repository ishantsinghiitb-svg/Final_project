// @vitest-environment jsdom
// @vitest-environment-options {"url": "https://www.foundit.in/job/backend-engineer-acme-india-59142082"}
//
// ── Automatic detection/orchestration: Foundit ──
//
// Same contract as linkedin.test.ts / internshala.test.ts: a user who opens a
// supported Foundit job page and does nothing still gets it parsed and sent
// to the existing SYNC_GLOBAL_JOB message automatically.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { JOB_CHANGE_DEBOUNCE_MS } from "../../shared/constants";
import {
  disposeContentScript,
  flushPipeline,
  installChromeMock,
  type ChromeMock,
} from "./testHarness";

// This file's own jsdom environment plus fake-timer flushes are cheap in
// isolation but can exceed the 5s default under a full, highly parallel
// `vitest run` of the whole repo's 2000+ tests — bump the wall-clock budget
// rather than the logical (fake-timer) one.
vi.setConfig({ testTimeout: 20_000 });

const DETAIL_URL = "https://www.foundit.in/job/backend-engineer-acme-india-59142082";

function buildFounditFixture(): void {
  document.body.innerHTML = `
    <div id="jdPageHeader">
      <h1>Backend Engineer</h1>
      <a href="/search/acme-india-jobs">Acme India</a>
      <a href="/search/jobs-in-bengaluru">Bengaluru</a>
    </div>
    <div id="jobDescription">
      <div class="break-words">
        <p>We are hiring a backend engineer to build our payments platform.</p>
      </div>
    </div>
  `;
  const script = document.createElement("script");
  script.type = "application/ld+json";
  script.textContent = JSON.stringify({
    "@type": "JobPosting",
    title: "Backend Engineer",
    hiringOrganization: { "@type": "Organization", name: "Acme India" },
    jobLocation: {
      "@type": "Place",
      address: {
        "@type": "PostalAddress",
        addressLocality: "Bengaluru",
        addressRegion: "Karnataka",
        addressCountry: "India",
      },
    },
    datePosted: "12-09-2026",
  });
  document.body.appendChild(script);
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

describe("Foundit: initial load", () => {
  it("parses and syncs automatically with no Save/Apply/popup click", async () => {
    buildFounditFixture();

    await import("../index");
    await flushPipeline(JOB_CHANGE_DEBOUNCE_MS);

    const syncs = mock.syncCalls();
    expect(syncs).toHaveLength(1);
    expect(syncs[0].payload.source).toBe("foundit");
    expect(syncs[0].payload.title).toBe("Backend Engineer");
    expect(syncs[0].payload.companyName).toBe("Acme India");
    expect(syncs[0].payload.sourceJobId).toBe("59142082");
  });
});
