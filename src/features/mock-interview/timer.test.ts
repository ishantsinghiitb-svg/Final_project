import { describe, expect, it } from "vitest";
import { elapsedMs, formatElapsed, isPastResumeWindow } from "./timer";

const BASE = Date.parse("2026-07-30T12:00:00.000Z");

describe("elapsedMs", () => {
  it("returns the banked elapsed_ms unchanged while paused", () => {
    const session = { status: "paused" as const, elapsed_ms: 90_000, last_resumed_at: null };
    expect(elapsedMs(session, BASE)).toBe(90_000);
  });

  it("returns the banked elapsed_ms unchanged while concluded", () => {
    const session = { status: "concluded" as const, elapsed_ms: 120_000, last_resumed_at: null };
    expect(elapsedMs(session, BASE)).toBe(120_000);
  });

  it("adds the running segment while active", () => {
    const session = {
      status: "active" as const,
      elapsed_ms: 60_000,
      last_resumed_at: new Date(BASE - 15_000).toISOString(),
    };
    expect(elapsedMs(session, BASE)).toBe(75_000);
  });

  it("does not accrue extra time across a pause/resume cycle", () => {
    // Started, ran 30s, paused (banks 30s), resumed 10s "ago" relative to now.
    const paused = { status: "paused" as const, elapsed_ms: 30_000, last_resumed_at: null };
    expect(elapsedMs(paused, BASE)).toBe(30_000);

    const resumed = {
      status: "active" as const,
      elapsed_ms: 30_000,
      last_resumed_at: new Date(BASE - 10_000).toISOString(),
    };
    expect(elapsedMs(resumed, BASE)).toBe(40_000);
  });

  it("never goes negative if last_resumed_at is somehow in the future", () => {
    const session = {
      status: "active" as const,
      elapsed_ms: 5_000,
      last_resumed_at: new Date(BASE + 5_000).toISOString(),
    };
    expect(elapsedMs(session, BASE)).toBe(5_000);
  });
});

describe("formatElapsed", () => {
  it("formats sub-minute durations", () => {
    expect(formatElapsed(45_000)).toBe("0:45");
  });

  it("formats multi-minute durations with zero-padded seconds", () => {
    expect(formatElapsed(125_000)).toBe("2:05");
  });

  it("formats durations past an hour as accumulated minutes", () => {
    expect(formatElapsed(65 * 60_000)).toBe("65:00");
  });
});

describe("isPastResumeWindow", () => {
  it("is false for a session updated well within the window", () => {
    const session = {
      status: "paused" as const,
      updated_at: new Date(BASE - 60_000).toISOString(),
    };
    expect(isPastResumeWindow(session, 14, BASE)).toBe(false);
  });

  it("is true once the window has elapsed", () => {
    const fifteenDaysMs = 15 * 24 * 60 * 60 * 1000;
    const session = {
      status: "paused" as const,
      updated_at: new Date(BASE - fifteenDaysMs).toISOString(),
    };
    expect(isPastResumeWindow(session, 14, BASE)).toBe(true);
  });

  it("is false for a session that isn't active or paused", () => {
    const fifteenDaysMs = 15 * 24 * 60 * 60 * 1000;
    const session = {
      status: "concluded" as const,
      updated_at: new Date(BASE - fifteenDaysMs).toISOString(),
    };
    expect(isPastResumeWindow(session, 14, BASE)).toBe(false);
  });
});
