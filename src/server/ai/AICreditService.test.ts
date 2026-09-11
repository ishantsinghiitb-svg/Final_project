import { describe, expect, it, vi } from "vitest";
import { AICreditService } from "./AICreditService";
import { AI_CAPABILITIES } from "@/features/ai/constants";
import type { ServerSupabase } from "@/server/supabase";

// ── AICreditService.refund contract (Module 13 · Phase 2 · A1) ──
//
// `refund_ai_credit` moved from a client-suppliable (capability, cost) pair
// to a single ai_run_id, with ownership / refundable-state / already-
// refunded checks enforced in the SECURITY DEFINER function itself (see
// migration 20260824000001_module13_secure_ai_credit_refund.sql). These
// tests pin the TypeScript side of that contract: the method sends nothing
// but the run id, and it faithfully propagates — never swallows or
// reinterprets as success — whatever the RPC rejects with. The SQL rules
// themselves (ownership, state, replay) can only be fully proven against a
// real Postgres; there is no local Supabase instance in this repo to run
// that against (same limitation noted in every other migration here), so
// this is the honest boundary for a unit test: verify the service layer
// treats every RPC-level rejection as a rejection.

function fakeSb(
  rpcImpl: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>,
): ServerSupabase {
  return { rpc: vi.fn(rpcImpl) } as unknown as ServerSupabase;
}

const SUCCESS_ROW = { plan: "free", credits_total: 5, credits_used: 0, credits_remaining: 5 };

// ── B1: the free AI credit allowance can no longer be caller-supplied ──
//
// `ensure_ai_usage`/`consume_ai_credit` moved from a client-suppliable
// `p_credits_total` (any authenticated caller could self-grant an inflated
// allowance by calling the RPC directly, before this service was ever
// involved — see migration
// 20260831000001_module13_secure_ai_free_credit_allowance.sql) to a
// hardcoded server-side constant. These tests pin the TypeScript side of
// that contract: the service sends no allowance argument at all — there is
// nothing left for a compromised/malicious caller of THIS layer to inflate.
// The actual self-grant prevention (the RPC no longer HAVING an allowance
// parameter to send in the first place, and the old vulnerable signatures
// being dropped) is enforced in Postgres and can only be fully proven
// against a real instance — the same honest boundary the refund tests below
// already note.
describe("AICreditService — free-credit allowance is never caller-supplied", () => {
  it("getStatus() calls ensure_ai_usage with no arguments — nothing to smuggle an allowance into", async () => {
    const rpc = vi.fn(async () => ({ data: SUCCESS_ROW, error: null }));
    const service = new AICreditService(fakeSb(rpc));

    await service.getStatus();

    expect(rpc).toHaveBeenCalledTimes(1);
    // toHaveBeenCalledWith asserts the EXACT argument list — a second
    // argument (e.g. a resurrected `{ p_credits_total: ... }`) would fail this.
    expect(rpc).toHaveBeenCalledWith("ensure_ai_usage");
  });

  it("consume() sends only the capability and its fixed cost — never an allowance", async () => {
    const rpc = vi.fn(async () => ({ data: { ok: true, ...SUCCESS_ROW }, error: null }));
    const service = new AICreditService(fakeSb(rpc));

    await service.consume(AI_CAPABILITIES.ATS_SCORE, 3);

    expect(rpc).toHaveBeenCalledTimes(1);
    // Deep-equal on the exact args object: an extra `p_credits_total` key
    // (or any other key) would fail this, not just get ignored.
    expect(rpc).toHaveBeenCalledWith("consume_ai_credit", {
      p_capability: AI_CAPABILITIES.ATS_SCORE,
      p_cost: 3,
    });
  });

  it("consume()'s cost always comes from the caller's own argument, never re-derived from an allowance", async () => {
    // Documents the actual trust boundary: `cost` always originates from the
    // fixed server-side capability registry (cap.creditCost), never from a
    // client — see every AIService.ts call site. This just proves the
    // service layer forwards exactly that cost, with no allowance alongside it.
    const rpc = vi.fn(async () => ({ data: { ok: false, ...SUCCESS_ROW }, error: null }));
    const service = new AICreditService(fakeSb(rpc));

    await service.consume(AI_CAPABILITIES.RESUME_MATCH, 1);

    expect(rpc).toHaveBeenCalledWith("consume_ai_credit", {
      p_capability: AI_CAPABILITIES.RESUME_MATCH,
      p_cost: 1,
    });
  });
});

describe("AICreditService.refund", () => {
  it("sends only the ai_run_id — never a client-chosen capability or cost", async () => {
    const rpc = vi.fn(async () => ({ data: SUCCESS_ROW, error: null }));
    const service = new AICreditService(fakeSb(rpc));

    await service.refund("run-123");

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("refund_ai_credit", { p_ai_run_id: "run-123" });
  });

  it("maps a successful refund to the credit status", async () => {
    const service = new AICreditService(fakeSb(async () => ({ data: SUCCESS_ROW, error: null })));

    const status = await service.refund("run-123");

    expect(status).toMatchObject({
      creditsTotal: 5,
      creditsUsed: 0,
      creditsRemaining: 5,
      featureLocked: false,
    });
  });

  it("throws — does not silently succeed — when the run belongs to another user", async () => {
    const service = new AICreditService(
      fakeSb(async () => ({
        data: null,
        error: { message: "ai run does not belong to caller" },
      })),
    );

    await expect(service.refund("someone-elses-run")).rejects.toMatchObject({
      message: expect.stringContaining("does not belong to caller"),
    });
  });

  it("throws when the run is not in a refundable state (e.g. a successful run)", async () => {
    const service = new AICreditService(
      fakeSb(async () => ({
        data: null,
        error: { message: "ai run is not in a refundable state" },
      })),
    );

    await expect(service.refund("run-that-succeeded")).rejects.toMatchObject({
      message: expect.stringContaining("not in a refundable state"),
    });
  });

  it("throws on a repeated/replayed refund of an already-refunded run", async () => {
    const service = new AICreditService(
      fakeSb(async () => ({
        data: null,
        error: { message: "ai run has already been refunded" },
      })),
    );

    await expect(service.refund("already-refunded-run")).rejects.toMatchObject({
      message: expect.stringContaining("already been refunded"),
    });
  });

  it("throws when the run id does not exist at all", async () => {
    const service = new AICreditService(
      fakeSb(async () => ({ data: null, error: { message: "ai run not found" } })),
    );

    await expect(service.refund("does-not-exist")).rejects.toMatchObject({
      message: expect.stringContaining("not found"),
    });
  });
});
