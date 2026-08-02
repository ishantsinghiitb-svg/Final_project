import { describe, expect, it, vi } from "vitest";
import type { AuthedContext } from "@/server/supabase";
import {
  createFakeRecommendationsSupabase,
  type FakeRecommendationsSeed,
} from "./testing/fakeRecommendationsSupabase";

// ── RecommendationsService: the safety invariant (Module 8B) ──
//
// The one fact this module is built around: a recommendation can only ever
// carry a number or a name that was already verified server-side, before
// the AI was called (see features/recommendations/candidates.ts). These
// tests assert that invariant survives every failure mode — a hallucinated
// number, a provider outage — by checking the ACTUAL returned item text and
// `source`, not just that a response came back `ok: true`.
//
// WHAT IS STUBBED: the provider (no network, no spend) and the capability
// registry entry (avoids the real config/env dependency).
// WHAT IS REAL: the fake Supabase's query shape (any unexpected table access
// throws — see fakeRecommendationsSupabase.ts), the Module 8A compute
// functions, the detector registry, the prompt builder, and the guardrail.

const complete = vi.fn();

vi.mock("@/features/ai/capabilities", () => ({
  getCapability: () => ({
    id: "recommendations",
    provider: "openai",
    model: "test-model",
    promptId: "recommendations",
    promptVersion: "test-v1",
    analysisVersion: "test-v1",
  }),
}));

vi.mock("./providers", () => ({ getProvider: () => ({ complete }) }));

const { getAIRecommendations } = await import("./RecommendationsService");

const USER_ID = "user-1";

function authedWith(seed: FakeRecommendationsSeed): {
  authed: AuthedContext;
  runInserts: Record<string, unknown>[];
} {
  const fake = createFakeRecommendationsSupabase(seed);
  const authed = {
    supabase: fake.client,
    user: { id: USER_ID },
    accessToken: "token",
  } as unknown as AuthedContext;
  return { authed, runInserts: fake.runInserts };
}

/** Two significant resumes with a 30pt interview-rate gap — the one detector this suite exercises end to end. */
function resumePerformanceSeed(): FakeRecommendationsSeed {
  const applications: Record<string, unknown>[] = [];
  const interviews: Record<string, unknown>[] = [];
  for (let i = 0; i < 20; i++) {
    applications.push({
      id: `r1-app-${i}`,
      resume_id: "r1",
      status: "applied",
      applied_at: "2020-01-01T00:00:00Z",
    });
  }
  for (let i = 0; i < 20; i++) {
    applications.push({
      id: `r2-app-${i}`,
      resume_id: "r2",
      status: "applied",
      applied_at: "2020-01-01T00:00:00Z",
    });
  }
  for (let i = 0; i < 10; i++) {
    interviews.push({
      id: `iv-r1-${i}`,
      application_id: `r1-app-${i}`,
      status: "completed",
      scheduled_at: "2020-02-01T00:00:00Z",
      company_name: "Acme",
    });
  }
  for (let i = 0; i < 4; i++) {
    interviews.push({
      id: `iv-r2-${i}`,
      application_id: `r2-app-${i}`,
      status: "completed",
      scheduled_at: "2020-02-01T00:00:00Z",
      company_name: "Acme",
    });
  }
  return {
    applications,
    interviews,
    resumes: [
      { id: "r1", name: "Product Resume" },
      { id: "r2", name: "General Resume" },
    ],
    profile: { id: USER_ID, goal_applications: null, goal_interviews: null, goal_offers: null },
  };
}

/** Builds on resumePerformanceSeed() to also qualify resume_linking, mock_interview, and ats_improvement — 4 candidates total, proving the engine no longer caps at 3. */
function multiCandidateSeed(): FakeRecommendationsSeed {
  const base = resumePerformanceSeed();
  const unlinkedApplications = Array.from({ length: 3 }, (_, i) => ({
    id: `unlinked-app-${i}`,
    resume_id: null,
    status: "applied",
    applied_at: "2020-01-01T00:00:00Z",
  }));

  return {
    ...base,
    applications: [...(base.applications ?? []), ...unlinkedApplications],
    mockSessions: [
      {
        report: {
          competencyScores: [
            { competencyId: "behavioral", label: "Behavioral", score: 90 },
            { competencyId: "product_sense", label: "Product Sense", score: 60 },
          ],
        },
      },
      {
        report: {
          competencyScores: [
            { competencyId: "behavioral", label: "Behavioral", score: 88 },
            { competencyId: "product_sense", label: "Product Sense", score: 55 },
          ],
        },
      },
    ],
    atsRows: [
      { resume_id: "r1", score: 60, created_at: "2026-01-01T00:00:00Z" },
      { resume_id: "r2", score: 75, created_at: "2026-02-01T00:00:00Z" },
    ],
  };
}

