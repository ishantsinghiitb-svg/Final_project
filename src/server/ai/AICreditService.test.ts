import { describe, expect, it, vi } from "vitest";
import { AICreditService } from "./AICreditService";
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
