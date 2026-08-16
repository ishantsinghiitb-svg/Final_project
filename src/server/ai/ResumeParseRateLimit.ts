import type { ServerSupabase } from "@/server/supabase";

// ── Resume-parse rate limit / daily quota (Module 13 · Phase 2 · B2) ──
//
// Guards `/api/extension/parse-resume` specifically (src/server/extensionApi.ts)
// — the dashboard's own parseResume server function is unauthenticated-by-
// origin-only-in-practice in the same sense every other TanStack Start
// server function is (same-origin, part of this app's own client bundle),
// while the extension route is a bare, CORS-opened HTTP endpoint any script
// holding a valid access token can call directly. Deliberately NOT the AI
// credit system: resume parsing is deterministic (no provider call — see
// ResumeUpload.ts), so charging an AI credit here would misrepresent what
// credits mean and would also apply to the dashboard's identical parse path.
//
// Two independent checks, enforced atomically in one Postgres round trip per
// request (see migration 20260827000001_module13_extension_parse_rate_limit.sql):
//   - a short burst window, counting every attempt (valid or not) — the
//     abuse/rate-protection layer;
//   - a daily quota keyed off the EXISTING user_ai_usage.plan column, counting
//     only genuine successful parses (see recordResumeParseSuccess) — the
//     product-level entitlement layer.

export const RESUME_PARSE_RATE_LIMIT = {
  /** Burst window: at most this many attempts (any outcome) per windowSeconds. */
  windowSeconds: 60,
  windowMax: 10,
  /** Daily quota: only successful, non-cache-reused parses count against this. */
  dailyLimitFree: 20,
  dailyLimitPaid: 100,
} as const;

export type ResumeParseRateLimitResult =
  | { ok: true; dailyRemaining: number }
  | { ok: false; code: "rate_limited" }
  | { ok: false; code: "daily_limit_reached"; limit: number };

/** Call BEFORE parseResumeForUser. Throws on an unexpected error (fails closed — the caller's existing catch-all maps that to a 500, never a silent bypass). */
export async function checkResumeParseRateLimit(
  sb: ServerSupabase,
): Promise<ResumeParseRateLimitResult> {
  const { data, error } = await sb.rpc("check_resume_parse_rate_limit", {
    p_window_seconds: RESUME_PARSE_RATE_LIMIT.windowSeconds,
    p_window_max: RESUME_PARSE_RATE_LIMIT.windowMax,
    p_daily_limit_free: RESUME_PARSE_RATE_LIMIT.dailyLimitFree,
    p_daily_limit_paid: RESUME_PARSE_RATE_LIMIT.dailyLimitPaid,
  });
  if (error) throw error;
  return data as ResumeParseRateLimitResult;
}

/** Call AFTER parseResumeForUser returns ok:true with reused:false — never for a cache hit or a failure. Best-effort at the call site: a failure here must not turn a successful parse into an error response. */
export async function recordResumeParseSuccess(sb: ServerSupabase): Promise<void> {
  const { error } = await sb.rpc("record_resume_parse_success", {});
  if (error) throw error;
}
