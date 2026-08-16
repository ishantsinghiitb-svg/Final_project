-- ── Module 13 · Phase 2 (B2): Rate-limit + daily quota for /api/extension/parse-resume ──
--
-- PROBLEM: the extension's parse-resume HTTP route (src/server/extensionApi.ts)
-- has no usage gate at all beyond authentication. Resume parsing is
-- deterministic (no AI provider call — see ResumeUpload.ts's own header
-- comment), so the existing AI credit system (a LIFETIME allowance, see
-- consume_ai_credit) is the wrong fit: charging it here would mean
-- resume-parsing silently starts consuming the same pool as AI generations,
-- breaking the "no AI credits used" behavior already advertised in the
-- upload UI, for both the extension AND dashboard upload paths (they share
-- parseResumeForUser). A2 (20260825000001) already bounds the COST of a
-- single parse (size/signature/timeout); nothing bounded how many times an
-- authenticated caller could invoke it.
--
-- FIX: two independent, atomic checks, mirroring the existing SECURITY
-- DEFINER RPC pattern (auth.uid()-scoped, config passed in as parameters —
-- "the DB never hardcodes the count", see ensure_ai_usage's own comment):
--   1. A short burst window (every attempt counts, valid or not) — the
--      abuse-prevention layer, independent of the product-level quota.
--   2. A daily quota, keyed off the EXISTING user_ai_usage.plan column (the
--      same free/paid signal the AI credit system already uses) — the
--      product-level layer. Only genuinely new, successful parses count
--      against it (see record_resume_parse_success) — a cache-hit reuse or
--      a rejected/invalid file never touches it, matching "failed uploads
--      must not consume usage".
-- Both checks happen inside ONE row-locked transaction per RPC call, so
-- concurrent/replayed requests from the same user serialize against each
-- other instead of racing past the limit.

CREATE TABLE IF NOT EXISTS resume_parse_usage (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  window_started_at timestamptz NOT NULL DEFAULT now(),
  window_count integer NOT NULL DEFAULT 0,
  day_bucket date NOT NULL DEFAULT (now() AT TIME ZONE 'UTC')::date,
  day_count integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE resume_parse_usage ENABLE ROW LEVEL SECURITY;

-- Client may read its own usage (e.g. a future "N parses left today" hint).
-- Writes happen only through the SECURITY DEFINER RPCs below — no
-- INSERT/UPDATE policy, so a client cannot reset or inflate its own count.
DROP POLICY IF EXISTS "resume_parse_usage_select_own" ON resume_parse_usage;
CREATE POLICY "resume_parse_usage_select_own" ON resume_parse_usage FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

-- ── check_resume_parse_rate_limit(...) ──
-- Called BEFORE parseResumeForUser. Returns a structured jsonb result —
-- never raises for the expected "blocked" cases, so the caller can return a
-- normal 429 envelope instead of a 500.
--   allowed:      { ok: true, dailyRemaining }
--   burst-limited: { ok: false, code: 'rate_limited' }
--   quota-hit:     { ok: false, code: 'daily_limit_reached', limit }
CREATE OR REPLACE FUNCTION check_resume_parse_rate_limit(
  p_window_seconds integer,
  p_window_max integer,
  p_daily_limit_free integer,
  p_daily_limit_paid integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_now timestamptz := now();
  v_today date := (v_now AT TIME ZONE 'UTC')::date;
  v_plan text;
  v_daily_limit integer;
  v_row resume_parse_usage;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  INSERT INTO resume_parse_usage (user_id) VALUES (v_uid)
  ON CONFLICT (user_id) DO NOTHING;

  -- Lock the row first so a concurrent/replayed request for the same user
  -- serializes behind this one instead of racing it.
  SELECT * INTO v_row FROM resume_parse_usage WHERE user_id = v_uid FOR UPDATE;

  IF v_now - v_row.window_started_at >= make_interval(secs => p_window_seconds) THEN
    v_row.window_started_at := v_now;
    v_row.window_count := 0;
  END IF;

  IF v_row.day_bucket IS DISTINCT FROM v_today THEN
    v_row.day_bucket := v_today;
    v_row.day_count := 0;
  END IF;

  -- Burst check first — counts every attempt, regardless of what happens
  -- next, so a script sending garbage/oversized files to dodge the daily
  -- quota is still capped on raw request frequency.
  IF v_row.window_count >= p_window_max THEN
    UPDATE resume_parse_usage SET
      window_started_at = v_row.window_started_at,
      window_count = v_row.window_count,
      day_bucket = v_row.day_bucket,
      day_count = v_row.day_count,
      updated_at = v_now
    WHERE user_id = v_uid;
    RETURN jsonb_build_object('ok', false, 'code', 'rate_limited');
  END IF;

  -- The caller's plan is read from the existing entitlement table — never
  -- trusted from the client.
  SELECT plan INTO v_plan FROM user_ai_usage WHERE user_id = v_uid;
  v_daily_limit := CASE WHEN COALESCE(v_plan, 'free') = 'free'
    THEN p_daily_limit_free ELSE p_daily_limit_paid END;

  IF v_row.day_count >= v_daily_limit THEN
    UPDATE resume_parse_usage SET
      window_started_at = v_row.window_started_at,
      window_count = v_row.window_count + 1,
      day_bucket = v_row.day_bucket,
      day_count = v_row.day_count,
      updated_at = v_now
    WHERE user_id = v_uid;
    RETURN jsonb_build_object('ok', false, 'code', 'daily_limit_reached', 'limit', v_daily_limit);
  END IF;

  UPDATE resume_parse_usage SET
    window_started_at = v_row.window_started_at,
    window_count = v_row.window_count + 1,
    day_bucket = v_row.day_bucket,
    day_count = v_row.day_count,
    updated_at = v_now
  WHERE user_id = v_uid;

  RETURN jsonb_build_object('ok', true, 'dailyRemaining', v_daily_limit - v_row.day_count);
END;
$$;

REVOKE ALL ON FUNCTION check_resume_parse_rate_limit(integer, integer, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION check_resume_parse_rate_limit(integer, integer, integer, integer) TO authenticated;

-- ── record_resume_parse_success() ──
-- Called AFTER parseResumeForUser returns a genuine (non-cache-reused)
-- success — see extensionApi.ts. A rejected/invalid file, or a byte-
-- identical reuse served from cache, never reaches this call.
CREATE OR REPLACE FUNCTION record_resume_parse_success()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_today date := (now() AT TIME ZONE 'UTC')::date;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  UPDATE resume_parse_usage SET
    day_count = CASE WHEN day_bucket IS DISTINCT FROM v_today THEN 1 ELSE day_count + 1 END,
    day_bucket = v_today,
    updated_at = now()
  WHERE user_id = v_uid;
END;
$$;

REVOKE ALL ON FUNCTION record_resume_parse_success() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION record_resume_parse_success() TO authenticated;
