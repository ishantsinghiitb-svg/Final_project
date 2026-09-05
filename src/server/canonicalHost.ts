// ── Canonical host redirect ──────────────────────────────────────────────
//
// The Cloudflare Worker answers on BOTH the public custom domain
// (https://getofferlyst.com) and its raw `*.workers.dev` origin hostname.
// The workers.dev hostname is infrastructure only — it must never be what a
// user sees in the address bar, bookmarks, or shares. Without this, a visitor
// who lands on the workers.dev host (an old link, a search result, an OAuth
// bounce) stays there for every subsequent in-app navigation, because all of
// that navigation is relative.
//
// This intercepts user-facing GET/HEAD requests that arrived on a
// `*.workers.dev` host and 301s them to the same path + query on the
// canonical origin (VITE_SITE_URL).
//
// DELIBERATELY NOT redirected — these legitimately need the Worker origin:
//   - /api/*  — the extension API, the health check, and the client-error
//               sink. The Chrome extension talks to the Worker origin by
//               design (see extension/src/shared/constants.ts).
//   - /auth/* — the Google OAuth callback. Its redirect_uri is registered
//               with Google as the workers.dev URL (GOOGLE_OAUTH_REDIRECT_URI)
//               and the handshake must complete on that host. Its own
//               post-callback redirect to /dashboard/settings is a normal
//               page navigation and IS canonicalised by this on the next hop.
//   - /_*     — framework internals and build assets.
// Non-GET/HEAD is never redirected (every server function is POST).

function isWorkerOriginHost(hostname: string): boolean {
  return /(^|\.)workers\.dev$/i.test(hostname);
}

/**
 * Parse VITE_SITE_URL into a bare origin, or null if it is unset, malformed,
 * or (defensively) itself points at a workers.dev host — which would make this
 * redirect loop.
 */
function readCanonicalOrigin(raw: string | undefined | null): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (isWorkerOriginHost(url.hostname)) return null;
    return url.origin;
  } catch {
    return null;
  }
}

const CANONICAL_ORIGIN = readCanonicalOrigin(import.meta.env.VITE_SITE_URL as string | undefined);

/**
 * Returns a 301 Response when `request` is a user-facing page request that
 * arrived on a workers.dev host and a canonical origin is configured;
 * otherwise returns null and the caller proceeds unchanged.
 *
 * `canonicalOrigin` is injectable for tests; in production it comes from
 * VITE_SITE_URL, inlined at build time.
 */
export function handleCanonicalHostRedirect(
  request: Request,
  canonicalOrigin: string | null = CANONICAL_ORIGIN,
): Response | null {
  if (!canonicalOrigin) return null;
  if (request.method !== "GET" && request.method !== "HEAD") return null;

  let url: URL;
  let canonicalHost: string;
  try {
    url = new URL(request.url);
    canonicalHost = new URL(canonicalOrigin).hostname;
  } catch {
    return null;
  }

  // Only act on the infrastructure host, and never when the configured
  // canonical origin is itself a workers.dev host (that would loop).
  if (!isWorkerOriginHost(url.hostname) || isWorkerOriginHost(canonicalHost)) return null;

  const path = url.pathname;
  if (path.startsWith("/api/") || path.startsWith("/auth/") || path.startsWith("/_")) {
    return null;
  }

  return new Response(null, {
    status: 301,
    headers: {
      location: `${canonicalOrigin}${url.pathname}${url.search}`,
      "cache-control": "public, max-age=3600",
    },
  });
}
