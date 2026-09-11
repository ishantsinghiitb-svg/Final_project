import { describe, expect, it } from "vitest";
import {
  applySecurityHeaders,
  buildContentSecurityPolicy,
  STATIC_SECURITY_HEADERS,
} from "./securityHeaders";

// ── B2 launch-audit fix: production HTTP security headers ──────────────────
//
// Two things worth pinning down permanently:
//   1. The exact header values — a silent drift here (e.g. someone loosening
//      frame-ancestors while "just testing something") should show up as a
//      failing test, not ship unnoticed.
//   2. applySecurityHeaders never discards what was already on the response
//      it's wrapping (status, body, and any headers a route already set,
//      e.g. the extension API's CORS headers or a redirect's Location) — it
//      only adds to it.

describe("buildContentSecurityPolicy", () => {
  it("includes the required directives with the expected values", () => {
    const csp = buildContentSecurityPolicy(null);
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self' 'unsafe-inline'");
    expect(csp).toContain("style-src 'self' 'unsafe-inline' https://fonts.googleapis.com");
    expect(csp).toContain("img-src 'self' https: data: blob:");
    expect(csp).toContain("font-src 'self' https://fonts.gstatic.com");
    expect(csp).toContain("frame-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
    expect(csp).toContain("manifest-src 'self'");
    expect(csp).toContain("upgrade-insecure-requests");
  });

  it("connect-src is same-origin-only when no Supabase origin is configured", () => {
    const csp = buildContentSecurityPolicy(null);
    const connectSrc = csp.split("; ").find((d) => d.startsWith("connect-src"));
    expect(connectSrc).toBe("connect-src 'self'");
  });

  it("connect-src allows both https: and wss: to the configured Supabase project", () => {
    const csp = buildContentSecurityPolicy("https://xpriusomwyshrfqfonkf.supabase.co");
    const connectSrc = csp.split("; ").find((d) => d.startsWith("connect-src"));
    expect(connectSrc).toBe(
      "connect-src 'self' https://xpriusomwyshrfqfonkf.supabase.co wss://xpriusomwyshrfqfonkf.supabase.co",
    );
  });

  it("never allows OpenAI or any other connect-src origin — only 'self' and Supabase", () => {
    const csp = buildContentSecurityPolicy("https://xpriusomwyshrfqfonkf.supabase.co");
    expect(csp).not.toContain("openai.com");
    expect(csp).not.toContain("accounts.google.com");
  });
});

describe("STATIC_SECURITY_HEADERS — exact values", () => {
  const asMap = () => new Map(STATIC_SECURITY_HEADERS);

  it("X-Content-Type-Options: nosniff", () => {
    expect(asMap().get("x-content-type-options")).toBe("nosniff");
  });

  it("X-Frame-Options: DENY", () => {
    expect(asMap().get("x-frame-options")).toBe("DENY");
  });

  it("Referrer-Policy: strict-origin-when-cross-origin", () => {
    expect(asMap().get("referrer-policy")).toBe("strict-origin-when-cross-origin");
  });

  it("Permissions-Policy denies camera/geolocation/payment/usb and allows microphone for self only", () => {
    const value = asMap().get("permissions-policy");
    expect(value).toContain("camera=()");
    expect(value).toContain("geolocation=()");
    expect(value).toContain("payment=()");
    expect(value).toContain("usb=()");
    // Mock Interview voice input needs this — must stay allowed, and only for self.
    expect(value).toContain("microphone=(self)");
  });

  it("Strict-Transport-Security is a strong, long-lived policy", () => {
    const value = asMap().get("strict-transport-security");
    expect(value).toBe("max-age=63072000; includeSubDomains; preload");
  });
});

describe("applySecurityHeaders", () => {
  it("sets the Content-Security-Policy header", () => {
    const res = applySecurityHeaders(new Response("ok"));
    expect(res.headers.get("content-security-policy")).toContain("default-src 'self'");
  });

  it("sets every static header", () => {
    const res = applySecurityHeaders(new Response("ok"));
    for (const [name, value] of STATIC_SECURITY_HEADERS) {
      expect(res.headers.get(name)).toBe(value);
    }
  });

  it("preserves status, statusText and body", async () => {
    const res = applySecurityHeaders(
      new Response("hello world", { status: 201, statusText: "Created" }),
    );
    expect(res.status).toBe(201);
    expect(res.statusText).toBe("Created");
    await expect(res.text()).resolves.toBe("hello world");
  });

  it("preserves headers the wrapped response already set (e.g. CORS)", () => {
    const original = new Response(null, {
      status: 204,
      headers: { "access-control-allow-origin": "chrome-extension://abc123" },
    });
    const res = applySecurityHeaders(original);
    expect(res.headers.get("access-control-allow-origin")).toBe("chrome-extension://abc123");
    expect(res.headers.get("x-frame-options")).toBe("DENY");
  });

  it("preserves a redirect's Location and status", () => {
    const original = new Response(null, {
      status: 301,
      headers: { location: "https://getofferlyst.com/pricing" },
    });
    const res = applySecurityHeaders(original);
    expect(res.status).toBe(301);
    expect(res.headers.get("location")).toBe("https://getofferlyst.com/pricing");
    expect(res.headers.get("strict-transport-security")).toBe(
      "max-age=63072000; includeSubDomains; preload",
    );
  });

  it("does not mutate the original response's headers object", () => {
    const original = new Response("ok");
    applySecurityHeaders(original);
    expect(original.headers.get("x-frame-options")).toBeNull();
  });
});
