-- ── Module 6B: Resume Match (AI Fit Analysis) ──
--
-- Purely additive on top of Module 6A. No renames, no drops.
--   • `ai_analyses`       — durable, append-only store of every AI analysis a
--                           user actually ran (one row per generation, cache
--                           hits included). This is the display/history layer;
--                           `ai_cache` (6A) remains the engine-internal,
--                           credit-saving dedup cache. Generic across
--                           capabilities so future modules (ATS Score, Resume
--                           Optimizer, Cover Letter) reuse it without a new
--                           table.
--   • `refund_ai_credit`  — symmetric counterpart to `consume_ai_credit` (6A),
--                           so a provider/validation failure after a credit
--                           was charged can be made whole instead of silently
--                           billing the user for nothing.

-- ════════════════════════════════════════════════════════════════════════
-- 1. ai_analyses — durable, append-only AI analysis results
-- ════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS ai_analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  capability text NOT NULL,
  resume_id uuid REFERENCES resumes(id) ON DELETE SET NULL,
  job_id uuid,                           -- soft ref to global_jobs (kept if job deleted)
  resume_file_hash text,
  job_hash text,                         -- job snapshot ref: edits don't invalidate history
  input_hash text NOT NULL,              -- ties this row to its exact ai_cache entry
  prompt_version text NOT NULL,
  analysis_version text NOT NULL,
  model text NOT NULL,
  score integer,                         -- denormalized overallScore for list/sort without JSON parse
  result jsonb NOT NULL,                 -- full validated capability output (public + internal fields)
  cache_hit boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ai_analyses ENABLE ROW LEVEL SECURITY;

-- Append-only: SELECT + INSERT only, no UPDATE/DELETE policy — mirrors ai_runs.
DROP POLICY IF EXISTS "ai_analyses_select_own" ON ai_analyses;
CREATE POLICY "ai_analyses_select_own" ON ai_analyses FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "ai_analyses_insert_own" ON ai_analyses;
CREATE POLICY "ai_analyses_insert_own" ON ai_analyses FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

-- "Latest analysis for this resume+job" (the Match card) and history list.
CREATE INDEX IF NOT EXISTS ai_analyses_resume_job_idx
  ON ai_analyses (user_id, resume_id, job_id, created_at DESC);

-- "Latest analysis for this job" across capabilities (future list/badge use).
CREATE INDEX IF NOT EXISTS ai_analyses_capability_job_idx
  ON ai_analyses (user_id, capability, job_id, created_at DESC);

-- ════════════════════════════════════════════════════════════════════════
-- 2. refund_ai_credit(p_capability, p_cost) — compensating action for
--    consume_ai_credit when a charged generation ultimately fails
-- ════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION refund_ai_credit(
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
  v_cost integer := GREATEST(COALESCE(p_cost, 0), 0);
  v_row user_ai_usage;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  UPDATE user_ai_usage
    SET credits_used = GREATEST(credits_used - v_cost, 0)
    WHERE user_id = v_uid
    RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'usage row not found for user';
  END IF;

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

REVOKE ALL ON FUNCTION refund_ai_credit(text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION refund_ai_credit(text, integer) TO authenticated;
