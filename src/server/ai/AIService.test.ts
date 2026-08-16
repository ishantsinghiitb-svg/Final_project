import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createFakeSupabase, type FakeSupabaseOptions } from "./testing/fakeSupabase";

// ── AI engine: credit, cache and audit behaviour (Module 6 freeze) ──
//
// These are the flows where a silent regression costs the user real money or
// real trust: charging twice, charging for a cached result, keeping a credit
// after a failure, or writing an audit row that misreports any of the above.
// The AI Hub reads that audit row, so a wrong `cache_hit` / `credits_charged`
// is also a wrong cost shown back to the user.
//
// WHAT IS STUBBED — only the outside edges:
//   • the provider (no network, no spend)
//   • the context builder and prompt renderer (so a frozen prompt's TEXT can
//     change without breaking a credits test — these assert money, not wording)
//   • the capability registry (a tiny schema, so a frozen output schema can
//     change without breaking a credits test either)
//
// WHAT IS REAL — everything the money path actually runs through:
//   AICreditService (the consume/refund RPCs), withRetry, toResultCode, the
//   cache read/write query shapes, and logRun.
//
// These tests assert BEHAVIOUR THAT ALREADY EXISTS. They were written during
// the freeze to lock it in; none of them drove a change to the engine.

const CAPABILITY = "resume_match";
const CREDIT_COST = 1;

// A trivially satisfiable stand-in for the frozen capability schemas.
const StubSchema = z.object({ ok: z.boolean() });
const VALID_OUTPUT = { ok: true };

const stubCapability = {
  id: CAPABILITY,
  label: "Resume Match",
  provider: "openai",
  model: "test-model",
  tier: "reasoning",
  promptId: CAPABILITY,
  promptVersion: "test-prompt-v1",
  analysisVersion: "test-analysis-v1",
  creditCost: CREDIT_COST,
  outputSchema: StubSchema,
  cachePolicy: { enabled: true, ttlSeconds: null },
};

const complete = vi.fn();

vi.mock("@/features/ai/capabilities", () => ({
  getCapability: () => stubCapability,
}));

vi.mock("./providers", () => ({
  getProvider: () => ({ complete }),
}));

vi.mock("./PromptManager", () => ({
  buildPrompt: () => ({ system: "system prompt", user: "user prompt" }),
}));

vi.mock("./ContextBuilder", () => ({
  ContextBuilder: class {
    async buildUserContext() {
      return { userId: "user-1" };
    }
    async buildResumeContext() {
      return { resumeId: "resume-1", fileHash: "resume-hash", structured: {}, rawText: "" };
    }
    async buildJobContext() {
      return { jobId: "job-1", jobHash: "job-hash", snapshot: {} };
    }
  },
}));

// Imported after the mocks so they are in place when the module graph loads.
const { runCapability } = await import("./AIService");

function run(fake: ReturnType<typeof createFakeSupabase>, forceRefresh = false) {
  return runCapability({
    capability: CAPABILITY as never,
    authed: {
      supabase: fake.client as never,
      user: { id: "user-1" } as never,
    } as never,
    resumeId: "resume-1",
    jobId: "job-1",
    forceRefresh,
  });
}

function setup(options: FakeSupabaseOptions = {}) {
  return createFakeSupabase(options);
}

beforeEach(() => {
  vi.clearAllMocks();
  complete.mockResolvedValue({
    raw: VALID_OUTPUT,
    usage: { inputTokens: 100, outputTokens: 50 },
  });
});

