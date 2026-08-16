-- ── Module 13 · Phase 2 (A1): Secure AI credit refunds ──
--
-- PROBLEM: `refund_ai_credit(p_capability text, p_cost integer)` is
-- SECURITY DEFINER and granted to `authenticated`, so it is directly
-- callable from any logged-in browser session via `supabase.rpc(...)`. It
-- trusted the CALLER-SUPPLIED `p_cost` and unconditionally decremented
-- `credits_used` with no link to any specific charge — a user could call it
-- repeatedly with an arbitrary cost to reset their own `credits_used` to 0
-- on demand, defeating the credit system entirely.
--
-- FIX: replace the (capability, cost) signature with a single
-- `p_ai_run_id uuid` referencing a specific `ai_runs` row. The refund amount
-- is derived from that row's own `credits_charged` (never from client
-- input), and is only honored when the row:
--   1. exists,
--   2. belongs to the caller (auth.uid() = ai_runs.user_id),
--   3. is in a refundable state (status = 'error'),
--   4. has not already been refunded (refunded_at IS NULL),
--   5. actually has a nonzero charge to reverse.
-- The row is locked (`FOR UPDATE`) before these checks, and the credit
-- decrement + `ai_runs` refunded-marker update happen in the same
-- transaction as the checks, so two concurrent/replayed calls for the same
-- run can never both succeed — the second always fails the
-- `refunded_at IS NULL` check.
--
-- `credits_charged` on the refunded row is zeroed as part of the same
-- update, preserving the existing invariant every caller already depends on
-- (`ai_runs.credits_charged` = net cost the user actually paid for that
-- run) — see AIService.ts's `logRun` comment on this field.

-- ── 1. Anti-replay marker ──
ALTER TABLE ai_runs ADD COLUMN IF NOT EXISTS refunded_at timestamptz;

-- ── 2. Drop the vulnerable (capability, cost) signature ──
-- This is a distinct overload from the new (uuid) signature below — Postgres
-- does not replace it via CREATE OR REPLACE, so it must be dropped
-- explicitly or the old, unrestricted entry point keeps working.
DROP FUNCTION IF EXISTS refund_ai_credit(text, integer);

-- ── 3. New ai_run_id-scoped refund ──
CREATE OR REPLACE FUNCTION refund_ai_credit(p_ai_run_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_run ai_runs;
  v_usage user_ai_usage;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  -- Lock the run row first so a concurrent/replayed refund for the same id
  -- serializes behind this one instead of racing it.
  SELECT * INTO v_run FROM ai_runs WHERE id = p_ai_run_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ai run not found';
  END IF;
  IF v_run.user_id != v_uid THEN
    RAISE EXCEPTION 'ai run does not belong to caller';
  END IF;
  IF v_run.status != 'error' THEN
    RAISE EXCEPTION 'ai run is not in a refundable state';
  END IF;
  IF v_run.refunded_at IS NOT NULL THEN
    RAISE EXCEPTION 'ai run has already been refunded';
  END IF;
  IF v_run.credits_charged <= 0 THEN
    RAISE EXCEPTION 'ai run has nothing to refund';
  END IF;

  UPDATE user_ai_usage
    SET credits_used = GREATEST(credits_used - v_run.credits_charged, 0)
    WHERE user_id = v_uid
    RETURNING * INTO v_usage;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'usage row not found for user';
  END IF;

  UPDATE ai_runs
    SET refunded_at = now(),
        credits_charged = 0
    WHERE id = p_ai_run_id;

  RETURN jsonb_build_object(
    'ok', true,
    'capability', v_run.capability,
    'plan', v_usage.plan,
    'credits_total', v_usage.credits_total,
    'credits_used', v_usage.credits_used,
    'credits_remaining', v_usage.credits_remaining
  );
END;
$$;

REVOKE ALL ON FUNCTION refund_ai_credit(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION refund_ai_credit(uuid) TO authenticated;
