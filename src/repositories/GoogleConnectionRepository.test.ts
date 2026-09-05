import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  GoogleConnectionRepository,
  SYNC_LOCK_STALE_MS,
  isSyncLockStale,
  type GoogleProduct,
} from "./GoogleConnectionRepository";
import type { Database } from "@/types/database";

// ── Sync-lock claim/release tests (P1-1) ──
//
// Regression cover for a lock that could be stranded forever: `claimSyncLock`
// used to filter the status down to ("connected","error"), which excluded
// "syncing" — the ONLY state a lock can be stranded in when a run is
// hard-terminated before it releases. That made the 5-minute staleness rule
// unreachable, so every later trigger returned `already_syncing` and the
// connection only recovered via a manual disconnect + re-consent.
//
// A fake that ignored filters would be worthless here: the whole defect WAS
// the filters. So this follows the same hand-written-fake convention as
// ApplicationMatcher.test.ts, but evaluates `eq`/`in`/`or` against a seeded
// row with real PostgREST semantics, and applies the patch on a match. That
// way each test asserts the actual decision ("would this row be claimed?")
// and the resulting row state, not the presence of a string in the query.

type Row = Record<string, unknown>;

type Predicate = (row: Row) => boolean;

/**
 * Understands exactly the two `.or()` operand forms `claimSyncLock` builds:
 * `<col>.is.null` and `<col>.lt.<iso timestamp>`.
 */
function parseOrOperand(operand: string): Predicate {
  const [column, op, ...rest] = operand.split(".");
  const value = rest.join(".");
  if (op === "is" && value === "null") return (row) => row[column] == null;
  if (op === "lt") {
    return (row) => {
      const cell = row[column];
      if (cell == null) return false;
      return new Date(String(cell)).getTime() < new Date(value).getTime();
    };
  }
  throw new Error(`fake supabase: unsupported .or() operand "${operand}"`);
}

function makeChain(row: Row | null) {
  const predicates: Predicate[] = [];
  let patch: Row = {};

  const matched = () => (row !== null && predicates.every((p) => p(row)) ? row : null);

  const chain = {
    update(next: Row) {
      patch = next;
      return chain;
    },
    eq(column: string, value: unknown) {
      predicates.push((r) => r[column] === value);
      return chain;
    },
    in(column: string, values: unknown[]) {
      predicates.push((r) => values.includes(r[column]));
      return chain;
    },
    or(expression: string) {
      const operands = expression.split(",").map(parseOrOperand);
      predicates.push((r) => operands.some((p) => p(r)));
      return chain;
    },
    select() {
      return chain;
    },
    async maybeSingle() {
      const hit = matched();
      if (hit) Object.assign(hit, patch);
      return { data: hit ? { id: hit.id } : null, error: null };
    },
    // Release paths await the builder directly after `.eq(...)`, with no
    // `.select()`/`.maybeSingle()` — so the chain has to be thenable too.
    then(resolve: (v: { data: null; error: null }) => unknown, reject?: (e: unknown) => unknown) {
      const hit = matched();
      if (hit) Object.assign(hit, patch);
      return Promise.resolve({ data: null, error: null }).then(resolve, reject);
    },
  };
  return chain;
}

function repoFor(row: Row | null) {
  const client = {
    from: () => makeChain(row),
  } as unknown as SupabaseClient<Database>;
  return new GoogleConnectionRepository(client);
}

const USER_ID = "user-1";

/** Lock timestamp `minutes` in the past. */
function minutesAgo(minutes: number): string {
  return new Date(Date.now() - minutes * 60 * 1000).toISOString();
}

function connectionRow(overrides: Row = {}): Row {
  return {
    id: "conn-1",
    user_id: USER_ID,
    gmail_status: "connected",
    gmail_sync_lock_acquired_at: null,
    calendar_status: "connected",
    calendar_sync_lock_acquired_at: null,
    ...overrides,
  };
}

/** Column names each product's lock lives under, so both mappings get asserted. */
const PRODUCTS: { product: GoogleProduct; statusColumn: string; lockColumn: string }[] = [
  {
    product: "gmail",
    statusColumn: "gmail_status",
    lockColumn: "gmail_sync_lock_acquired_at",
  },
  {
    product: "calendar",
    statusColumn: "calendar_status",
    lockColumn: "calendar_sync_lock_acquired_at",
  },
];