describe("credits are deducted exactly once per generation", () => {
  it("charges one credit for a successful fresh run and never refunds it", async () => {
    const fake = setup();

    const result = await run(fake);

    expect(result.ok).toBe(true);
    const consumes = fake.rpcsNamed("consume_ai_credit");
    expect(consumes).toHaveLength(1);
    expect(consumes[0].args).toMatchObject({ p_capability: CAPABILITY, p_cost: CREDIT_COST });
    expect(fake.rpcsNamed("refund_ai_credit")).toHaveLength(0);
  });

  it("charges once — not per attempt — when the provider succeeds on a retry", async () => {
    const fake = setup();
    // A transient provider failure, then success. The charge happens BEFORE the
    // provider call, so a bug that moved it inside the retry loop would show up
    // here as two charges for one generation.
    complete
      .mockRejectedValueOnce(new Error("transient provider blip"))
      .mockResolvedValueOnce({ raw: VALID_OUTPUT, usage: { inputTokens: 1, outputTokens: 1 } });

    const result = await run(fake);

    expect(result.ok).toBe(true);
    expect(complete).toHaveBeenCalledTimes(2);
    expect(fake.rpcsNamed("consume_ai_credit")).toHaveLength(1);
    expect(fake.rpcsNamed("refund_ai_credit")).toHaveLength(0);
  });

  it("does not re-call the provider when the response fails schema validation", async () => {
    const fake = setup();
    complete.mockResolvedValue({ raw: { wrong: "shape" }, usage: {} });

    const result = await run(fake);

    // Deliberate existing behaviour: AIValidationError is non-retryable, so the
    // engine gives up after ONE provider call rather than paying for a second
    // that would be given the identical prompt. Locked in here because the
    // `attempts: 2` at the call site reads as though it would retry this case.
    expect(result.ok).toBe(false);
    expect(complete).toHaveBeenCalledTimes(1);
    expect(fake.rpcsNamed("consume_ai_credit")).toHaveLength(1);
    expect(fake.rpcsNamed("refund_ai_credit")).toHaveLength(1);
  });

  it("does not call the provider at all when credits are exhausted", async () => {
    const fake = setup({
      consumeResults: [{ ok: false, credits_total: 5, credits_used: 5 }],
    });

    const result = await run(fake);

    expect(result.ok).toBe(false);
    expect(result.code).toBe("ai_limit_reached");
    expect(complete).not.toHaveBeenCalled();
    // Nothing was charged, so nothing may be refunded.
    expect(fake.rpcsNamed("refund_ai_credit")).toHaveLength(0);
  });
});

describe("a cache hit costs nothing", () => {
  it("serves the cached response without consuming a credit", async () => {
    const fake = setup({ cacheRow: { response: VALID_OUTPUT, expires_at: null } });

    const result = await run(fake);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual(VALID_OUTPUT);
      expect(result.meta.cacheHit).toBe(true);
    }
    expect(fake.rpcsNamed("consume_ai_credit")).toHaveLength(0);
    expect(complete).not.toHaveBeenCalled();
  });

  it("bypasses the cache and charges when forceRefresh is set", async () => {
    const fake = setup({ cacheRow: { response: VALID_OUTPUT, expires_at: null } });

    const result = await run(fake, true);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.meta.cacheHit).toBe(false);
    expect(complete).toHaveBeenCalledTimes(1);
    expect(fake.rpcsNamed("consume_ai_credit")).toHaveLength(1);
  });

  it("treats an expired cache row as a miss", async () => {
    const expired = new Date(Date.now() - 60_000).toISOString();
    const fake = setup({ cacheRow: { response: VALID_OUTPUT, expires_at: expired } });

    const result = await run(fake);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.meta.cacheHit).toBe(false);
    expect(fake.rpcsNamed("consume_ai_credit")).toHaveLength(1);
  });
});

