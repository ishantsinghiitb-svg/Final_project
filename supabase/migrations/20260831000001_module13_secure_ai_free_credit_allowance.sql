-- ── B1 fix — the free AI credit allowance can no longer be caller-supplied ──
--
-- PROBLEM: `ensure_ai_usage(p_credits_total integer)` and
-- `consume_ai_credit(p_capability text, p_cost integer, p_credits_total
-- integer)` are SECURITY DEFINER and GRANT EXECUTE TO authenticated, so both
-- are directly callable from any logged-in browser session via
-- `supabase.rpc(...)` (or a bare PostgREST POST) — the same exposure
-- `refund_ai_credit` had before 20260824000001_module13_secure_ai_credit_refund.sql
-- fixed it for that function. Both trusted the caller-supplied
-- `p_credits_total` verbatim (only floored at 0) to seed `user_ai_usage`:
--   INSERT INTO user_ai_usage (user_id, credits_total)
--   VALUES (v_uid, GREATEST(COALESCE(p_credits_total, 0), 0))
--   ON CONFLICT (user_id) DO NOTHING;
-- `ON CONFLICT DO NOTHING` means this only works once per user (before their
-- row exists), but that's all an attacker needs: any authenticated user could
-- call either RPC directly with an inflated p_credits_total (e.g.
-- 999999999) BEFORE ever touching a real AI feature, permanently seeding
-- their own row with that ceiling and defeating the free-tier paywall for
-- every subsequent AI generation (Resume Match, ATS, Optimizer, Cover
-- Letter, Interview Prep, Mock Interview) at the operator's OpenAI expense.
-- p_cost was never part of this — it is always cap.creditCost from the
-- fixed server-side capability registry (src/features/ai/capabilities.ts),
-- never client-supplied.
--
-- FIX: the free allowance becomes a hardcoded, server-controlled constant
-- inside each function (5 — the existing intended entitlement; see
-- VITE_AI_FREE_CREDITS default and the 20260729000001 backfill to 5). It is
-- no longer accepted as a parameter at all, so there is nothing for a caller
-- to influence. `p_cost` is untouched.

BEGIN;

-- ── 1. Drop the vulnerable signatures ──
-- Distinct overloads from the new signatures below — Postgres does not
-- replace them via CREATE OR REPLACE, so they must be dropped explicitly or
-- the old, unrestricted entry points keep working (same requirement noted in
-- 20260824000001 for refund_ai_credit).
DROP FUNCTION IF EXISTS ensure_ai_usage(integer);
DROP FUNCTION IF EXISTS consume_ai_credit(text, integer, integer);

-- ── 2. ensure_ai_usage() — no longer takes an allowance parameter ──
CREATE OR REPLACE FUNCTION ensure_ai_usage()
RETURNS user_ai_usage
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  -- The free-tier allowance for a brand-new user. Server/DB-controlled by
  -- construction: it is a constant in the function body, not a parameter, so
  -- no caller can influence it. Keep in sync with consume_ai_credit() below
  -- and with VITE_AI_FREE_CREDITS (the isomorphic, display-only copy of the
  -- same number — see .env.example).
  v_free_credits CONSTANT integer := 5;
  v_row user_ai_usage;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  INSERT INTO user_ai_usage (user_id, credits_total)
  VALUES (v_uid, v_free_credits)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT * INTO v_row FROM user_ai_usage WHERE user_id = v_uid;
  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION ensure_ai_usage() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ensure_ai_usage() TO authenticated;

-- ── 3. consume_ai_credit(p_capability, p_cost) — allowance parameter removed ──
CREATE OR REPLACE FUNCTION consume_ai_credit(
  p_capability text,
  p_cost integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  -- See ensure_ai_usage()'s matching declaration — same value, same reason.
  v_free_credits CONSTANT integer := 5;
  v_cost integer := GREATEST(COALESCE(p_cost, 1), 0);
  v_row user_ai_usage;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  INSERT INTO user_ai_usage (user_id, credits_total)
  VALUES (v_uid, v_free_credits)
  ON CONFLICT (user_id) DO NOTHING;

  -- Lock the row for an atomic check-and-decrement.
  SELECT * INTO v_row FROM user_ai_usage WHERE user_id = v_uid FOR UPDATE;

  IF v_row.credits_remaining < v_cost THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'ai_limit_reached',
      'capability', p_capability,
      'plan', v_row.plan,
      'credits_total', v_row.credits_total,
      'credits_used', v_row.credits_used,
      'credits_remaining', v_row.credits_remaining
    );
  END IF;

  UPDATE user_ai_usage
    SET credits_used = credits_used + v_cost,
        last_used_at = now()
    WHERE user_id = v_uid
    RETURNING * INTO v_row;

  RETURN jsonb_build_object(
    'ok', true,
    'capability', p_capability,
    'plan', v_row.plan,
    'credits_total', v_row.credits_total,
    'credits_used', v_row.credits_used,
    'credits_remaining', v_row.credits_remaining
  );
END;
$$;

REVOKE ALL ON FUNCTION consume_ai_credit(text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION consume_ai_credit(text, integer) TO authenticated;

-- ── 4. Remediate rows already self-granted an inflated allowance ──
-- No legitimate path sets credits_total above the free allowance for
-- plan='free' today (no subscriptions/payments, no admin credit-grant tool
-- exist yet — see this table's own "MVP AI credits (no subscriptions)"
-- header), so capping any such row back to 5 is safe and targeted. A no-op
-- on every row that was never exploited.
UPDATE user_ai_usage
   SET credits_total = 5
 WHERE plan = 'free'
   AND credits_total > 5;

COMMIT;
