-- ── Module 6A: AI Foundation & Resume Management ──
--
-- Purely additive. No renames, no drops, no changes to Module 1–5 behavior.
--   • Extends `resumes` with resume-management metadata + a deterministic file
--     hash + parse status (existing columns and the Module 3B resume picker are
--     untouched — only new nullable/defaulted columns are added).
--   • `resume_parsed`     — 1:1 deterministic parse output (text + structured +
--                           health). This IS the parse cache (reuse by file hash).
--   • `ai_runs`           — audit/cost log of every AI invocation (future).
--   • `ai_cache`          — content-addressed AI response cache, versioned by
--                           prompt_version AND analysis_version.
--   • `user_ai_usage`     — MVP AI credits (no subscriptions/payments).
--   • RPCs                — consume_ai_credit / ensure_ai_usage / set_default_resume.
--
-- The AI engine is built but ships no user-facing AI output in 6A. Resume
-- parsing + health are deterministic and independent of the AI engine.

-- ════════════════════════════════════════════════════════════════════════
-- 1. resumes — additive columns
-- ════════════════════════════════════════════════════════════════════════
ALTER TABLE resumes
  ADD COLUMN IF NOT EXISTS is_default boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS file_name text,
  ADD COLUMN IF NOT EXISTS file_hash text,                 -- sha256 of the uploaded bytes
  ADD COLUMN IF NOT EXISTS file_size_bytes bigint,
  ADD COLUMN IF NOT EXISTS mime_type text,
  ADD COLUMN IF NOT EXISTS page_count integer,
  ADD COLUMN IF NOT EXISTS parse_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS parse_error text,
  ADD COLUMN IF NOT EXISTS parsed_at timestamptz;

-- Constrain parse_status to the known set (guarded so re-runs don't error).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'resumes_parse_status_check'
  ) THEN
    ALTER TABLE resumes
      ADD CONSTRAINT resumes_parse_status_check
      CHECK (parse_status IN ('pending', 'processing', 'ready', 'failed'));
  END IF;
END$$;

-- At most one default resume per user.
CREATE UNIQUE INDEX IF NOT EXISTS resumes_one_default_per_user
  ON resumes (user_id) WHERE is_default;

-- Fast reuse-by-hash lookup (skip re-parsing identical files).
CREATE INDEX IF NOT EXISTS resumes_user_file_hash_idx
  ON resumes (user_id, file_hash);

-- ════════════════════════════════════════════════════════════════════════
-- 2. resume_parsed — deterministic parse output (1:1 with resumes)
-- ════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS resume_parsed (
  resume_id uuid PRIMARY KEY REFERENCES resumes(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  resume_file_hash text,                 -- denormalized for reuse-by-hash lookups
  parser_version text NOT NULL,
  raw_text text,
  structured jsonb,                      -- StructuredResume (see features/ai/schemas)
  health jsonb,                          -- deterministic ResumeHealth report
  parse_confidence real,
  char_count integer,
  token_estimate integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE resume_parsed ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "resume_parsed_select_own" ON resume_parsed;
CREATE POLICY "resume_parsed_select_own" ON resume_parsed FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "resume_parsed_insert_own" ON resume_parsed;
CREATE POLICY "resume_parsed_insert_own" ON resume_parsed FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "resume_parsed_update_own" ON resume_parsed;
CREATE POLICY "resume_parsed_update_own" ON resume_parsed FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "resume_parsed_delete_own" ON resume_parsed;
CREATE POLICY "resume_parsed_delete_own" ON resume_parsed FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS resume_parsed_user_hash_idx
  ON resume_parsed (user_id, resume_file_hash);

DROP TRIGGER IF EXISTS resume_parsed_set_updated_at ON resume_parsed;
CREATE TRIGGER resume_parsed_set_updated_at BEFORE UPDATE ON resume_parsed
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ════════════════════════════════════════════════════════════════════════
-- 3. ai_runs — audit / cost log of every AI invocation
-- ════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS ai_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  capability text NOT NULL,
  provider text NOT NULL,
  model text NOT NULL,
  prompt_id text,
  prompt_version text,
  analysis_version text,
  input_hash text,
  job_hash text,
  resume_id uuid REFERENCES resumes(id) ON DELETE SET NULL,
  job_id uuid,                           -- soft ref to global_jobs (kept if job deleted)
  status text NOT NULL DEFAULT 'success', -- success | error | limit_reached
  cache_hit boolean NOT NULL DEFAULT false,
  credits_charged integer NOT NULL DEFAULT 0,
  input_tokens integer,
  output_tokens integer,
  latency_ms integer,
  cost_usd numeric(10, 6),
  error_code text,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ai_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ai_runs_select_own" ON ai_runs;
CREATE POLICY "ai_runs_select_own" ON ai_runs FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "ai_runs_insert_own" ON ai_runs;
CREATE POLICY "ai_runs_insert_own" ON ai_runs FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS ai_runs_user_capability_idx
  ON ai_runs (user_id, capability, created_at DESC);

-- ════════════════════════════════════════════════════════════════════════
-- 4. ai_cache — content-addressed AI response cache (prompt + analysis versioned)
-- ════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS ai_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  capability text NOT NULL,
  input_hash text NOT NULL,
  prompt_version text NOT NULL,
  analysis_version text NOT NULL,
  model text NOT NULL,
  job_hash text,                         -- job snapshot ref: edits don't invalidate history
  response jsonb NOT NULL,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, capability, input_hash, prompt_version, analysis_version, model)
);

