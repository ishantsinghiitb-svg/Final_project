// ── Fake Supabase client for Mock Interview Studio tests (Module 7C) ──
//
// A generic in-memory table store, unlike the narrower `fakeSupabase.ts`
// (Module 6 freeze) which only implements the exact cache/credit query shapes
// `runCapability` touches. MockInterviewAIService.ts reads/writes several
// tables with real filters, ordering and updates (interviews,
// mock_interview_sessions, mock_interview_turns, ai_runs, ai_analyses), so a
// generic-but-honest fake is worth the extra weight here: it exercises the
// real query shapes (wrong table/column name breaks a test) without hand-
// simulating every call site individually.
//
// Credits RPCs (ensure_ai_usage / consume_ai_credit / refund_ai_credit) mirror
// fakeSupabase.ts's behaviour and options exactly, since AICreditService is
// the same real class either way.

import { vi } from "vitest";

export type Row = Record<string, unknown>;

type ChainOp = "select" | "insert" | "update";

class Chain implements PromiseLike<{ data: unknown; error: unknown }> {
  private filters: [string, unknown][] = [];
  private orderCol: string | null = null;
  private orderAsc = true;
  private limitN: number | null = null;
  private resolved: Row[] | null = null;

  constructor(
    private readonly tables: Map<string, Row[]>,
    private readonly table: string,
    private readonly op: ChainOp,
    private readonly payload?: Row,
  ) {}

  select(_cols?: string): this {
    return this;
  }
  eq(col: string, val: unknown): this {
    this.filters.push([col, val]);
    return this;
  }
  order(col: string, opts: { ascending: boolean }): this {
    this.orderCol = col;
    this.orderAsc = opts.ascending;
    return this;
  }
  limit(n: number): this {
    this.limitN = n;
    return this;
  }
  not(): this {
    return this;
  }

  private rows(): Row[] {
    if (this.resolved) return this.resolved;
    const table = this.tables.get(this.table) ?? [];

    if (this.op === "insert") {
      // Mirrors `gen_random_uuid() DEFAULT` — refund_ai_credit's ai_run_id
      // scoping needs every inserted ai_runs row to come back with an id.
      const row = { id: `fake-${this.table}-${table.length + 1}`, ...this.payload };
      table.push(row);
      this.tables.set(this.table, table);
      this.resolved = [row];
      return this.resolved;
    }

    const matches = table.filter((r) => this.filters.every(([k, v]) => r[k] === v));

    if (this.op === "update") {
      matches.forEach((r) => Object.assign(r, this.payload));
      this.resolved = matches;
      return this.resolved;
    }

    let selected = matches;
    if (this.orderCol) {
      const col = this.orderCol;
      selected = [...selected].sort((a, b) => {
        const av = a[col] as string | number;
        const bv = b[col] as string | number;
        const cmp = av < bv ? -1 : av > bv ? 1 : 0;
        return this.orderAsc ? cmp : -cmp;
      });
    }
    if (this.limitN != null) selected = selected.slice(0, this.limitN);
    this.resolved = selected;
    return this.resolved;
  }

  async maybeSingle() {
    const rows = this.rows();
    return { data: rows[0] ?? null, error: null };
  }

  async single() {
    const rows = this.rows();
    return { data: rows[0] ?? null, error: null };
  }

  then<TResult1 = { data: unknown; error: unknown }, TResult2 = never>(
    onfulfilled?:
      ((value: { data: unknown; error: unknown }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    try {
      const rows = this.rows();
      return Promise.resolve({ data: rows, error: null }).then(onfulfilled, onrejected);
    } catch (err) {
      if (onrejected) return Promise.resolve(onrejected(err));
      return Promise.reject(err);
    }
  }
}

export type FakeMockInterviewSupabaseOptions = {
  seed?: Record<string, Row[]>;
  consumeResults?: { ok: boolean; credits_total: number; credits_used: number }[];
  refundFailures?: number;
};

export type FakeMockInterviewSupabase = {
  client: unknown;
  tables: Map<string, Row[]>;
  rpcCalls: { name: string; args: Record<string, unknown> }[];
  rpcsNamed: (name: string) => { name: string; args: Record<string, unknown> }[];
  rows: (table: string) => Row[];
};

const DEFAULT_USAGE = { plan: "free", credits_total: 5, credits_used: 0, credits_remaining: 5 };

export function createFakeMockInterviewSupabase(
  options: FakeMockInterviewSupabaseOptions = {},
): FakeMockInterviewSupabase {
  const tables = new Map<string, Row[]>();
  for (const [table, rows] of Object.entries(options.seed ?? {})) {
    tables.set(
      table,
      rows.map((r) => ({ ...r })),
    );
  }

  const rpcCalls: { name: string; args: Record<string, unknown> }[] = [];
  const consumeQueue = [...(options.consumeResults ?? [])];
  let refundFailuresLeft = options.refundFailures ?? 0;

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
      const runId = args.p_ai_run_id as string | undefined;
      const run = (tables.get("ai_runs") ?? []).find((r) => r.id === runId);
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
      select: (cols?: string) => new Chain(tables, table, "select").select(cols),
      insert: (payload: Row) => new Chain(tables, table, "insert", payload),
      update: (payload: Row) => new Chain(tables, table, "update", payload),
    };
  }

  const client = { rpc, from };

  return {
    client,
    tables,
    rpcCalls,
    rpcsNamed: (name) => rpcCalls.filter((c) => c.name === name),
    rows: (table) => tables.get(table) ?? [],
  };
}
