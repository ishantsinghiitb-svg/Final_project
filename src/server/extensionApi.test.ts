import { beforeEach, describe, expect, it, vi } from "vitest";

// ── /api/extension/parse-resume handler (Module 13 · Phase 2 · B2) ──
//
// requireUser, parseResumeForUser, and the rate-limit module are mocked at
// the boundary — this file tests the HANDLER's own logic (auth gate order,
// rate-limit gate order, "only a genuine success records usage", response
// shapes), not the AI/parsing/rate-limit internals those modules already
// have their own dedicated tests for.

const requireUser = vi.fn();
vi.mock("@/server/supabase", () => ({
  requireUser: (...args: unknown[]) => requireUser(...args),
}));

const parseResumeForUser = vi.fn();
vi.mock("@/server/ai/ResumeUpload", () => ({
  parseResumeForUser: (...args: unknown[]) => parseResumeForUser(...args),
}));

const analyzeResumeMatch = vi.fn();
vi.mock("@/server/ai/ResumeMatchService", () => ({
  analyzeResumeMatch: (...args: unknown[]) => analyzeResumeMatch(...args),
}));

const checkResumeParseRateLimit = vi.fn();
const recordResumeParseSuccess = vi.fn();
vi.mock("@/server/ai/ResumeParseRateLimit", () => ({
  checkResumeParseRateLimit: (...args: unknown[]) => checkResumeParseRateLimit(...args),
  recordResumeParseSuccess: (...args: unknown[]) => recordResumeParseSuccess(...args),
}));

const { handleExtensionApiRequest } = await import("./extensionApi");

const AUTHED = { supabase: { fake: "client" }, user: { id: "user-1" }, accessToken: "tok" };