describe("isSyncLockStale", () => {
  it("treats a never-held lock as not stale", () => {
    expect(isSyncLockStale(null)).toBe(false);
  });

  it("treats a lock younger than the window as not stale", () => {
    expect(isSyncLockStale(minutesAgo(1))).toBe(false);
    expect(isSyncLockStale(minutesAgo(4.9))).toBe(false);
  });

  it("treats a lock older than the window as stale", () => {
    expect(isSyncLockStale(minutesAgo(6))).toBe(true);
    expect(isSyncLockStale(minutesAgo(180))).toBe(true);
  });

  it("uses the same 5-minute window claimSyncLock does", () => {
    expect(SYNC_LOCK_STALE_MS).toBe(5 * 60 * 1000);
  });

  it("treats an unparseable timestamp as stale rather than blocking forever", () => {
    expect(isSyncLockStale("not-a-date")).toBe(true);
  });
});

describe.each(PRODUCTS)("claimSyncLock($product)", ({ product, statusColumn, lockColumn }) => {
  it("claims when connected with no lock held", async () => {
    const row = connectionRow({ [statusColumn]: "connected", [lockColumn]: null });
    await expect(repoFor(row).claimSyncLock(USER_ID, product)).resolves.toBe(true);
    expect(row[statusColumn]).toBe("syncing");
    expect(row[lockColumn]).toEqual(expect.any(String));
  });

  it("claims when the last run ended in error and released its lock", async () => {
    const row = connectionRow({ [statusColumn]: "error", [lockColumn]: null });
    await expect(repoFor(row).claimSyncLock(USER_ID, product)).resolves.toBe(true);
    expect(row[statusColumn]).toBe("syncing");
  });

  // The concurrency guard the lock exists for. If this ever goes green-to-red
  // the fix has been widened too far and two tabs can double-sync.
  it("does NOT claim while another run holds a FRESH lock", async () => {
    const heldAt = minutesAgo(1);
    const row = connectionRow({ [statusColumn]: "syncing", [lockColumn]: heldAt });
    await expect(repoFor(row).claimSyncLock(USER_ID, product)).resolves.toBe(false);
    expect(row[statusColumn]).toBe("syncing");
    expect(row[lockColumn]).toBe(heldAt);
  });

  // The P1-1 regression itself: fails on the pre-fix ("connected","error") filter.
  it("RECLAIMS a stale lock left behind by a hard-terminated run", async () => {
    const strandedAt = minutesAgo(6);
    const row = connectionRow({ [statusColumn]: "syncing", [lockColumn]: strandedAt });
    await expect(repoFor(row).claimSyncLock(USER_ID, product)).resolves.toBe(true);
    expect(row[lockColumn]).not.toBe(strandedAt);
  });

  it("reclaims a lock stranded for hours (the shape seen in production)", async () => {
    const row = connectionRow({ [statusColumn]: "syncing", [lockColumn]: minutesAgo(187) });
    await expect(repoFor(row).claimSyncLock(USER_ID, product)).resolves.toBe(true);
  });

  it("does NOT claim a disconnected product", async () => {
    const row = connectionRow({ [statusColumn]: "disconnected", [lockColumn]: null });
    await expect(repoFor(row).claimSyncLock(USER_ID, product)).resolves.toBe(false);
    expect(row[statusColumn]).toBe("disconnected");
  });

  it("does NOT claim a product whose access was revoked", async () => {
    const row = connectionRow({ [statusColumn]: "needs_reauth", [lockColumn]: null });
    await expect(repoFor(row).claimSyncLock(USER_ID, product)).resolves.toBe(false);
  });

  it("does NOT claim when there is no connection row", async () => {
    await expect(repoFor(null).claimSyncLock(USER_ID, product)).resolves.toBe(false);
  });

  it("is scoped to the calling user", async () => {
    const row = connectionRow({ user_id: "someone-else" });
    await expect(repoFor(row).claimSyncLock(USER_ID, product)).resolves.toBe(false);
  });
});

