import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ServerSupabase } from "@/server/supabase";
import {
  RESUME_PARSE_RATE_LIMIT,
  checkResumeParseRateLimit,
  recordResumeParseSuccess,
} from "./ResumeParseRateLimit";

// ── Resume-parse rate limit / daily quota (Module 13 · Phase 2 · B2) ──
//
// The fake below mirrors the actual SQL in migration
// 20260827000001_module13_extension_parse_rate_limit.sql — same window
// reset, same day reset, same "burst check first, then daily quota" order,
// same "only an allowed call increments window_count, an over-limit call
// does not" behavior. This is a faithful behavioral simulation of the real
// atomic Postgres function, not just a canned response — see the same
// approach used for A1's refund replay test and B1's session-budget tests.

function fakeRateLimitSupabase(opts: { plan?: string; authenticated?: boolean } = {}) {
  const authenticated = opts.authenticated ?? true;
  const plan = opts.plan ?? "free";
  const state = {
    windowStartedAt: null as number | null,
    windowCount: 0,
    dayBucket: null as string | null,
    dayCount: 0,
  };

  const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
    if (!authenticated) return { data: null, error: { message: "authentication required" } };

    if (name === "check_resume_parse_rate_limit") {
      const now = Date.now();
      const windowMs = (args.p_window_seconds as number) * 1000;
      if (state.windowStartedAt === null || now - state.windowStartedAt >= windowMs) {
        state.windowStartedAt = now;
        state.windowCount = 0;
      }
      const today = new Date().toISOString().slice(0, 10);
      if (state.dayBucket !== today) {
        state.dayBucket = today;
        state.dayCount = 0;
      }

      if (state.windowCount >= (args.p_window_max as number)) {
        return { data: { ok: false, code: "rate_limited" }, error: null };
      }

      const dailyLimit =
        plan === "free" ? (args.p_daily_limit_free as number) : (args.p_daily_limit_paid as number);
      if (state.dayCount >= dailyLimit) {
        state.windowCount += 1;
        return { data: { ok: false, code: "daily_limit_reached", limit: dailyLimit }, error: null };
      }

      state.windowCount += 1;
      return { data: { ok: true, dailyRemaining: dailyLimit - state.dayCount }, error: null };
    }

    if (name === "record_resume_parse_success") {
      state.dayCount += 1;
      return { data: null, error: null };
    }

    throw new Error(`Unexpected rpc call: ${name}`);
  });

  return { sb: { rpc } as unknown as ServerSupabase, state, rpc };
}

beforeEach(() => {
  vi.useRealTimers();
});

