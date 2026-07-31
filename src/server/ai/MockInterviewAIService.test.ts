import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeMockInterviewSupabase } from "./testing/fakeMockInterviewSupabase";

// ── MockInterviewAIService: the credit invariant (Module 7C) ──
//
// The one fact this module is built around: AICreditService.consume is
// called at EXACTLY ONE site in the whole service (inside
// startMockInterview). Every other exported function — submitAnswer above
// all, since it runs once per candidate answer in a 12-25 turn conversation —
// must never touch consume or refund. A silent regression here means either
// double-billing a single mock interview session, or (worse, silently)
// charging a "free" per-turn action. These tests assert on the FAKE
// SUPABASE'S rpc call log, not just the returned envelope, for the same
// reason AIService.test.ts does: the envelope can look right while the
// underlying charge is wrong.
//
// WHAT IS STUBBED — the outside edges, same posture as AIService.test.ts:
//   • the provider (no network, no spend)
//   • MockInterviewContext (resume/job/supplementary loading — its own
//     concern, not the credit/session state machine tested here)
//   • the three schemas, replaced with a trivial pass-through — these tests
//     assert money and session state, not output shape validation
//
// WHAT IS REAL: AICreditService, hashObject, withRetry, toResultCode,
// getInterviewerRole/resolveRoleFamily, and every query MockInterviewAIService
// itself makes (interviews / mock_interview_sessions / mock_interview_turns /
// ai_runs), run against the generic fake table store.

const complete = vi.fn();

vi.mock("@/features/ai/capabilities", () => ({
  getCapability: () => ({
    id: "mock_interview",
    label: "Mock Interview",
    provider: "openai",
    model: "test-model",
    tier: "reasoning",
    promptId: "mock_interview",
    promptVersion: "test-v1",
    analysisVersion: "test-v1",
    creditCost: 5,
    outputSchema: { safeParse: (d: unknown) => ({ success: true, data: d }) },
    cachePolicy: { enabled: false, ttlSeconds: null },
  }),
}));

vi.mock("./providers", () => ({
  getProvider: () => ({ complete }),
}));

vi.mock("./MockInterviewContext", () => ({
  loadResumeForMockInterview: vi.fn(async () => ({
    ok: true,
    resume: { structured: {}, rawText: "resume text", fileHash: "resume-hash" },
  })),
  loadJobForMockInterview: vi.fn(async () => ({
    ok: true,
    job: { jobHash: "job-hash", snapshot: {} },
  })),
  loadMockInterviewSupplementaryContext: vi.fn(async () => ({})),
}));

vi.mock("@/features/mock-interview/prompt", () => ({
  buildPlanPrompt: () => ({ system: "plan system", user: "plan user" }),
  buildTurnPrompt: () => ({ system: "turn system", user: "turn user" }),
  buildReportPrompt: () => ({ system: "report system", user: "report user" }),
}));

const passthroughSchema = { safeParse: (data: unknown) => ({ success: true, data }) };
vi.mock("@/features/mock-interview/schema", () => ({
  MockInterviewPlanSchema: passthroughSchema,
  MockInterviewTurnSchema: passthroughSchema,
  MockInterviewReportSchema: passthroughSchema,
}));

const { startMockInterview, submitAnswer } = await import("./MockInterviewAIService");

const INTERVIEW_ID = "interview-1";
const USER_ID = "user-1";

function seedInterview() {
  return {
    interviews: [
      {
        id: INTERVIEW_ID,
        resume_id: "resume-1",
        job_id: "job-1",
        company_name: "Acme",
        role: "Product Manager",
        type: "Hiring Manager",
        notes: null,
      },
    ],
  };
}

const VALID_PLAN = {
  internal: { strategyRationale: "grounded plan" },
  candidateProfile: {
    headline: "PM candidate",
    keyExperiences: [],
    provenStrengths: [],
    gapsToProbe: [],
    claimsToVerify: [],
  },
  interviewerBrief: {
    roleLabel: "Hiring Manager",
    style: "direct",
    priorities: [],
    depthExpectation: "deep",
  },
  competencyMap: [
    {
      id: "product_sense",
      label: "Product Sense",
      whyItMatters: "core",
      priority: "core",
      sampleAngles: [],
    },
    {
      id: "execution",
      label: "Execution",
      whyItMatters: "core",
      priority: "supporting",
      sampleAngles: [],
    },
  ],
  plannedArc: [],
  targetTurnRange: { min: 8, max: 20 },
  expectedDurationMinutes: 30,
  openingMessage: "Hi, thanks for joining. Let's start — tell me about a product you shipped.",
};