function postParseResume(body: Record<string, unknown>): Request {
  return new Request("http://localhost/api/extension/parse-resume", {
    method: "POST",
    headers: { origin: "chrome-extension://abc123", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  requireUser.mockResolvedValue(AUTHED);
  checkResumeParseRateLimit.mockResolvedValue({ ok: true, dailyRemaining: 19 });
  parseResumeForUser.mockResolvedValue({
    ok: true,
    reused: false,
    parseStatus: "ready",
    health: {},
  });
});

describe("POST /api/extension/parse-resume", () => {
  it("1. an authenticated legitimate request succeeds", async () => {
    const res = await handleExtensionApiRequest(
      postParseResume({ accessToken: "tok", resumeId: "resume-1" }),
    );
    expect(res?.status).toBe(200);
    const body = await res?.json();
    expect(body).toMatchObject({ ok: true, reused: false });
    expect(parseResumeForUser).toHaveBeenCalledWith(AUTHED.supabase, AUTHED.user, "resume-1");
  });

  it("2. an unauthenticated request is rejected before the rate-limit gate or parsing ever run", async () => {
    requireUser.mockRejectedValue(new Error("invalid session"));
    const res = await handleExtensionApiRequest(
      postParseResume({ accessToken: "bad-token", resumeId: "resume-1" }),
    );
    expect(res?.status).toBe(401);
    expect(checkResumeParseRateLimit).not.toHaveBeenCalled();
    expect(parseResumeForUser).not.toHaveBeenCalled();
  });

  it("3. a free user within the daily limit succeeds", async () => {
    checkResumeParseRateLimit.mockResolvedValue({ ok: true, dailyRemaining: 5 });
    const res = await handleExtensionApiRequest(
      postParseResume({ accessToken: "tok", resumeId: "resume-1" }),
    );
    expect(res?.status).toBe(200);
    const body = await res?.json();
    expect(body.ok).toBe(true);
  });

  it("4. a free user over the daily limit is rejected with 429, before parsing runs", async () => {
    checkResumeParseRateLimit.mockResolvedValue({
      ok: false,
      code: "daily_limit_reached",
      limit: 20,
    });
    const res = await handleExtensionApiRequest(
      postParseResume({ accessToken: "tok", resumeId: "resume-1" }),
    );
    expect(res?.status).toBe(429);
    const body = await res?.json();
    expect(body).toMatchObject({ ok: false, code: "daily_limit_reached" });
    expect(parseResumeForUser).not.toHaveBeenCalled();
  });

  it("5. a paid user within their (higher) entitlement succeeds", async () => {
    // The handler doesn't need to know about "paid" itself — the gate
    // already resolved the plan-aware limit server-side and just says ok.
    checkResumeParseRateLimit.mockResolvedValue({ ok: true, dailyRemaining: 87 });
    const res = await handleExtensionApiRequest(
      postParseResume({ accessToken: "tok", resumeId: "resume-1" }),
    );
    expect(res?.status).toBe(200);
    expect(parseResumeForUser).toHaveBeenCalled();
  });

  it("6. a client attempting to send its own usage/count/plan fields has them ignored", async () => {
    // Nothing in the request body besides accessToken/resumeId is ever read
    // by the handler — extra fields a malicious client adds are inert.
    const res = await handleExtensionApiRequest(
      postParseResume({
        accessToken: "tok",
        resumeId: "resume-1",
        dailyRemaining: 999999,
        plan: "paid",
        usageCount: 0,
      }),
    );
    expect(res?.status).toBe(200);
    // The rate-limit check was still called with no per-request args at all.
    expect(checkResumeParseRateLimit).toHaveBeenCalledWith(AUTHED.supabase);
  });

  it("7. rapid repeated requests are rejected once the gate reports rate_limited", async () => {
    checkResumeParseRateLimit.mockResolvedValue({ ok: false, code: "rate_limited" });
    const res = await handleExtensionApiRequest(
      postParseResume({ accessToken: "tok", resumeId: "resume-1" }),
    );
    expect(res?.status).toBe(429);
    const body = await res?.json();
    expect(body).toMatchObject({ ok: false, code: "rate_limited" });
    expect(parseResumeForUser).not.toHaveBeenCalled();
  });

  it("8. concurrent requests all route through the same per-caller gate (no per-request bypass)", async () => {
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        handleExtensionApiRequest(postParseResume({ accessToken: "tok", resumeId: "resume-1" })),
      ),
    );
    expect(results.every((r) => r?.status === 200)).toBe(true);
    // Every single request — concurrent or not — went through the gate;
    // none of them skipped it.
    expect(checkResumeParseRateLimit).toHaveBeenCalledTimes(5);
  });

  it("9. an invalid/oversized file is rejected without recording usage", async () => {
    // Mirrors what A2's guards return on a rejected file — ok:false, no
    // charge-worthy success.
    parseResumeForUser.mockResolvedValue({
      ok: false,
      code: "parse_error",
      parseStatus: "failed",
      message: "Resume file is too large to parse (must be under 10 MB).",
    });
    const res = await handleExtensionApiRequest(
      postParseResume({ accessToken: "tok", resumeId: "resume-1" }),
    );
    expect(res?.status).toBe(200); // A2's shape: a structured failure, not an HTTP error
    const body = await res?.json();
    expect(body.ok).toBe(false);
    expect(recordResumeParseSuccess).not.toHaveBeenCalled();
  });

  it("a byte-identical cached reuse succeeds but does not record usage a second time", async () => {
    parseResumeForUser.mockResolvedValue({
      ok: true,
      reused: true,
      parseStatus: "ready",
      health: {},
    });
    const res = await handleExtensionApiRequest(
      postParseResume({ accessToken: "tok", resumeId: "resume-1" }),
    );
    expect(res?.status).toBe(200);
    expect(recordResumeParseSuccess).not.toHaveBeenCalled();
  });

  it("10. an existing valid extension resume parse still records usage exactly once", async () => {
    const res = await handleExtensionApiRequest(
      postParseResume({ accessToken: "tok", resumeId: "resume-1" }),
    );
    expect(res?.status).toBe(200);
    expect(recordResumeParseSuccess).toHaveBeenCalledTimes(1);
    expect(recordResumeParseSuccess).toHaveBeenCalledWith(AUTHED.supabase);
  });

  it("a failure to record usage after a real success still returns the successful parse to the caller", async () => {
    recordResumeParseSuccess.mockRejectedValue(new Error("transient db error"));
    const res = await handleExtensionApiRequest(
      postParseResume({ accessToken: "tok", resumeId: "resume-1" }),
    );
    expect(res?.status).toBe(200);
    const body = await res?.json();
    expect(body.ok).toBe(true);
  });

  it("an unexpected rate-limit-check error fails closed with a 500, never bypassing to parsing", async () => {
    checkResumeParseRateLimit.mockRejectedValue(new Error("db unavailable"));
    const res = await handleExtensionApiRequest(
      postParseResume({ accessToken: "tok", resumeId: "resume-1" }),
    );
    expect(res?.status).toBe(500);
    expect(parseResumeForUser).not.toHaveBeenCalled();
  });
});

// ── /api/extension/analyze-match handler ──
//
// The route behind the extension panel's "Analyze Match" button. Its 401
// body — {"ok":false,"message":"Not authenticated."} — is what the panel
// renders verbatim, so these pin down exactly when it is (and isn't) produced,
// and that identity always comes from the server-verified token.

