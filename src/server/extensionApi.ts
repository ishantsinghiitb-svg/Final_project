import { requireUser } from "@/server/supabase";
import { analyzeResumeMatch } from "@/server/ai/ResumeMatchService";
import { parseResumeForUser } from "@/server/ai/ResumeUpload";

// ── Extension API (Module 6C) ──
//
// Real HTTP endpoints the browser extension calls DIRECTLY (no dashboard
// navigation) to run an analysis or parse an uploaded resume. Both reuse the
// EXACT SAME service functions the dashboard's TanStack server functions call
// (`ResumeMatchService.analyzeResumeMatch`, `parseResumeForUser`) — same
// engine, cache, versioning, and AI-Credit accounting. No AI/parsing logic is
// duplicated here; this file is transport only (auth + CORS + JSON in/out).
//
// Why a plain fetch handler instead of a `createServerFn`: TanStack Start
// server functions compile to an internal RPC protocol meant to be called by
// this app's OWN client bundle — the exact wire format is a compiler-internal
// detail, not a documented public contract, so hardcoding it into an
// externally-bundled Chrome extension would be fragile and unverifiable.
// `src/server.ts` (this app's actual Worker `fetch` entry, confirmed via
// `app.config.ts`'s `tanstackStart.server.entry`) already gives a fully
// supported, stable hook to add a plain Request→Response route ahead of the
// SSR handler — see `handleExtensionApiRequest`'s call site there.
//
// CORS: this is a bearer-token JSON API (the access token travels in the
// request body, never a cookie), so there is no ambient credential for a
// third-party origin to ride on — reflecting the extension's own origin back
// is the standard, safe pattern for this shape of API.

const PATH_PREFIX = "/api/extension/";

const ALLOWED_ORIGIN_PATTERNS = [
  /^chrome-extension:\/\//,
  /^https?:\/\/localhost(:\d+)?$/,
  /^https?:\/\/127\.0\.0\.1(:\d+)?$/,
];

function corsHeaders(origin: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "Content-Type",
    vary: "Origin",
  };
  if (origin && ALLOWED_ORIGIN_PATTERNS.some((re) => re.test(origin))) {
    headers["access-control-allow-origin"] = origin;
  }
  return headers;
}

function json(body: unknown, status: number, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...cors },
  });
}

/**
 * Entry point called from `src/server.ts`. Returns `null` for any request
 * that isn't under `/api/extension/*`, so the caller falls through to normal
 * SSR unchanged — this function is a no-op for every other route in the app.
 */
export async function handleExtensionApiRequest(request: Request): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith(PATH_PREFIX)) return null;

  const cors = corsHeaders(request.headers.get("origin"));

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }
  if (request.method !== "POST") {
    return json({ ok: false, message: "Method not allowed." }, 405, cors);
  }

  const route = url.pathname.slice(PATH_PREFIX.length);

  try {
    if (route === "analyze-match") return await handleAnalyzeMatch(request, cors);
    if (route === "parse-resume") return await handleParseResume(request, cors);
    return json({ ok: false, message: "Not found." }, 404, cors);
  } catch (err) {
    console.error("[extensionApi]", err);
    return json({ ok: false, message: "Internal error." }, 500, cors);
  }
}

type AnalyzeMatchBody = {
  accessToken?: string;
  resumeId?: string;
  jobId?: string;
  forceRefresh?: boolean;
};

async function handleAnalyzeMatch(
  request: Request,
  cors: Record<string, string>,
): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as AnalyzeMatchBody;
  if (!body.accessToken || !body.resumeId || !body.jobId) {
    return json({ ok: false, message: "Missing accessToken, resumeId, or jobId." }, 400, cors);
  }

  const authed = await requireUser(body.accessToken).catch(() => null);
  if (!authed) {
    return json({ ok: false, message: "Not authenticated." }, 401, cors);
  }

  const result = await analyzeResumeMatch(authed, body.resumeId, body.jobId, {
    forceRefresh: Boolean(body.forceRefresh),
  });

  if (!result.ok) {
    return json({ ok: false, code: result.code, message: result.message }, 200, cors);
  }

  // Deliberately narrow — score + label + updated credit balance only. The
  // full breakdown (whatMatches/whatToImprove/summary) stays dashboard-only,
  // same rule the rest of the extension already follows.
  return json(
    {
      ok: true,
      score: result.analysis.overallScore,
      label: result.analysis.matchLabel,
      creditsRemaining: result.credits.creditsRemaining,
    },
    200,
    cors,
  );
}

type ParseResumeBody = { accessToken?: string; resumeId?: string };

async function handleParseResume(
  request: Request,
  cors: Record<string, string>,
): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as ParseResumeBody;
  if (!body.accessToken || !body.resumeId) {
    return json({ ok: false, message: "Missing accessToken or resumeId." }, 400, cors);
  }

  const authed = await requireUser(body.accessToken).catch(() => null);
  if (!authed) {
    return json({ ok: false, message: "Not authenticated." }, 401, cors);
  }

  const result = await parseResumeForUser(authed.supabase, authed.user, body.resumeId);
  return json(result, 200, cors);
}
