import { describe, expect, it } from "vitest";
import { isSyncDue } from "./GmailSyncService";

// ── isSyncDue tests (P1-1) ──
//
// Scoped to the exported due-check, matching this directory's convention of
// unit-testing the pure, exported pieces (see EmailClassifier.test.ts,
// RelevanceFilter.test.ts). `syncUser` itself needs a live authed context,
// the Gmail API and a provider, so it is not reachable from a plain vitest
// run — its lock behaviour is covered where it actually lives, in
// GoogleConnectionRepository.test.ts.
//
// What matters here: a `syncing` status must block only while its lock is
// FRESH. Blocking on the status alone meant a connection stranded by a
// hard-terminated run never auto-recovered, and came back only if the user
// happened to press Sync Now.

function minutesAgo(minutes: number): string {
  return new Date(Date.now() - minutes * 60 * 1000).toISOString();
}

function minutesFromNow(minutes: number): string {
  return new Date(Date.now() + minutes * 60 * 1000).toISOString();
}

function connection(overrides: Partial<Parameters<typeof isSyncDue>[0]> = {}) {
  return {
    gmail_auto_sync_enabled: true,
    gmail_next_sync_at: minutesAgo(1),
    gmail_status: "connected",
    gmail_sync_lock_acquired_at: null,
    ...overrides,
  };
}

describe("isSyncDue", () => {
  it("is due when connected and the throttle window has passed", () => {
    expect(isSyncDue(connection())).toBe(true);
  });

  it("is due when no next-sync checkpoint has been recorded yet", () => {
    expect(isSyncDue(connection({ gmail_next_sync_at: null }))).toBe(true);
  });

  it("is not due before the throttle window has passed", () => {
    expect(isSyncDue(connection({ gmail_next_sync_at: minutesFromNow(20) }))).toBe(false);
  });

  it("is never due when the user turned auto-sync off", () => {
    expect(isSyncDue(connection({ gmail_auto_sync_enabled: false }))).toBe(false);
  });

  it("is never due when disconnected", () => {
    expect(isSyncDue(connection({ gmail_status: "disconnected" }))).toBe(false);
  });

  it("is never due when access was revoked", () => {
    expect(isSyncDue(connection({ gmail_status: "needs_reauth" }))).toBe(false);
  });

  it("is not due while another run holds a FRESH lock", () => {
    expect(
      isSyncDue(
        connection({ gmail_status: "syncing", gmail_sync_lock_acquired_at: minutesAgo(1) }),
      ),
    ).toBe(false);
  });

  // The P1-1 auto-recovery regression: without the staleness allowance this
  // returns false forever and the connection only recovers via a manual
  // Sync Now.
  it("IS due when a stale lock shows the previous run died", () => {
    expect(
      isSyncDue(
        connection({ gmail_status: "syncing", gmail_sync_lock_acquired_at: minutesAgo(6) }),
      ),
    ).toBe(true);
  });

  it("is due for a lock stranded for hours (the shape seen in production)", () => {
    expect(
      isSyncDue(
        connection({
          gmail_status: "syncing",
          gmail_sync_lock_acquired_at: minutesAgo(187),
          gmail_next_sync_at: minutesAgo(60),
        }),
      ),
    ).toBe(true);
  });

  // Deliberate, documented behaviour rather than an oversight: a stale lock
  // makes the connection ELIGIBLE again, it does not bypass the ordinary
  // throttle. A manual Sync Now (which skips this check entirely) still
  // recovers it immediately, so the worst case is a bounded wait for the
  // next window, never a permanent wedge.
  it("still respects the throttle window once a stale lock has freed it", () => {
    expect(
      isSyncDue(
        connection({
          gmail_status: "syncing",
          gmail_sync_lock_acquired_at: minutesAgo(6),
          gmail_next_sync_at: minutesFromNow(20),
        }),
      ),
    ).toBe(false);
  });

  // Unreachable in practice (every writer sets status and lock in one atomic
  // UPDATE), asserted so the "syncing implies a held lock" invariant that
  // claimSyncLock relies on stays honest if that ever changes.
  it("treats syncing with no lock recorded as still in progress", () => {
    expect(
      isSyncDue(connection({ gmail_status: "syncing", gmail_sync_lock_acquired_at: null })),
    ).toBe(false);
  });
});