function postAnalyzeMatch(body: Record<string, unknown>, origin = "chrome-extension://abc123") {
  return new Request("https://getofferlyst.com/api/extension/analyze-match", {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const MATCH_OK = {
  ok: true as const,
  analysis: { overallScore: 82, matchLabel: "Strong match" },
  cacheHit: false,
  credits: { creditsRemaining: 4 },
};

describe("POST /api/extension/analyze-match", () => {
  beforeEach(() => {
    analyzeResumeMatch.mockResolvedValue(MATCH_OK);
  });

  it("an authenticated request runs the analysis and returns score, label and credits", async () => {
    const res = await handleExtensionApiRequest(
      postAnalyzeMatch({ accessToken: "tok", resumeId: "resume-1", jobId: "job-1" }),
    );
    expect(res?.status).toBe(200);
    expect(await res?.json()).toEqual({
      ok: true,
      score: 82,
      label: "Strong match",
      creditsRemaining: 4,
    });
  });

  it("an expired or invalid access token is rejected with 401 before any analysis runs", async () => {
    requireUser.mockRejectedValue(new Error("Not authenticated: invalid session"));
    const res = await handleExtensionApiRequest(
      postAnalyzeMatch({ accessToken: "expired", resumeId: "resume-1", jobId: "job-1" }),
    );
    expect(res?.status).toBe(401);
    expect(await res?.json()).toEqual({ ok: false, message: "Not authenticated." });
    expect(analyzeResumeMatch).not.toHaveBeenCalled();
  });

  it("a missing access token is rejected without calling the AI engine", async () => {
    const res = await handleExtensionApiRequest(
      postAnalyzeMatch({ resumeId: "resume-1", jobId: "job-1" }),
    );
    expect(res?.status).toBe(400);
    expect(requireUser).not.toHaveBeenCalled();
    expect(analyzeResumeMatch).not.toHaveBeenCalled();
  });

  it("identity comes from the verified token — a client-supplied userId is ignored", async () => {
    await handleExtensionApiRequest(
      postAnalyzeMatch({
        accessToken: "tok",
        resumeId: "resume-1",
        jobId: "job-1",
        userId: "someone-else",
      }),
    );
    // The service receives the server-built authed context (its RLS-scoped
    // supabase client + verified user), never anything from the body.
    expect(requireUser).toHaveBeenCalledWith("tok");
    expect(analyzeResumeMatch).toHaveBeenCalledWith(AUTHED, "resume-1", "job-1", {
      forceRefresh: false,
    });
  });

  it("another user's resume id resolves to resume_not_found, never their analysis", async () => {
    // `analyzeResumeMatch` looks the resume up through the caller's own
    // RLS-scoped client (resumes_select_own), so a resume the caller does not
    // own simply isn't visible.
    analyzeResumeMatch.mockResolvedValue({
      ok: false,
      code: "resume_not_found",
      message: "Resume not found.",
    });
    const res = await handleExtensionApiRequest(
      postAnalyzeMatch({ accessToken: "tok", resumeId: "someone-elses-resume", jobId: "job-1" }),
    );
    const body = await res?.json();
    expect(body).toMatchObject({ ok: false, code: "resume_not_found" });
    expect(body.score).toBeUndefined();
    expect(analyzeResumeMatch).toHaveBeenCalledWith(AUTHED, "someone-elses-resume", "job-1", {
      forceRefresh: false,
    });
  });

  it("an out-of-credits failure is a structured 200, not an auth error", async () => {
    analyzeResumeMatch.mockResolvedValue({
      ok: false,
      code: "insufficient_credits",
      message: "You're out of AI credits.",
    });
    const res = await handleExtensionApiRequest(
      postAnalyzeMatch({ accessToken: "tok", resumeId: "resume-1", jobId: "job-1" }),
    );
    expect(res?.status).toBe(200);
    expect(await res?.json()).toMatchObject({ ok: false, code: "insufficient_credits" });
  });

  it("reflects the extension's own origin back and no other", async () => {
    const allowed = await handleExtensionApiRequest(
      postAnalyzeMatch({ accessToken: "tok", resumeId: "resume-1", jobId: "job-1" }),
    );
    expect(allowed?.headers.get("access-control-allow-origin")).toBe("chrome-extension://abc123");

    const foreign = await handleExtensionApiRequest(
      postAnalyzeMatch(
        { accessToken: "tok", resumeId: "resume-1", jobId: "job-1" },
        "https://evil.example.com",
      ),
    );
    expect(foreign?.headers.get("access-control-allow-origin")).toBeNull();
  });
});
