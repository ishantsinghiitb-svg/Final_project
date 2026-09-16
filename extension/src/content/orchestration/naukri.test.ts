// @vitest-environment jsdom
// @vitest-environment-options {"url": "https://www.naukri.com/job-listings-backend-engineer-acme-india-700123456"}
//
// ── Automatic detection/orchestration: Naukri ──
//
// Same contract as the other platform files: opening a supported Naukri job
// page with no user action still parses and syncs it automatically. Naukri's
// detail parser is JSON-LD-first (see NaukriJobParser), so the fixture here
// is a JobPosting block rather than DOM markup.

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

const DETAIL_URL = "https://www.naukri.com/job-listings-backend-engineer-acme-india-700123456";

function buildNaukriFixture(): void {
  document.body.innerHTML = "";
  const script = document.createElement("script");
  script.type = "application/ld+json";
  script.textContent = JSON.stringify({
    "@type": "JobPosting",
    title: "Backend Engineer",
    hiringOrganization: { "@type": "Organization", name: "Acme India" },
    identifier: { "@type": "PropertyValue", value: "700123456" },
    description: "<p>Build scalable backend services for our platform.</p>",
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

describe("Naukri: initial load", () => {
  it("parses and syncs automatically with no Save/Apply/popup click, immediately (no artificial delay before the first attempt)", async () => {
    buildNaukriFixture();

    await import("../index");
    // 0ms — real microtask draining only, no fake-timer advancement.
    await flushPipeline(0);

    const syncs = mock.syncCalls();
    expect(syncs).toHaveLength(1);
    expect(syncs[0].payload.source).toBe("naukri");
    expect(syncs[0].payload.title).toBe("Backend Engineer");
    expect(syncs[0].payload.companyName).toBe("Acme India");
    expect(syncs[0].payload.sourceJobId).toBe("700123456");
  });
});