function turnDraft(overrides: Record<string, unknown> = {}) {
  return {
    internal: {
      answerEvaluation: {
        competencyId: "product_sense",
        score1to5: 4,
        signals: [],
        concerns: [],
        specificity: "high",
        evidenceQuality: "strong",
        structure: "clear",
        starCoverage: {},
        claimsMade: [],
        contradictionsWithEarlier: [],
      },
      whatIsEstablished: "",
      whatIsStillUnknown: "",
      optionsConsidered: [],
      decisionRationale: "",
    },
    rollingSummary: "Candidate described a product launch.",
    coverageUpdate: [{ competencyId: "product_sense", status: "covered" }],
    action: "follow_up",
    targetCompetencyId: "execution",
    referencesTurnIndex: null,
    shouldConclude: false,
    concludeReason: "",
    message: "Good — walk me through how you prioritized the roadmap.",
    ...overrides,
  };
}

beforeEach(() => {
  complete.mockReset();
});

function authedWith(fake: ReturnType<typeof createFakeMockInterviewSupabase>) {
  return { supabase: fake.client as never, user: { id: USER_ID } as never, accessToken: "token" };
}

describe("startMockInterview — the one charge site", () => {
  it("charges exactly 5 credits, once, on a fresh start", async () => {
    complete.mockResolvedValueOnce({
      raw: VALID_PLAN,
      model: "test-model",
      usage: { inputTokens: 100, outputTokens: 50 },
    });
    const fake = createFakeMockInterviewSupabase({ seed: seedInterview() });

    const result = await startMockInterview(authedWith(fake), {
      interviewId: INTERVIEW_ID,
      clientKey: "client-key-1",
      interviewerRole: "hiring_manager",
    });

    expect(result.ok).toBe(true);
    const consumeCalls = fake.rpcsNamed("consume_ai_credit");
    expect(consumeCalls).toHaveLength(1);
    expect(consumeCalls[0].args.p_cost).toBe(5);
    expect(fake.rpcsNamed("refund_ai_credit")).toHaveLength(0);

    const sessions = fake.rows("mock_interview_sessions");
    expect(sessions).toHaveLength(1);
    expect(sessions[0].credits_charged).toBe(5);
    expect(sessions[0].status).toBe("active");

    const turns = fake.rows("mock_interview_turns");
    expect(turns).toHaveLength(1);
    expect(turns[0].turn_index).toBe(0);
    expect(turns[0].interviewer_message).toBe(VALID_PLAN.openingMessage);
  });

  it("returns the SAME session and charges only once when the same client_key is retried", async () => {
    complete.mockResolvedValueOnce({
      raw: VALID_PLAN,
      model: "test-model",
      usage: { inputTokens: 100, outputTokens: 50 },
    });
    const fake = createFakeMockInterviewSupabase({ seed: seedInterview() });

    const first = await startMockInterview(authedWith(fake), {
      interviewId: INTERVIEW_ID,
      clientKey: "same-key",
      interviewerRole: "hiring_manager",
    });
    const second = await startMockInterview(authedWith(fake), {
      interviewId: INTERVIEW_ID,
      clientKey: "same-key",
      interviewerRole: "hiring_manager",
    });

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (first.ok && second.ok) {
      expect(second.start.session.id).toBe(first.start.session.id);
    }
    // The provider (and therefore the charge) only ran for the first request.
    expect(complete).toHaveBeenCalledTimes(1);
    expect(fake.rpcsNamed("consume_ai_credit")).toHaveLength(1);
    expect(fake.rows("mock_interview_sessions")).toHaveLength(1);
  });

  it("refunds and creates no session when the planning call fails", async () => {
    complete.mockRejectedValue(new Error("provider exploded"));
    const fake = createFakeMockInterviewSupabase({ seed: seedInterview() });

    const result = await startMockInterview(authedWith(fake), {
      interviewId: INTERVIEW_ID,
      clientKey: "client-key-fail",
      interviewerRole: "hiring_manager",
    });

    expect(result.ok).toBe(false);
    expect(fake.rpcsNamed("consume_ai_credit")).toHaveLength(1);
    expect(fake.rpcsNamed("refund_ai_credit")).toHaveLength(1);
    expect(fake.rows("mock_interview_sessions")).toHaveLength(0);
    expect(fake.rows("mock_interview_turns")).toHaveLength(0);
  });

  it("rejects an interviewer role that isn't in the catalogue, before charging anything", async () => {
    const fake = createFakeMockInterviewSupabase({ seed: seedInterview() });
    const result = await startMockInterview(authedWith(fake), {
      interviewId: INTERVIEW_ID,
      clientKey: "client-key-bad-role",
      interviewerRole: "not_a_real_role",
    });
    expect(result.ok).toBe(false);
    expect(fake.rpcsNamed("consume_ai_credit")).toHaveLength(0);
  });
});