ALTER TABLE ai_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ai_cache_select_own" ON ai_cache;
CREATE POLICY "ai_cache_select_own" ON ai_cache FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "ai_cache_insert_own" ON ai_cache;
CREATE POLICY "ai_cache_insert_own" ON ai_cache FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "ai_cache_delete_own" ON ai_cache;
CREATE POLICY "ai_cache_delete_own" ON ai_cache FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS ai_cache_lookup_idx
  ON ai_cache (user_id, capability, input_hash);

-- ════════════════════════════════════════════════════════════════════════
-- 5. user_ai_usage — MVP AI credits (no subscriptions)
-- ════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS user_ai_usage (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  plan text NOT NULL DEFAULT 'free',     -- future: subscription plans plug in here
  credits_total integer NOT NULL DEFAULT 0,
  credits_used integer NOT NULL DEFAULT 0,
  credits_remaining integer GENERATED ALWAYS AS (GREATEST(credits_total - credits_used, 0)) STORED,
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE user_ai_usage ENABLE ROW LEVEL SECURITY;

-- Client may READ its own credit balance (paywall detection). Writes happen
-- only through the SECURITY DEFINER RPCs below — users cannot grant themselves
-- credits by writing the row directly (no INSERT/UPDATE policy).
DROP POLICY IF EXISTS "user_ai_usage_select_own" ON user_ai_usage;
CREATE POLICY "user_ai_usage_select_own" ON user_ai_usage FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS user_ai_usage_set_updated_at ON user_ai_usage;
CREATE TRIGGER user_ai_usage_set_updated_at BEFORE UPDATE ON user_ai_usage
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── ensure_ai_usage(p_credits_total) ──
-- Idempotently create the caller's usage row with the given free allowance
-- (config-driven; the DB never hardcodes the credit count). Returns the row.
CREATE OR REPLACE FUNCTION ensure_ai_usage(p_credits_total integer)
RETURNS user_ai_usage
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row user_ai_usage;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  INSERT INTO user_ai_usage (user_id, credits_total)
  VALUES (v_uid, GREATEST(COALESCE(p_credits_total, 0), 0))
  ON CONFLICT (user_id) DO NOTHING;

  SELECT * INTO v_row FROM user_ai_usage WHERE user_id = v_uid;
  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION ensure_ai_usage(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ensure_ai_usage(integer) TO authenticated;

-- ── consume_ai_credit(p_capability, p_cost, p_credits_total) ──
-- Atomically charge credits for one AI generation. Creates the usage row with
-- p_credits_total on first use. Returns a structured jsonb result — it NEVER
-- raises on exhaustion, so the AI engine can return a "feature locked" envelope.
--   success:   { ok: true,  credits_remaining, credits_used, credits_total, plan }
--   exhausted: { ok: false, code: 'ai_limit_reached', credits_remaining: 0, ... }
CREATE OR REPLACE FUNCTION consume_ai_credit(
  p_capability text,
  p_cost integer,
  p_credits_total integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_cost integer := GREATEST(COALESCE(p_cost, 1), 0);
  v_row user_ai_usage;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  INSERT INTO user_ai_usage (user_id, credits_total)
  VALUES (v_uid, GREATEST(COALESCE(p_credits_total, 0), 0))
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

REVOKE ALL ON FUNCTION consume_ai_credit(text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION consume_ai_credit(text, integer, integer) TO authenticated;

-- ── set_default_resume(p_resume_id) ──
-- Atomically move the "default" flag to one resume (unset then set, so the
-- one-default-per-user unique index never conflicts). Runs under the caller's
-- RLS — only the caller's own resumes are affected.
CREATE OR REPLACE FUNCTION set_default_resume(p_resume_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  UPDATE resumes SET is_default = false
    WHERE user_id = v_uid AND is_default;

  UPDATE resumes SET is_default = true
    WHERE id = p_resume_id AND user_id = v_uid;
END;
$$;

REVOKE ALL ON FUNCTION set_default_resume(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION set_default_resume(uuid) TO authenticated;
