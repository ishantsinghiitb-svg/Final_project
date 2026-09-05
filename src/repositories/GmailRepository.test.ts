import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { GmailRepository } from "./GmailRepository";
import type { Database } from "@/types/database";

// ── Batched dedup tests (subrequest exhaustion fix) ──
//
// The old design called findMessageByGmailId once PER CANDIDATE — with
// BATCH_SIZE=50 that alone cost 50 subrequests, consuming the Workers Free
// 50-subrequest-per-invocation budget before a single new message was ever
// fetched (confirmed live: an invocation that wrote zero rows anywhere,
// stuck on the identical first page indefinitely). findExistingGmailIds
// replaces it with one `.in(...)` query for the whole page. These tests
// assert the call COUNT, not just the result — a regression that reverts to
// N calls but still returns the right Set would defeat the whole fix.

type Row = { user_id: string; gmail_message_id: string };

function fakeSupabase(rows: Row[], callLog: { calls: number }): SupabaseClient<Database> {
  return {
    from(table: string) {
      if (table !== "gmail_messages") throw new Error(`unexpected table ${table}`);
      return {
        select() {
          return {
            eq(column: string, value: string) {
              const filtered = rows.filter((r) => (r as Record<string, unknown>)[column] === value);
              return {
                in(inColumn: string, values: string[]) {
                  callLog.calls += 1;
                  const matched = filtered.filter((r) =>
                    values.includes((r as Record<string, unknown>)[inColumn] as string),
                  );
                  return Promise.resolve({ data: matched, error: null });
                },
              };
            },
          };
        },
      };
    },
  } as unknown as SupabaseClient<Database>;
}

const userId = "user-1";

describe("findExistingGmailIds", () => {
  it("makes exactly ONE call regardless of batch size", async () => {
    const callLog = { calls: 0 };
    const existing = Array.from({ length: 50 }, (_, i) => ({
      user_id: userId,
      gmail_message_id: `msg-${i}`,
    }));
    const repo = new GmailRepository(fakeSupabase(existing, callLog));

    const ids = existing.map((r) => r.gmail_message_id);
    await repo.findExistingGmailIds(userId, ids);

    expect(callLog.calls).toBe(1);
  });

  it("returns exactly the ids that are already stored, nothing more", async () => {
    const callLog = { calls: 0 };
    const rows: Row[] = [
      { user_id: userId, gmail_message_id: "a" },
      { user_id: userId, gmail_message_id: "c" },
    ];
    const repo = new GmailRepository(fakeSupabase(rows, callLog));

    const result = await repo.findExistingGmailIds(userId, ["a", "b", "c", "d"]);

    expect(result).toEqual(new Set(["a", "c"]));
  });

  it("correctly splits existing vs new across a realistic mixed batch", async () => {
    const callLog = { calls: 0 };
    const rows: Row[] = [
      { user_id: userId, gmail_message_id: "seen-1" },
      { user_id: userId, gmail_message_id: "seen-2" },
      { user_id: userId, gmail_message_id: "seen-3" },
    ];
    const repo = new GmailRepository(fakeSupabase(rows, callLog));

    const candidateIds = ["seen-1", "new-1", "seen-2", "new-2", "seen-3", "new-3"];
    const existing = await repo.findExistingGmailIds(userId, candidateIds);
    const newIds = candidateIds.filter((id) => !existing.has(id));

    expect(existing).toEqual(new Set(["seen-1", "seen-2", "seen-3"]));
    expect(newIds).toEqual(["new-1", "new-2", "new-3"]);
    expect(callLog.calls).toBe(1);
  });

  it("only matches ids belonging to the calling user", async () => {
    const callLog = { calls: 0 };
    const rows: Row[] = [
      { user_id: "someone-else", gmail_message_id: "shared-id" },
      { user_id: userId, gmail_message_id: "mine" },
    ];
    const repo = new GmailRepository(fakeSupabase(rows, callLog));

    const result = await repo.findExistingGmailIds(userId, ["shared-id", "mine"]);

    expect(result).toEqual(new Set(["mine"]));
  });

  it("short-circuits to an empty Set with zero network calls for an empty batch", async () => {
    const callLog = { calls: 0 };
    const repo = new GmailRepository(fakeSupabase([], callLog));

    const result = await repo.findExistingGmailIds(userId, []);

    expect(result).toEqual(new Set());
    expect(callLog.calls).toBe(0);
  });

  it("returns an empty Set when none of the candidates exist yet", async () => {
    const callLog = { calls: 0 };
    const repo = new GmailRepository(fakeSupabase([], callLog));

    const result = await repo.findExistingGmailIds(userId, ["x", "y", "z"]);

    expect(result).toEqual(new Set());
    expect(callLog.calls).toBe(1);
  });

  // The retry-safety property end to end: a batch retried after a partial
  // run must not reprocess (or duplicate) what already made it to the DB.
  it("a retried batch correctly excludes ids a prior partial run already persisted", async () => {
    const callLog = { calls: 0 };
    // Simulates: first invocation processed A and B before the subrequest
    // budget cut it off; C was never reached. The checkpoint did NOT
    // advance (see resolveBackfillCheckpoint), so the next invocation
    // re-requests the SAME page: [A, B, C].
    const persistedSoFar: Row[] = [
      { user_id: userId, gmail_message_id: "A" },
      { user_id: userId, gmail_message_id: "B" },
    ];
    const repo = new GmailRepository(fakeSupabase(persistedSoFar, callLog));

    const retryPage = ["A", "B", "C"];
    const existing = await repo.findExistingGmailIds(userId, retryPage);
    const toProcessOnRetry = retryPage.filter((id) => !existing.has(id));

    expect(toProcessOnRetry).toEqual(["C"]);
    expect(callLog.calls).toBe(1);
  });
});