describe("submitAnswer — never touches credits", () => {
  async function seededActiveSession() {
    complete.mockResolvedValueOnce({
      raw: VALID_PLAN,
      model: "test-model",
      usage: { inputTokens: 100, outputTokens: 50 },
    });
    const fake = createFakeMockInterviewSupabase({ seed: seedInterview() });
    const started = await startMockInterview(authedWith(fake), {
      interviewId: INTERVIEW_ID,
      clientKey: "client-key-live",
      interviewerRole: "hiring_manager",
    });
    if (!started.ok) throw new Error("setup failed");
    return { fake, sessionId: started.start.session.id };
  }

  it("never calls consume or refund when processing an answer", async () => {
    const { fake, sessionId } = await seededActiveSession();
    // Baseline AFTER setup — starting the session itself legitimately charges
    // once; the assertion below is that submitAnswer adds NO further charges.
    const consumeBefore = fake.rpcsNamed("consume_ai_credit").length;
    expect(consumeBefore).toBe(1);

    complete.mockResolvedValueOnce({
      raw: turnDraft(),
      model: "test-model",
      usage: { inputTokens: 40, outputTokens: 30 },
    });

    const result = await submitAnswer(authedWith(fake), {
      sessionId,
      turnIndex: 0,
      answer: "I shipped a referral flow that grew signups 12%.",
      inputMode: "text",
    });

    expect(result.ok).toBe(true);
    expect(fake.rpcsNamed("consume_ai_credit")).toHaveLength(consumeBefore);
    expect(fake.rpcsNamed("refund_ai_credit")).toHaveLength(0);

    const turns = fake.rows("mock_interview_turns");
    expect(turns).toHaveLength(2);
    expect(turns[0].candidate_answer).toContain("referral flow");
    expect(turns[1].turn_index).toBe(1);
  });

  it("replays the same result idempotently for a duplicate submission, without a second provider call", async () => {
    const { fake, sessionId } = await seededActiveSession();
    complete.mockResolvedValueOnce({
      raw: turnDraft(),
      model: "test-model",
      usage: { inputTokens: 40, outputTokens: 30 },
    });

    const first = await submitAnswer(authedWith(fake), {
      sessionId,
      turnIndex: 0,
      answer: "First answer.",
      inputMode: "text",
    });
    expect(first.ok).toBe(true);
    expect(complete).toHaveBeenCalledTimes(2); // 1 for start's plan, 1 for this turn

    const second = await submitAnswer(authedWith(fake), {
      sessionId,
      turnIndex: 0,
      answer: "First answer.",
      inputMode: "text",
    });

    expect(second.ok).toBe(true);
    if (first.ok && second.ok) {
      expect(second.submission.nextTurn?.id).toBe(first.submission.nextTurn?.id);
    }
    // No new provider call for the replay, and no credit activity from either submission.
    expect(complete).toHaveBeenCalledTimes(2);
    expect(fake.rpcsNamed("consume_ai_credit")).toHaveLength(1); // only the setup's Start
    expect(fake.rpcsNamed("refund_ai_credit")).toHaveLength(0);
    expect(fake.rows("mock_interview_turns")).toHaveLength(2);
  });

  it("forces conclusion once shouldConclude is true and the target range floor is met", async () => {
    const { fake, sessionId } = await seededActiveSession();
    complete.mockResolvedValueOnce({
      raw: turnDraft({
        shouldConclude: true,
        message: "That's everything I needed — thanks for your time.",
      }),
      model: "test-model",
      usage: { inputTokens: 40, outputTokens: 30 },
    });

    // Fast-forward the session's turn_count past targetTurnRange.min (8) so the
    // floor guard doesn't override shouldConclude.
    const sessionRow = fake.rows("mock_interview_sessions")[0];
    sessionRow.turn_count = 8;

    const result = await submitAnswer(authedWith(fake), {
      sessionId,
      turnIndex: 0,
      answer: "Final answer.",
      inputMode: "text",
    });

    expect(result.ok).toBe(true);
    const updatedSession = fake.rows("mock_interview_sessions")[0];
    expect(updatedSession.status).toBe("concluded");
    expect(updatedSession.ended_reason).toBe("ai_concluded");
  });
});
