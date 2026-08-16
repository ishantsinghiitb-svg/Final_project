// ── Fake Supabase client for the AI engine tests (Module 6 freeze) ──
//
// Implements exactly the surface `runCapability` touches, and nothing more:
//
//   sb.rpc(name, args)                                  → credits (ensure/consume/refund)
//   sb.from("ai_cache").select(...).eq(...)*.maybeSingle() → cache read
//   sb.from("ai_cache").upsert(values, opts)            → cache write
//   sb.from("ai_runs").insert(values)                   → audit log
//
// It records every call so a test can assert on WHAT was written (the credit
// cost charged, the `cache_hit` / `credits_charged` on the audit row) rather
// than only on the returned envelope. That distinction matters here: the
// envelope can look correct while the audit row misreports what the user paid.
//
// Deliberately hand-written rather than a mocking library: the point of these
// tests is that the real query shapes are exercised, so the fake asserting a
// wrong table or column name should be a test failure, not a silent pass.

import { vi } from "vitest";

export type RpcCall = { name: string; args: Record<string, unknown> };
export type InsertCall = { table: string; values: Record<string, unknown> };
export type UpsertCall = { table: string; values: Record<string, unknown> };

/** A row already sitting in `ai_cache`, or null for a miss. */
export type CachedRow = { response: unknown; expires_at: string | null } | null;

export type FakeSupabaseOptions = {
  /** Rows the cache read should find. Defaults to a miss. */
  cacheRow?: CachedRow;
  /** Force the cache SELECT to fail, to exercise the error path. */
  cacheReadError?: { message: string } | null;
  /**
   * Queue of `consume_ai_credit` results, consumed in order. Defaults to an
   * endless supply of successful charges.
   */
  consumeResults?: { ok: boolean; credits_total: number; credits_used: number }[];
  /**
   * Number of leading `refund_ai_credit` calls that should throw before one
   * succeeds — used to prove the refund's own retry actually retries.
   */
  refundFailures?: number;
};

export type FakeSupabase = {
  client: unknown;
  rpcCalls: RpcCall[];
  inserts: InsertCall[];
  upserts: UpsertCall[];
  /** Calls to one RPC, in order. */
  rpcsNamed: (name: string) => RpcCall[];
  /** Rows written to `ai_runs`, in order. */
  runLogs: () => Record<string, unknown>[];
};

const DEFAULT_USAGE = { plan: "free", credits_total: 5, credits_used: 1, credits_remaining: 4 };

export function createFakeSupabase(options: FakeSupabaseOptions = {}): FakeSupabase {
  const rpcCalls: RpcCall[] = [];
  const inserts: InsertCall[] = [];
  const upserts: UpsertCall[] = [];

  const consumeQueue = [...(options.consumeResults ?? [])];
  let refundFailuresLeft = options.refundFailures ?? 0;

  const runsById = new Map<string, Record<string, unknown>>();
  let nextRunId = 1;

  const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
    rpcCalls.push({ name, args });

    if (name === "refund_ai_credit") {
      if (refundFailuresLeft > 0) {
        refundFailuresLeft -= 1;
        return { data: null, error: { message: "refund rpc unavailable" } };
      }
      // Mirrors refund_ai_credit's own checks (migration
      // 20260824000001_module13_secure_ai_credit_refund.sql): the amount
      // comes from the referenced ai_runs row, never from the caller, and a
      // row can't be refunded twice.
      const run = runsById.get(args.p_ai_run_id as string);
      if (!run) return { data: null, error: { message: "ai run not found" } };
      if (run.status !== "error") {
        return { data: null, error: { message: "ai run is not in a refundable state" } };
      }
      if (run.refunded_at) {
        return { data: null, error: { message: "ai run has already been refunded" } };
      }
      if (!((run.credits_charged as number) > 0)) {
        return { data: null, error: { message: "ai run has nothing to refund" } };
      }
      run.refunded_at = new Date().toISOString();
      run.credits_charged = 0;
      return { data: { ...DEFAULT_USAGE, credits_used: 0, credits_remaining: 5 }, error: null };
    }

    if (name === "consume_ai_credit") {
      const next = consumeQueue.shift();
      if (next) {
        return {
          data: {
            ok: next.ok,
            plan: "free",
            credits_total: next.credits_total,
            credits_used: next.credits_used,
            credits_remaining: Math.max(next.credits_total - next.credits_used, 0),
          },
          error: null,
        };
      }
      return { data: { ok: true, ...DEFAULT_USAGE }, error: null };
    }

    // ensure_ai_usage
    return { data: DEFAULT_USAGE, error: null };
  });

  function from(table: string) {
    return {
      select() {
        // Every `.eq()` returns the same chain object; only `.maybeSingle()`
        // resolves. Filters aren't simulated — the tests that care about a hit
        // vs a miss set `cacheRow` directly.
        const chain = {
          eq: () => chain,
          maybeSingle: async () => {
            if (options.cacheReadError) return { data: null, error: options.cacheReadError };
            return { data: options.cacheRow ?? null, error: null };
          },
        };
        return chain;
      },
      upsert(values: Record<string, unknown>) {
        upserts.push({ table, values });
        return Promise.resolve({ error: null });
      },
      insert(values: Record<string, unknown>) {
        // Mirrors `gen_random_uuid() DEFAULT` — refund_ai_credit's ai_run_id
        // scoping needs every inserted ai_runs row to come back with an id.
        const id = `fake-run-${nextRunId++}`;
        const row = { id, ...values };
        inserts.push({ table, values: row });
        if (table === "ai_runs") runsById.set(id, row);
        return {
          select: () => ({
            single: async () => ({ data: { id }, error: null }),
          }),
        };
      },
    };
  }

  const client = { rpc, from };

  return {
    client,
    rpcCalls,
    inserts,
    upserts,
    rpcsNamed: (name) => rpcCalls.filter((c) => c.name === name),
    runLogs: () => inserts.filter((i) => i.table === "ai_runs").map((i) => i.values),
  };
}