describe("getAIRecommendations", () => {
  it("returns no items and never calls the provider when no candidate qualifies", async () => {
    const { authed } = authedWith({ profile: { id: USER_ID } });
    complete.mockClear();

    const result = await getAIRecommendations(authed);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.items).toEqual([]);
    expect(complete).not.toHaveBeenCalled();
  });

  it("uses the AI's phrasing when it only states the given numbers and names", async () => {
    const { authed, runInserts } = authedWith(resumePerformanceSeed());
    complete.mockClear();
    complete.mockResolvedValueOnce({
      raw: {
        items: [
          {
            type: "resume_performance",
            title: "Resume performance",
            explanation:
              "Your Product Resume has a 50% interview rate versus your General Resume, over 20 applications each.",
            action: "Use Product Resume for similar roles.",
          },
        ],
      },
      model: "test-model",
      usage: { inputTokens: 100, outputTokens: 50 },
    });

    const result = await getAIRecommendations(authed);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.items).toHaveLength(1);
    expect(result.items[0].source).toBe("ai");
    expect(result.items[0].explanation).toContain("Product Resume");

    const successRun = runInserts.find((r) => r.status === "success");
    expect(successRun).toBeTruthy();
    expect(successRun?.credits_charged).toBe(0);
  });

  it("falls back to the deterministic template when the AI invents a number", async () => {
    const { authed } = authedWith(resumePerformanceSeed());
    complete.mockClear();
    complete.mockResolvedValueOnce({
      raw: {
        items: [
          {
            type: "resume_performance",
            title: "Resume performance",
            explanation:
              "Your Product Resume has a 95% interview rate — far ahead of your General Resume.",
            action: "Use Product Resume for similar roles.",
          },
        ],
      },
      model: "test-model",
      usage: { inputTokens: 100, outputTokens: 50 },
    });

    const result = await getAIRecommendations(authed);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.items).toHaveLength(1);
    expect(result.items[0].source).toBe("template");
    // The template is built from real facts — it must never repeat the invented number.
    expect(result.items[0].explanation).not.toContain("95%");
  });

  it("falls back to templates for every qualifying candidate when the provider call fails", async () => {
    const { authed, runInserts } = authedWith(resumePerformanceSeed());
    complete.mockClear();
    complete.mockRejectedValue(new Error("provider unavailable"));

    const result = await getAIRecommendations(authed);

    // A provider outage must never surface as a visible error on the
    // Analytics page — every qualifying candidate already has real evidence,
    // so it still renders, just with its pre-written copy.
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.items).toHaveLength(1);
    expect(result.items[0].source).toBe("template");

    expect(runInserts.some((r) => r.status === "error")).toBe(true);
  });

  it("returns more than 3 items when more than 3 candidates qualify — no artificial cap", async () => {
    const { authed } = authedWith(multiCandidateSeed());
    complete.mockClear();
    // Provider failure keeps this test focused on the count, not on
    // constructing a precise 4-item AI payload — every item falls back to
    // its template, which is exactly as valid a proof that all 4 qualifying
    // candidates were returned, not just the first 3.
    complete.mockRejectedValue(new Error("provider unavailable"));

    const result = await getAIRecommendations(authed);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.items.length).toBeGreaterThan(3);
    expect(result.items.map((i) => i.type)).toEqual([
      "resume_performance",
      "mock_interview",
      "ats_improvement",
      "resume_linking",
    ]);
  });

  it("stamps generatedAt with the time of this call", async () => {
    const { authed } = authedWith({ profile: { id: USER_ID } });
    const before = Date.now();
    const result = await getAIRecommendations(authed);
    const after = Date.now();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const generatedAtMs = new Date(result.generatedAt).getTime();
    expect(generatedAtMs).toBeGreaterThanOrEqual(before);
    expect(generatedAtMs).toBeLessThanOrEqual(after);
  });
});
