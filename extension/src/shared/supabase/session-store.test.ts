import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Extension auth path (production bug fix) ──
//
// Drives the REAL path a signed-in user takes when they press "Analyze Match":
//   background/handlers/aiJobMatch.analyzeMatch
//     → handlers/auth.getAuthState
//       → session-store.hydrateSupabaseSession   (chrome.storage.local + setSession)
//     → session-store.getStoredSession           (the token actually sent)
//     → extensionApiClient.analyzeMatchDirect    (POST ${appUrl}/api/extension/analyze-match)
//
// Only two things are stubbed, both at a real boundary: the Supabase client
// (`./client`) and `fetch`. Everything between them runs for real, because the
// bug lived exactly there — `setSession()` silently refreshed the expired
// access token in memory and NOTHING wrote the new pair back to
// chrome.storage.local, so the request carried a dead token and the server
// answered 401 "Not authenticated." while the rest of the panel looked fine.

const auth = {
  setSession: vi.fn(),
  getUser: vi.fn(),
  refreshSession: vi.fn(),
};

vi.mock("./client", () => ({ getSupabaseClient: () => ({ auth }) }));

let storage: Record<string, unknown> = {};

(globalThis as { chrome?: unknown }).chrome = {
  storage: {
    local: {
      get: async (key: string) => (key in storage ? { [key]: storage[key] } : {}),
      set: async (items: Record<string, unknown>) => {
        Object.assign(storage, items);
      },
      remove: async (key: string) => {
        delete storage[key];
      },
    },
  },
};

const { PRODUCTION_APP_ORIGIN, SESSION_STORAGE_KEY } = await import("../constants");
const { getStoredSession } = await import("./session-store");
const { analyzeMatch } = await import("../../background/handlers/aiJobMatch");

const USER = { id: "user-1", email: "user@example.com" };
const RESUME_ID = "resume-1";
const JOB_ID = "job-1";

/** A session Supabase reports as still valid — `setSession` echoes it back. */
const FRESH = { access_token: "access-fresh", refresh_token: "refresh-fresh", user: USER };
/** What Supabase hands back after it refreshes an expired one (tokens rotate). */
const REFRESHED = { access_token: "access-new", refresh_token: "refresh-new", user: USER };

function fetchOk() {
  return vi.fn(async (_url: string, _init: RequestInit) => ({
    json: async () => ({ ok: true, score: 82, label: "Strong match", creditsRemaining: 4 }),
  }));
}

/** What the server does with a token it can't verify (see src/server/extensionApi.ts). */
function fetchUnauthenticated() {
  return vi.fn(async (_url: string, _init: RequestInit) => ({
    json: async () => ({ ok: false, message: "Not authenticated." }),
  }));
}

function bodyOf(fetchMock: ReturnType<typeof fetchOk>): Record<string, unknown> {
  const init = fetchMock.mock.calls[0][1];
  return JSON.parse(init.body as string) as Record<string, unknown>;
}

beforeEach(() => {
  vi.clearAllMocks();
  storage = {};
  auth.getUser.mockResolvedValue({ data: { user: USER }, error: null });
});

describe("extension auth path → Analyze Match", () => {
  it("1. an authenticated user with a still-valid session analyses successfully", async () => {
    storage[SESSION_STORAGE_KEY] = {
      accessToken: FRESH.access_token,
      refreshToken: FRESH.refresh_token,
    };
    auth.setSession.mockResolvedValue({ data: { session: FRESH, user: USER }, error: null });
    const fetchMock = fetchOk();
    vi.stubGlobal("fetch", fetchMock);

    const result = await analyzeMatch(RESUME_ID, JOB_ID, false);

    expect(result).toMatchObject({ ok: true, score: 82, creditsRemaining: 4 });
    expect(bodyOf(fetchMock)).toMatchObject({
      accessToken: FRESH.access_token,
      resumeId: RESUME_ID,
      jobId: JOB_ID,
    });
  });

  it("2. an expired access token is refreshed AND the refreshed token is the one sent (regression)", async () => {
    // The exact production failure: chrome.storage.local holds an expired
    // access token, `setSession` refreshes it internally and reports no error.
    storage[SESSION_STORAGE_KEY] = {
      accessToken: "access-expired",
      refreshToken: "refresh-old",
    };
    auth.setSession.mockResolvedValue({ data: { session: REFRESHED, user: USER }, error: null });
    const fetchMock = fetchOk();
    vi.stubGlobal("fetch", fetchMock);

    const result = await analyzeMatch(RESUME_ID, JOB_ID, false);

    expect(result).toMatchObject({ ok: true });
    // Before the fix this was "access-expired" and the server answered 401.
    expect(bodyOf(fetchMock).accessToken).toBe(REFRESHED.access_token);
    // The rotated refresh token is kept too — the old one is revoked
    // server-side, so dropping it signed the extension out on the next wake.
    expect(await getStoredSession()).toEqual({
      accessToken: REFRESHED.access_token,
      refreshToken: REFRESHED.refresh_token,
    });
  });

  it("3. a genuinely signed-out user gets the sign-in prompt and no request is made", async () => {
    const fetchMock = fetchOk();
    vi.stubGlobal("fetch", fetchMock);

    const result = await analyzeMatch(RESUME_ID, JOB_ID, false);

    expect(result).toMatchObject({ ok: false, code: "not_authenticated" });
    expect(auth.setSession).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("4. an expired/revoked refresh token prompts re-authentication instead of sending a dead token", async () => {
    storage[SESSION_STORAGE_KEY] = { accessToken: "access-old", refreshToken: "refresh-revoked" };
    auth.setSession.mockResolvedValue({
      data: { session: null, user: null },
      error: { message: "Invalid Refresh Token: Already Used" },
    });
    const fetchMock = fetchOk();
    vi.stubGlobal("fetch", fetchMock);

    const result = await analyzeMatch(RESUME_ID, JOB_ID, false);

    expect(result).toMatchObject({ ok: false, code: "not_authenticated" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("5. a server-side 401 is surfaced to the panel rather than silently swallowed", async () => {
    storage[SESSION_STORAGE_KEY] = {
      accessToken: FRESH.access_token,
      refreshToken: FRESH.refresh_token,
    };
    auth.setSession.mockResolvedValue({ data: { session: FRESH, user: USER }, error: null });
    vi.stubGlobal("fetch", fetchUnauthenticated());

    const result = await analyzeMatch(RESUME_ID, JOB_ID, false);

    expect(result).toMatchObject({ ok: false, message: "Not authenticated." });
  });

  it("6. the request goes to the production origin, never localhost or the raw Worker host", async () => {
    storage[SESSION_STORAGE_KEY] = {
      accessToken: FRESH.access_token,
      refreshToken: FRESH.refresh_token,
    };
    auth.setSession.mockResolvedValue({ data: { session: FRESH, user: USER }, error: null });
    const fetchMock = fetchOk();
    vi.stubGlobal("fetch", fetchMock);

    await analyzeMatch(RESUME_ID, JOB_ID, false);

    // No VITE_APP_URL under test, so this asserts the FALLBACK — the value a
    // build with no env override ships with.
    const url = fetchMock.mock.calls[0][0];
    expect(url).toBe(`${PRODUCTION_APP_ORIGIN}/api/extension/analyze-match`);
    expect(url).not.toContain("localhost");
    expect(url).not.toContain("workers.dev");
  });
});