describe("claimSyncLock product column mapping", () => {
  it("a stale Gmail lock does not let the Calendar claim through", async () => {
    const calendarLock = minutesAgo(1);
    const row = connectionRow({
      gmail_status: "syncing",
      gmail_sync_lock_acquired_at: minutesAgo(60),
      calendar_status: "syncing",
      calendar_sync_lock_acquired_at: calendarLock,
    });
    await expect(repoFor(row).claimSyncLock(USER_ID, "calendar")).resolves.toBe(false);
    expect(row.calendar_sync_lock_acquired_at).toBe(calendarLock);
  });

  it("claiming Gmail leaves Calendar's status and lock untouched", async () => {
    const calendarLock = minutesAgo(1);
    const row = connectionRow({
      gmail_status: "connected",
      gmail_sync_lock_acquired_at: null,
      calendar_status: "syncing",
      calendar_sync_lock_acquired_at: calendarLock,
    });
    await expect(repoFor(row).claimSyncLock(USER_ID, "gmail")).resolves.toBe(true);
    expect(row.gmail_status).toBe("syncing");
    expect(row.calendar_status).toBe("syncing");
    expect(row.calendar_sync_lock_acquired_at).toBe(calendarLock);
  });

  it("a wedged Calendar does not block a healthy Gmail (the production shape, inverted)", async () => {
    const row = connectionRow({
      gmail_status: "connected",
      gmail_sync_lock_acquired_at: null,
      calendar_status: "syncing",
      calendar_sync_lock_acquired_at: minutesAgo(2),
    });
    await expect(repoFor(row).claimSyncLock(USER_ID, "gmail")).resolves.toBe(true);
  });
});

// The invariant `claimSyncLock`'s "syncing with a NULL lock is unreachable"
// note depends on: every release path must clear the lock in the same write
// that moves the status off "syncing".
describe("releasing a sync lock", () => {
  it("releaseGmailSyncLock clears the Gmail lock and sets the outcome status", async () => {
    const row = connectionRow({
      gmail_status: "syncing",
      gmail_sync_lock_acquired_at: minutesAgo(1),
    });
    await repoFor(row).releaseGmailSyncLock(USER_ID, { status: "connected" });
    expect(row.gmail_status).toBe("connected");
    expect(row.gmail_sync_lock_acquired_at).toBeNull();
  });

  it("releaseGmailSyncLock clears the lock on the error path too", async () => {
    const row = connectionRow({
      gmail_status: "syncing",
      gmail_sync_lock_acquired_at: minutesAgo(1),
    });
    await repoFor(row).releaseGmailSyncLock(USER_ID, {
      status: "error",
      last_sync_error: "Gmail API 500",
    });
    expect(row.gmail_status).toBe("error");
    expect(row.gmail_sync_lock_acquired_at).toBeNull();
  });

  it("releaseGmailSyncLock clears the lock when access was revoked", async () => {
    const row = connectionRow({
      gmail_status: "syncing",
      gmail_sync_lock_acquired_at: minutesAgo(1),
    });
    await repoFor(row).releaseGmailSyncLock(USER_ID, { status: "needs_reauth" });
    expect(row.gmail_status).toBe("needs_reauth");
    expect(row.gmail_sync_lock_acquired_at).toBeNull();
  });

  it("releaseCalendarSyncLock clears the Calendar lock and sets the outcome status", async () => {
    const row = connectionRow({
      calendar_status: "syncing",
      calendar_sync_lock_acquired_at: minutesAgo(1),
    });
    await repoFor(row).releaseCalendarSyncLock(USER_ID, { status: "connected" });
    expect(row.calendar_status).toBe("connected");
    expect(row.calendar_sync_lock_acquired_at).toBeNull();
  });

  it("releaseCalendarSyncLock clears the lock on the error path too", async () => {
    const row = connectionRow({
      calendar_status: "syncing",
      calendar_sync_lock_acquired_at: minutesAgo(1),
    });
    await repoFor(row).releaseCalendarSyncLock(USER_ID, {
      status: "error",
      last_sync_error: "Calendar API 403",
    });
    expect(row.calendar_status).toBe("error");
    expect(row.calendar_sync_lock_acquired_at).toBeNull();
  });

  it("releasing one product never touches the other's lock", async () => {
    const calendarLock = minutesAgo(1);
    const row = connectionRow({
      gmail_status: "syncing",
      gmail_sync_lock_acquired_at: minutesAgo(1),
      calendar_status: "syncing",
      calendar_sync_lock_acquired_at: calendarLock,
    });
    await repoFor(row).releaseGmailSyncLock(USER_ID, { status: "connected" });
    expect(row.gmail_sync_lock_acquired_at).toBeNull();
    expect(row.calendar_status).toBe("syncing");
    expect(row.calendar_sync_lock_acquired_at).toBe(calendarLock);
  });

  // Closes the loop: release then re-claim, which is the normal steady state.
  it("a released lock is immediately re-claimable", async () => {
    const row = connectionRow({
      gmail_status: "syncing",
      gmail_sync_lock_acquired_at: minutesAgo(1),
    });
    const repo = repoFor(row);
    await repo.releaseGmailSyncLock(USER_ID, { status: "connected" });
    await expect(repoFor(row).claimSyncLock(USER_ID, "gmail")).resolves.toBe(true);
  });
});
