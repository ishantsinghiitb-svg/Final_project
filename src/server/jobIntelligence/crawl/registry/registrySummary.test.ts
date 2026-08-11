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
