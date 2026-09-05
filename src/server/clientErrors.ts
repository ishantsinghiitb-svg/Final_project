// ── Client error ingest (P1-3) ──
//
// Plain fetch handler, same pattern as `health.ts` and `extensionApi.ts`:
// intercepted in `src/server.ts` ahead of the SSR router, so it never touches
// the TanStack Start/RSC pipeline and returns `null` for every other path.
//
// Why this exists: the app's two React error boundaries
// (routes/__root.tsx's ErrorComponent and components/shared/ErrorBoundary)
// both funnel into `reportLovableError`, which forwards to
// `window.__lovableEvents` — a global injected ONLY by the Lovable preview
// environment. On this self-hosted Cloudflare deployment that optional call
// silently no-ops, so every client-side crash was discarded and a production
// white-screen left no trace anywhere. This endpoint gives those errors
// somewhere to land: it `console.error`s them into the SAME Worker log stream
// that `src/server.ts` already writes SSR failures to (`npx wrangler tail`,
// or persisted Workers Logs when observability is enabled on the Worker).
//
// Deliberately NOT a monitoring platform: no dependency, no SDK, no queue, no
// storage. It is a log line with useful context, which is the smallest thing
// that makes a production incident diagnosable.
//
// Privacy: the client sends `location.pathname` only — never the full URL,
// because query strings on this app can carry OAuth `code`/`state` values and
// analysis deep-link params. No access token, email, or profile data is sent
// or logged. Everything is length-capped before it reaches the log.

const CLIENT_ERROR_PATH = "/api/client-error";

/** Hard cap on the request body. Anything larger is rejected unread rather than parsed. */
const MAX_BODY_BYTES = 8_000;

/** Per-field cap applied after parsing, so one enormous stack can't flood the log stream. */
const MAX_FIELD_CHARS = 1_500;

type ClientErrorPayload = {
  name?: unknown;
  message?: unknown;
  stack?: unknown;
  pathname?: unknown;
  boundary?: unknown;
  userAgent?: unknown;
};

function clamp(value: unknown, max = MAX_FIELD_CHARS): string {
  if (typeof value !== "string") return "";
  return value.length > max ? `${value.slice(0, max)}…[truncated]` : value;
}

/**
 * Entry point called from `src/server.ts`. Returns `null` for any request that
 * isn't `/api/client-error`, so every other route falls through to normal SSR
 * unchanged.
 *
 * Always answers 204 for a well-formed POST — including when the body is
 * unparseable. A browser reporting a crash must never be handed another error
 * to deal with, and the client side is fire-and-forget regardless.
 */
export async function handleClientErrorRequest(request: Request): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname !== CLIENT_ERROR_PATH) return null;

  if (request.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, message: "Method not allowed." }), {
      status: 405,
      headers: { "content-type": "application/json", allow: "POST" },
    });
  }

  // Reject oversized payloads on the declared length before reading them.
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return new Response(null, { status: 413 });
  }

  let raw: string;
  try {
    raw = await request.text();
  } catch {
    return new Response(null, { status: 204 });
  }
  if (raw.length > MAX_BODY_BYTES) return new Response(null, { status: 413 });

  let payload: ClientErrorPayload;
  try {
    payload = JSON.parse(raw) as ClientErrorPayload;
  } catch {
    // Malformed body still tells us something went wrong client-side.
    console.error("[client-error] unparseable report body");
    return new Response(null, { status: 204 });
  }

  // One structured line, so it greps cleanly out of `wrangler tail`.
  console.error(
    "[client-error]",
    JSON.stringify({
      name: clamp(payload.name, 120) || "Error",
      message: clamp(payload.message, 500),
      pathname: clamp(payload.pathname, 200),
      boundary: clamp(payload.boundary, 80),
      userAgent: clamp(payload.userAgent, 200),
      stack: clamp(payload.stack),
      at: new Date().toISOString(),
    }),
  );

  return new Response(null, { status: 204 });
}
