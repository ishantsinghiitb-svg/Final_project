import { describe, expect, it } from "vitest";
import { isCalendarSyncDue } from "./CalendarSyncService";

// ── isCalendarSyncDue tests (P1-1) ──
//
// Calendar's half of the same stale-lock allowance covered for Gmail in
// GmailSyncService.test.ts. Both products share one `claimSyncLock`, so both
// could be stranded the same way; these assert Calendar's due-check agrees
// with it rather than blocking on the status alone.

function minutesAgo(minutes: number): string {
  return new Date(Date.now() - minutes * 60 * 1000).toISOString();
}

function minutesFromNow(minutes: number): string {
  return new Date(Date.now() + minutes * 60 * 1000).toISOString();
}

function connection(overrides: Partial<Parameters<typeof isCalendarSyncDue>[0]> = {}) {
  return {
    calendar_auto_sync_enabled: true,
    calendar_next_sync_at: minutesAgo(1),
    calendar_status: "connected",
    calendar_sync_lock_acquired_at: null,
    ...overrides,
  };
}

describe("isCalendarSyncDue", () => {
  it("is due when connected and the throttle window has passed", () => {
    expect(isCalendarSyncDue(connection())).toBe(true);
  });

  it("is due when no next-sync checkpoint has been recorded yet", () => {
    expect(isCalendarSyncDue(connection({ calendar_next_sync_at: null }))).toBe(true);
  });

  it("is not due before the throttle window has passed", () => {
    expect(isCalendarSyncDue(connection({ calendar_next_sync_at: minutesFromNow(10) }))).toBe(
      false,
    );
  });

  it("is never due when the user turned auto-sync off", () => {
    expect(isCalendarSyncDue(connection({ calendar_auto_sync_enabled: false }))).toBe(false);
  });

  it("is never due when disconnected", () => {
    expect(isCalendarSyncDue(connection({ calendar_status: "disconnected" }))).toBe(false);
  });

  it("is never due when access was revoked", () => {
    expect(isCalendarSyncDue(connection({ calendar_status: "needs_reauth" }))).toBe(false);
  });

  it("is not due while another run holds a FRESH lock", () => {
    expect(
      isCalendarSyncDue(
        connection({
          calendar_status: "syncing",
          calendar_sync_lock_acquired_at: minutesAgo(1),
        }),
      ),
    ).toBe(false);
  });

  it("IS due when a stale lock shows the previous run died", () => {
    expect(
      isCalendarSyncDue(
        connection({
          calendar_status: "syncing",
          calendar_sync_lock_acquired_at: minutesAgo(6),
        }),
      ),
    ).toBe(true);
  });

  it("still respects the throttle window once a stale lock has freed it", () => {
    expect(
      isCalendarSyncDue(
        connection({
          calendar_status: "syncing",
          calendar_sync_lock_acquired_at: minutesAgo(6),
          calendar_next_sync_at: minutesFromNow(10),
        }),
      ),
    ).toBe(false);
  });

  it("treats syncing with no lock recorded as still in progress", () => {
    expect(
      isCalendarSyncDue(
        connection({ calendar_status: "syncing", calendar_sync_lock_acquired_at: null }),
      ),
    ).toBe(false);
  });
});
