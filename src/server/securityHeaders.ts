// ── Production HTTP security headers (B2 launch-audit fix) ─────────────────
//
// Applied to EVERY response this Worker returns (see the single call site in
// src/server.ts — every branch: canonical-host redirect, health check,
// extension API, client-error sink, SSR pages, and the catch-all error
// page). One choke point, so nothing new can silently ship without these.
//
// What each header does here, and why its value is what it is — this file
// is the place to update if a future change needs a directive loosened:
//
//   Content-Security-Policy
//     script-src needs 'unsafe-inline': TanStack Start injects two small
//     inline <script> tags with no `src` on every page — its own scroll-
//     restoration bootstrap and the `$_TSR` SSR-streaming hydration barrier
//     (verified by rendering a real page and inspecting the HTML). These are
//     framework internals, not something this app can move to an external
//     file or a nonce without changing the TanStack Start rendering pipeline
//     itself, and hydration breaking is worse than a narrowed script-src.
//     The other inline <script type="application/ld+json"> (structured
//     data) is exempt from script-src by spec — browsers never execute a
//     script block whose type isn't empty/a JS type/module/importmap.
//     style-src needs 'unsafe-inline' for the same reason: Radix UI's
//     positioning and src/components/ui/chart.tsx's per-render
//     dangerouslySetInnerHTML <style> block both require it; neither can be
//     hashed (chart colors are dynamic) or given a nonce without threading
//     one through the whole render tree.
//     connect-src/img-src/font-src/style-src allow exactly the third
//     parties this app actually talks to from the browser: Supabase (REST +
//     Auth + Realtime, if ever used — both https: and wss: to the same
//     project host) and Google Fonts. OpenAI is never called from the
//     browser (server-only, see src/server/ai/providers/OpenAIProvider.ts),
//     so it needs no connect-src entry. Google's OAuth consent screen is a
//     full top-level navigation (`window.location.href = url`, see
//     src/features/google/hooks/index.ts), which CSP does not restrict, so
//     it needs no entry either.
//     img-src allows any https:/data:/blob: source because job postings
//     carry `company_logo_url` from whatever CDN each ATS/source happens to
//     use (Greenhouse, LinkedIn, the company's own host, …) — there is no
//     fixed allowlist to write down; images can't execute script, so this
//     is a low-risk allowance.
//     frame-src/frame-ancestors are 'none': this app never embeds an
//     iframe and must never be embedded in one (see X-Frame-Options below).
//
//   X-Content-Type-Options: nosniff
//     Stops a browser from MIME-sniffing a response into a different,
//     possibly executable content type than what Content-Type declares.
//
//   X-Frame-Options: DENY
//     Same guarantee as CSP's frame-ancestors 'none', for browsers that
//     only understand the legacy header. Belt and suspenders, not a
//     substitute for either.
//
//   Referrer-Policy: strict-origin-when-cross-origin
//     Full URL (including path/query) is sent as the referrer for same-
//     origin navigations; only the bare origin crosses to a different
//     origin (and nothing at all on a downgrade to http). Query strings
//     here can carry OAuth state/codes and analysis deep-link params (see
//     src/lib/lovable-error-reporting.ts's own note on this) — this keeps
//     those out of any cross-origin Referer header while leaving normal
//     same-app navigation analytics-free-but-unbroken.
//
//   Permissions-Policy
//     Explicit deny for four sensitive features confirmed unused anywhere
//     in this codebase (camera, geolocation, payment, usb — verified by
//     search, see the B2 audit). microphone is explicitly ALLOWED for
//     'self' only: Mock Interview's voice input
//     (src/features/mock-interview/voice/BrowserVoiceTransport.ts) uses the
//     browser's SpeechRecognition API, which Chrome gates on this policy.
//     Every other feature is left unmentioned (i.e. browser default),
//     deliberately — this lists only what was actually verified, not a
//     blanket lockdown of features nobody checked.
//
//   Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
//     2 years, including subdomains, eligible for browser HSTS preload
//     lists. Cloudflare's own dashboard-level "Always Use HTTPS"/HSTS
//     toggle (SSL/TLS → Edge Certificates) is the more foundational layer —
//     it protects the very first plaintext request before any Worker code
//     runs — and should be confirmed on there too; this header is what this
//     repo can guarantee from the Worker side regardless of that dashboard
//     setting, and is not a substitute for it. `preload` here only makes
//     the site *eligible*; actually joining the list is a separate manual
//     submission at hstspreload.org, not something this header does alone.

function readOrigin(raw: string | undefined | null): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

const SUPABASE_ORIGIN = readOrigin(import.meta.env.VITE_SUPABASE_URL as string | undefined);

/**
 * Builds the CSP value. `supabaseOrigin` is injectable for tests; in
 * production it comes from VITE_SUPABASE_URL, inlined at build time — see
 * src/server/canonicalHost.ts for the same pattern with VITE_SITE_URL.
 */
export function buildContentSecurityPolicy(
  supabaseOrigin: string | null = SUPABASE_ORIGIN,
): string {
  const connectSrc = ["'self'"];
  if (supabaseOrigin) {
    connectSrc.push(supabaseOrigin, supabaseOrigin.replace(/^https:/, "wss:"));
  }

  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "img-src 'self' https: data: blob:",
    "font-src 'self' https://fonts.gstatic.com",
    `connect-src ${connectSrc.join(" ")}`,
    "frame-src 'none'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "manifest-src 'self'",
    "upgrade-insecure-requests",
  ].join("; ");
}

/** Headers with a single, static, environment-independent value. */
export const STATIC_SECURITY_HEADERS: ReadonlyArray<readonly [string, string]> = [
  ["x-content-type-options", "nosniff"],
  ["x-frame-options", "DENY"],
  ["referrer-policy", "strict-origin-when-cross-origin"],
  ["permissions-policy", "camera=(), geolocation=(), microphone=(self), payment=(), usb=()"],
  ["strict-transport-security", "max-age=63072000; includeSubDomains; preload"],
];

/**
 * Returns a new Response equal to `response` but with the production
 * security headers set. Never mutates `response` in place (its headers may
 * be immutable depending on where it came from — an SSR response, a plain
 * Response constructed elsewhere, or one returned by env.ASSETS.fetch()).
 */
export function applySecurityHeaders(
  response: Response,
  csp: string = buildContentSecurityPolicy(),
): Response {
  const headers = new Headers(response.headers);
  headers.set("content-security-policy", csp);
  for (const [name, value] of STATIC_SECURITY_HEADERS) {
    headers.set(name, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