describe("a failed generation refunds the credit", () => {
  it("refunds when the provider throws", async () => {
    const fake = setup();
    complete.mockRejectedValue(new Error("provider exploded"));

    const result = await run(fake);

    expect(result.ok).toBe(false);
    expect(fake.rpcsNamed("consume_ai_credit")).toHaveLength(1);
    const refunds = fake.rpcsNamed("refund_ai_credit");
    expect(refunds).toHaveLength(1);
    // The refund is scoped to a specific ai_runs row — never a client-chosen
    // capability/cost pair (that RPC signature no longer exists at all).
    expect(refunds[0].args).not.toHaveProperty("p_cost");
    expect(refunds[0].args).not.toHaveProperty("p_capability");
    expect(typeof refunds[0].args.p_ai_run_id).toBe("string");
    // The amount actually reversed is derived from that row's own
    // credits_charged (set by refund_ai_credit itself), never overstated.
    const logged = fake.runLogs()[0];
    expect(logged.id).toBe(refunds[0].args.p_ai_run_id);
    expect(logged.credits_charged).toBe(0);
    expect(logged.refunded_at).toEqual(expect.any(String));
  });

  it("refunds when every attempt returns an unparseable response", async () => {
    const fake = setup();
    complete.mockResolvedValue({ raw: { wrong: "shape" }, usage: {} });

    const result = await run(fake);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("validation_error");
    expect(fake.rpcsNamed("refund_ai_credit")).toHaveLength(1);
  });

  it("reports creditsRefunded so the UI may say 'no credit was used'", async () => {
    const fake = setup();
    complete.mockRejectedValue(new Error("provider exploded"));

    const result = await run(fake);

    expect(result.ok).toBe(false);
    if (!result.ok && result.code !== "ai_limit_reached") {
      expect(result.creditsRefunded).toBe(true);
    }
  });

  it("leaves creditsRefunded undefined when the refund could not be confirmed", async () => {
    // Every refund attempt fails, so the engine must NOT claim the run was free.
    const fake = setup({ refundFailures: 99 });
    complete.mockRejectedValue(new Error("provider exploded"));

    const result = await run(fake);

    expect(result.ok).toBe(false);
    if (!result.ok && result.code !== "ai_limit_reached") {
      expect(result.creditsRefunded).toBeUndefined();
    }
  });
});

describe("the refund retries before giving up", () => {
  it("retries a failing refund RPC until it succeeds", async () => {
    // The first two refund calls fail; the third succeeds. There is no
    // user-facing retry for "my credit wasn't given back", which is why this
    // path retries at all.
    const fake = setup({ refundFailures: 2 });
    complete.mockRejectedValue(new Error("provider exploded"));

    const result = await run(fake);

    expect(result.ok).toBe(false);
    expect(fake.rpcsNamed("refund_ai_credit")).toHaveLength(3);
    if (!result.ok && result.code !== "ai_limit_reached") {
      expect(result.creditsRefunded).toBe(true);
    }
  });

  it("refunds the charge exactly once overall, not once per retry attempt", async () => {
    const fake = setup({ refundFailures: 1 });
    complete.mockRejectedValue(new Error("provider exploded"));

    await run(fake);

    // Two calls: one failed, one succeeded. Both reference the SAME ai_runs
    // row — a retry must never create a second charge to refund.
    const refunds = fake.rpcsNamed("refund_ai_credit");
    expect(refunds).toHaveLength(2);
    const runIds = new Set(refunds.map((r) => r.args.p_ai_run_id));
    expect(runIds.size).toBe(1);
    expect(fake.runLogs()).toHaveLength(1);
  });

  it("does not restore credits when a refund is replayed for an already-refunded run", async () => {
    // Simulates a raw, out-of-band replay of the RPC call for the same
    // ai_run_id (e.g. a malicious direct `supabase.rpc(...)` call) — the fake
    // enforces the same "already refunded" rule the real migration does.
    const fake = setup();
    complete.mockRejectedValue(new Error("provider exploded"));

    await run(fake);
    const runId = fake.runLogs()[0].id as string;

    // A second, independent refund attempt for the same run must be
    // rejected rather than crediting the user twice.
    const rawClient = fake.client as {
      rpc: (
        name: string,
        args: Record<string, unknown>,
      ) => Promise<{ data: unknown; error: { message: string } | null }>;
    };
    const replay = await rawClient.rpc("refund_ai_credit", { p_ai_run_id: runId });
    expect(replay.error?.message).toMatch(/already been refunded/);
  });
});

