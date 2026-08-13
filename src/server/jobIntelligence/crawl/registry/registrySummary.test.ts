import { describe, expect, it } from "vitest";
import { registryEntry } from "../testing/fakes";
import { summarizeRegistry } from "./registrySummary";

describe("summarizeRegistry — Module 10B.2.5 counter clarity", () => {
  it("eligibleNow never exceeds enabled, and equals enabled when every enabled entry is verified", () => {
    const entries = [
      registryEntry({ id: "1", enabled: true, healthStatus: "HEALTHY" }),
      registryEntry({ id: "2", enabled: true, healthStatus: "REDIRECTED" }),
    ];
    const summary = summarizeRegistry(entries);

    expect(summary.enabled).toBe(2);
    expect(summary.eligibleNow).toBe(2);
  });

  it("verified can exceed enabled — a disabled entry can still carry a stale healthy verdict", () => {
    // This is the exact scenario the Module 10B.2.5 audit found live: the
    // disabled foreign seed companies still show HEALTHY from before they
    // were disabled. `verified` is registry-wide by design; `eligibleNow` is
    // the number that actually answers "how many can be crawled right now".
    const entries = [
      registryEntry({ id: "1", enabled: true, healthStatus: "HEALTHY" }),
      registryEntry({ id: "2", enabled: false, healthStatus: "HEALTHY" }),
      registryEntry({ id: "3", enabled: false, healthStatus: "HEALTHY" }),
    ];
    const summary = summarizeRegistry(entries);

    expect(summary.enabled).toBe(1);
    expect(summary.verified).toBe(3);
    expect(summary.eligibleNow).toBe(1);
    expect(summary.eligibleNow).toBeLessThanOrEqual(summary.enabled);
  });

  it("an enabled but never-verified (null health) entry does not count as eligible", () => {
    const entries = [registryEntry({ id: "1", enabled: true, healthStatus: null })];
    const summary = summarizeRegistry(entries);

    expect(summary.enabled).toBe(1);
    expect(summary.eligibleNow).toBe(0);
    expect(summary.unchecked).toBe(1);
  });

  it("an enabled but BROKEN/BLOCKED entry does not count as eligible", () => {
    const entries = [
      registryEntry({ id: "1", enabled: true, healthStatus: "BROKEN" }),
      registryEntry({ id: "2", enabled: true, healthStatus: "BLOCKED" }),
    ];
    const summary = summarizeRegistry(entries);

    expect(summary.eligibleNow).toBe(0);
    expect(summary.needsAttention).toBe(2);
  });
});

describe("summarizeRegistry — Module 11B: enabled must never imply crawl-ready", () => {
  it("counts an enabled UNKNOWN entry as enabled-but-not-ready AND as needing attention", () => {
    // The live shape of the 18 sources the Module 11B audit found: enabled,
    // previously verified, now UNKNOWN — so the crawl gate refuses them while
    // the panel showed them as simply "enabled". Before this fix such a row
    // appeared in NO attention bucket at all: not verified, not unchecked
    // (it HAD been checked), and needsAttention only counted BROKEN/BLOCKED.
    const entries = [
      registryEntry({ id: "1", enabled: true, healthStatus: "HEALTHY" }),
      registryEntry({ id: "2", enabled: true, healthStatus: "UNKNOWN" }),
      registryEntry({ id: "3", enabled: true, healthStatus: "UNKNOWN" }),
    ];
    const summary = summarizeRegistry(entries);

    expect(summary.enabled).toBe(3);
    expect(summary.eligibleNow).toBe(1);
    expect(summary.enabledNotReady).toBe(2);
    expect(summary.needsAttention).toBe(2);
    expect(summary.unchecked).toBe(0);
  });

  it("counts an enabled UNAVAILABLE entry as needing attention", () => {
    const entries = [registryEntry({ id: "1", enabled: true, healthStatus: "UNAVAILABLE" })];
    const summary = summarizeRegistry(entries);

    expect(summary.eligibleNow).toBe(0);
    expect(summary.enabledNotReady).toBe(1);
    expect(summary.needsAttention).toBe(1);
  });

  it("reports zero enabled-not-ready when every enabled source is crawlable", () => {
    const entries = [
      registryEntry({ id: "1", enabled: true, healthStatus: "HEALTHY" }),
      registryEntry({ id: "2", enabled: false, healthStatus: "BROKEN" }),
    ];
    const summary = summarizeRegistry(entries);

    expect(summary.enabledNotReady).toBe(0);
  });

  it("enabledNotReady is exactly enabled minus eligibleNow, by construction", () => {
    const entries = [
      registryEntry({ id: "1", enabled: true, healthStatus: "HEALTHY" }),
      registryEntry({ id: "2", enabled: true, healthStatus: "UNKNOWN" }),
      registryEntry({ id: "3", enabled: true, healthStatus: null }),
      registryEntry({ id: "4", enabled: false, healthStatus: "HEALTHY" }),
    ];
    const summary = summarizeRegistry(entries);

    expect(summary.enabledNotReady).toBe(summary.enabled - summary.eligibleNow);
  });
});
