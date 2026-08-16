// ── Health check (Module 13A) ──
//
// Plain fetch handler, same pattern as `extensionApi.ts`: intercepted in
// `src/server.ts` ahead of the SSR router so it never touches the TanStack
// Start/RSC pipeline. Deliberately a LIVENESS check only — it proves the
// Worker itself is up and serving traffic, which is what uptime monitors and
// post-deploy smoke checks need. It does not call Supabase or any other
// dependency: an unauthenticated endpoint that fans out to the database on
// every ping is both a cost and an abuse surface, and a real dependency
// outage is already visible through normal request errors. No response field
// here reveals anything about backend configuration or state.

const HEALTH_PATH = "/api/health";

export function handleHealthRequest(request: Request): Response | null {
  const url = new URL(request.url);
  if (url.pathname !== HEALTH_PATH) return null;

  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response(JSON.stringify({ ok: false, message: "Method not allowed." }), {
      status: 405,
      headers: { "content-type": "application/json", allow: "GET, HEAD" },
    });
  }

  const body = JSON.stringify({ status: "ok", timestamp: new Date().toISOString() });
  return new Response(request.method === "HEAD" ? null : body, {
    status: 200,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}
