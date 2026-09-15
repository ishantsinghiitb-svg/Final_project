// @vitest-environment jsdom
// @vitest-environment-options {"url": "https://unstop.com/jobs/backend-engineer-at-acme-india-1714496"}
//
// ── Automatic detection/orchestration: Unstop ──
//
// Unstop's plural `/jobs/…` (and `/internships/…`) paths are DETAIL routes —
// the singular `/job`/`/internship` paths are LISTING routes handled by
// UnstopListingParser instead (see unstop.shared.ts). This file is the detail
// route: opening it with no user action still parses and syncs automatically.

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

const DETAIL_URL = "https://unstop.com/jobs/backend-engineer-at-acme-india-1714496";

function buildUnstopFixture(): void {
  document.body.innerHTML = "";
  const script = document.createElement("script");
  script.type = "application/ld+json";
  script.textContent = JSON.stringify({
    "@type": "JobPosting",
    title: "Backend Engineer",
    hiringOrganization: { "@type": "Organization", name: "Acme India" },
    description: "<p>Build and ship features for our core product.</p>",
    datePosted: "2026-09-10T00:00:00.000Z",
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

describe("Unstop: initial load", () => {
  it("parses and syncs automatically with no Save/Apply/popup click", async () => {
    buildUnstopFixture();

    await import("../index");
    await flushPipeline(JOB_CHANGE_DEBOUNCE_MS);

    const syncs = mock.syncCalls();
    expect(syncs).toHaveLength(1);
    expect(syncs[0].payload.source).toBe("unstop");
    expect(syncs[0].payload.title).toBe("Backend Engineer");
    expect(syncs[0].payload.companyName).toBe("Acme India");
    expect(syncs[0].payload.sourceJobId).toBe("1714496");
  });
});