describe("every run is written to the audit log", () => {
  it("logs a fresh success with the credit it charged", async () => {
    const fake = setup();

    await run(fake);

    const logs = fake.runLogs();
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      user_id: "user-1",
      capability: CAPABILITY,
      status: "success",
      cache_hit: false,
      credits_charged: CREDIT_COST,
      resume_id: "resume-1",
      job_id: "job-1",
      input_tokens: 100,
      output_tokens: 50,
    });
  });

  it("logs a cache hit as costing zero", async () => {
    const fake = setup({ cacheRow: { response: VALID_OUTPUT, expires_at: null } });

    await run(fake);

    const logs = fake.runLogs();
    expect(logs).toHaveLength(1);
    // The AI Hub reads exactly these two fields to tell the user a result was
    // reused for free — if they disagree with reality, the Hub lies about cost.
    expect(logs[0]).toMatchObject({ status: "success", cache_hit: true, credits_charged: 0 });
  });

  it("logs a failure as costing zero, since the credit was refunded", async () => {
    const fake = setup();
    complete.mockRejectedValue(new Error("provider exploded"));

    await run(fake);

    const logs = fake.runLogs();
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ status: "error", cache_hit: false, credits_charged: 0 });
    expect(logs[0].error_code).toBe("unknown_error");
  });

  it("logs an exhausted-credits run without charging", async () => {
    const fake = setup({ consumeResults: [{ ok: false, credits_total: 5, credits_used: 5 }] });

    await run(fake);

    const logs = fake.runLogs();
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ status: "limit_reached", credits_charged: 0 });
  });

  it("records the capability's prompt and analysis versions", async () => {
    const fake = setup();

    await run(fake);

    expect(fake.runLogs()[0]).toMatchObject({
      prompt_version: "test-prompt-v1",
      analysis_version: "test-analysis-v1",
      model: "test-model",
      provider: "openai",
    });
  });
});

describe("cache write and read", () => {
  it("writes the validated response under the full version-scoped key", async () => {
    const fake = setup();

    await run(fake);

    const writes = fake.upserts.filter((u) => u.table === "ai_cache");
    expect(writes).toHaveLength(1);
    // Every component of the key must be present: dropping any one of them
    // would let a stale result survive a prompt or model change.
    expect(writes[0].values).toMatchObject({
      user_id: "user-1",
      capability: CAPABILITY,
      prompt_version: "test-prompt-v1",
      analysis_version: "test-analysis-v1",
      model: "test-model",
      job_hash: "job-hash",
      response: VALID_OUTPUT,
    });
    expect(writes[0].values.input_hash).toEqual(expect.any(String));
  });

  it("reuses the response it wrote when the same run repeats", async () => {
    const first = setup();
    await run(first);
    const written = first.upserts.find((u) => u.table === "ai_cache")!.values;

    // Replay that exact row back as an existing cache entry.
    const second = setup({
      cacheRow: { response: written.response, expires_at: null },
    });
    const result = await run(second);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual(VALID_OUTPUT);
      expect(result.meta.cacheHit).toBe(true);
    }
    expect(second.upserts.filter((u) => u.table === "ai_cache")).toHaveLength(0);
  });

  it("does not write to the cache when the run failed", async () => {
    const fake = setup();
    complete.mockRejectedValue(new Error("provider exploded"));

    await run(fake);

    expect(fake.upserts.filter((u) => u.table === "ai_cache")).toHaveLength(0);
  });

  it("refunds rather than charging when the cache read itself fails", async () => {
    // A broken cache read must not silently become a paid fresh call with no
    // cache write — it throws before the charge, so nothing is consumed.
    const fake = setup({ cacheReadError: { message: "select failed" } });

    const result = await run(fake);

    expect(result.ok).toBe(false);
    expect(fake.rpcsNamed("consume_ai_credit")).toHaveLength(0);
    expect(fake.rpcsNamed("refund_ai_credit")).toHaveLength(0);
  });
});