describe("checkResumeParseRateLimit", () => {
  it("allows a free user within the daily limit", async () => {
    const { sb } = fakeRateLimitSupabase({ plan: "free" });
    const result = await checkResumeParseRateLimit(sb);
    expect(result).toMatchObject({ ok: true });
  });

  const TODAY = new Date().toISOString().slice(0, 10);

  it("rejects a free user once the daily limit is reached", async () => {
    const { sb, state } = fakeRateLimitSupabase({ plan: "free" });
    // Already exhausted today — dayBucket must be "today" too, otherwise the
    // fake's own day-rollover (mirroring the real SQL) would treat this as
    // a fresh day and reset the count right back to 0.
    state.dayBucket = TODAY;
    state.dayCount = RESUME_PARSE_RATE_LIMIT.dailyLimitFree;
    const result = await checkResumeParseRateLimit(sb);
    expect(result).toMatchObject({ ok: false, code: "daily_limit_reached", limit: 20 });
  });

  it("allows a paid user well past the free daily limit", async () => {
    const { sb, state } = fakeRateLimitSupabase({ plan: "paid" });
    state.dayBucket = TODAY;
    state.dayCount = RESUME_PARSE_RATE_LIMIT.dailyLimitFree + 5; // over the FREE limit
    const result = await checkResumeParseRateLimit(sb);
    expect(result).toMatchObject({ ok: true });
  });

  it("rejects a paid user once THEIR (substantially higher) daily limit is reached", async () => {
    const { sb, state } = fakeRateLimitSupabase({ plan: "paid" });
    state.dayBucket = TODAY;
    state.dayCount = RESUME_PARSE_RATE_LIMIT.dailyLimitPaid;
    const result = await checkResumeParseRateLimit(sb);
    expect(result).toMatchObject({
      ok: false,
      code: "daily_limit_reached",
      limit: RESUME_PARSE_RATE_LIMIT.dailyLimitPaid,
    });
  });

  it("never sends a client-controllable count or plan — only the four fixed config numbers", async () => {
    const { sb, rpc } = fakeRateLimitSupabase();
    await checkResumeParseRateLimit(sb);
    expect(rpc).toHaveBeenCalledWith("check_resume_parse_rate_limit", {
      p_window_seconds: RESUME_PARSE_RATE_LIMIT.windowSeconds,
      p_window_max: RESUME_PARSE_RATE_LIMIT.windowMax,
      p_daily_limit_free: RESUME_PARSE_RATE_LIMIT.dailyLimitFree,
      p_daily_limit_paid: RESUME_PARSE_RATE_LIMIT.dailyLimitPaid,
    });
    // No "count", "usage", "plan", or user-identifying field is ever sent —
    // the server derives identity from auth.uid() and plan from
    // user_ai_usage itself, never from the request.
    const sentArgs = rpc.mock.calls[0][1] as Record<string, unknown>;
    expect(Object.keys(sentArgs).sort()).toEqual(
      ["p_daily_limit_free", "p_daily_limit_paid", "p_window_max", "p_window_seconds"].sort(),
    );
  });

  it("throws (fails closed) when the caller is not authenticated", async () => {
    const { sb } = fakeRateLimitSupabase({ authenticated: false });
    await expect(checkResumeParseRateLimit(sb)).rejects.toBeTruthy();
  });

  it("rate-limits rapid repeated requests within the burst window", async () => {
    const { sb } = fakeRateLimitSupabase();
    const results = [];
    // windowMax + a few extra rapid-fire calls, well within windowSeconds.
    for (let i = 0; i < RESUME_PARSE_RATE_LIMIT.windowMax + 3; i++) {
      results.push(await checkResumeParseRateLimit(sb));
    }
    const allowed = results.filter((r) => r.ok);
    const limited = results.filter((r) => !r.ok && r.code === "rate_limited");
    expect(allowed).toHaveLength(RESUME_PARSE_RATE_LIMIT.windowMax);
    expect(limited).toHaveLength(3);
  });

  it("caps a batch of concurrently-issued requests at the burst limit, not one per request", async () => {
    // All calls share ONE counter on ONE fake client — the real RPC's row
    // lock (`SELECT ... FOR UPDATE` in one transaction per call) guarantees
    // the same serialization against a real concurrent Postgres load; this
    // proves the counting logic itself never lets more than windowMax
    // through regardless of how the calls are issued, not the DB's actual
    // lock behavior (that needs a real Postgres instance to prove directly —
    // out of reach for this repo's vitest-only test infra, same limitation
    // noted for B1's session-budget tests).
    const { sb, state } = fakeRateLimitSupabase();
    const calls = await Promise.all(
      Array.from({ length: RESUME_PARSE_RATE_LIMIT.windowMax + 5 }, () =>
        checkResumeParseRateLimit(sb),
      ),
    );
    const allowedCount = calls.filter((r) => r.ok).length;
    expect(allowedCount).toBeLessThanOrEqual(RESUME_PARSE_RATE_LIMIT.windowMax);
    expect(state.windowCount).toBeLessThanOrEqual(RESUME_PARSE_RATE_LIMIT.windowMax);
  });
});

describe("recordResumeParseSuccess", () => {
  it("increments the daily count by exactly one", async () => {
    const { sb, state } = fakeRateLimitSupabase();
    await recordResumeParseSuccess(sb);
    expect(state.dayCount).toBe(1);
    await recordResumeParseSuccess(sb);
    expect(state.dayCount).toBe(2);
  });
});
