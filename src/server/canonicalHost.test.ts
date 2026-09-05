import { describe, expect, it } from "vitest";
import { handleCanonicalHostRedirect } from "./canonicalHost";

// ── Canonical host redirect tests ────────────────────────────────────────
//
// Guards the one rule that keeps the *.workers.dev origin hostname out of
// user-facing navigation without breaking the routes that legitimately run
// on it (extension API, health check, the OAuth callback).

const CANONICAL = "https://getofferlyst.com";
const WORKER = "https://ishantsinghiitb-svg-final-project.ishantsingh-iitb.workers.dev";

function get(url: string, method = "GET"): Request {
  return new Request(url, { method });
}

describe("handleCanonicalHostRedirect — redirects", () => {
  it("301s a page request on the workers.dev host to the canonical origin", () => {
    const res = handleCanonicalHostRedirect(get(`${WORKER}/`), CANONICAL);
    expect(res?.status).toBe(301);
    expect(res?.headers.get("location")).toBe(`${CANONICAL}/`);
  });

  it("preserves the full path and query string", () => {
    const res = handleCanonicalHostRedirect(
      get(`${WORKER}/dashboard/settings?google=connected`),
      CANONICAL,
    );
    expect(res?.headers.get("location")).toBe(`${CANONICAL}/dashboard/settings?google=connected`);
  });

  it("canonicalises sitemap.xml and robots.txt too", () => {
    expect(
      handleCanonicalHostRedirect(get(`${WORKER}/sitemap.xml`), CANONICAL)?.headers.get("location"),
    ).toBe(`${CANONICAL}/sitemap.xml`);
    expect(
      handleCanonicalHostRedirect(get(`${WORKER}/robots.txt`), CANONICAL)?.headers.get("location"),
    ).toBe(`${CANONICAL}/robots.txt`);
  });

  it("redirects HEAD as well as GET", () => {
    const res = handleCanonicalHostRedirect(get(`${WORKER}/features`, "HEAD"), CANONICAL);
    expect(res?.status).toBe(301);
  });

  it("matches a bare workers.dev apex host", () => {
    const res = handleCanonicalHostRedirect(get("https://workers.dev/x"), CANONICAL);
    expect(res?.status).toBe(301);
  });
});

describe("handleCanonicalHostRedirect — left alone", () => {
  it("does nothing when no canonical origin is configured", () => {
    expect(handleCanonicalHostRedirect(get(`${WORKER}/`), null)).toBeNull();
  });

  it("does nothing for requests already on the canonical host", () => {
    expect(handleCanonicalHostRedirect(get(`${CANONICAL}/dashboard`), CANONICAL)).toBeNull();
  });

  it("does nothing for a localhost dev request", () => {
    expect(
      handleCanonicalHostRedirect(get("http://localhost:8080/dashboard"), CANONICAL),
    ).toBeNull();
  });

  it("never redirects non-GET/HEAD methods (server functions are POST)", () => {
    for (const method of ["POST", "PUT", "PATCH", "DELETE", "OPTIONS"]) {
      expect(handleCanonicalHostRedirect(get(`${WORKER}/`, method), CANONICAL)).toBeNull();
    }
  });

  it("does not touch /api/* (extension API, health, client-error)", () => {
    expect(handleCanonicalHostRedirect(get(`${WORKER}/api/health`), CANONICAL)).toBeNull();
    expect(
      handleCanonicalHostRedirect(get(`${WORKER}/api/extension/analyze-match`), CANONICAL),
    ).toBeNull();
  });

  it("does not touch /auth/* (the Google OAuth callback host is registered with Google)", () => {
    expect(
      handleCanonicalHostRedirect(
        get(`${WORKER}/auth/google/callback?code=abc&state=xyz`),
        CANONICAL,
      ),
    ).toBeNull();
  });

  it("does not touch framework internals / build assets under /_", () => {
    expect(
      handleCanonicalHostRedirect(get(`${WORKER}/_build/assets/app-abc123.js`), CANONICAL),
    ).toBeNull();
  });

  it("treats a canonical origin that is itself a workers.dev host as unconfigured (no loop)", () => {
    expect(handleCanonicalHostRedirect(get(`${WORKER}/`), WORKER)).toBeNull();
  });
});
