-- ── Module 7C: AI Mock Interview Studio ──
--
-- Purely additive. No renames, no drops, no changes to `interviews` (7A) or
-- `interview_preps` / `interview_prep_answers` (7B).
--
-- Two new tables:
--   • mock_interview_sessions — one row per 5-credit mock interview purchase.
--     Unlike interview_preps (1:1 with an interview), MANY sessions can exist
--     per interview — each Start is its own paid session with its own report,
--     so history is never overwritten.
--   • mock_interview_turns    — one row per question/answer exchange within a
--     session. Pairing question + answer + evaluation in a single row keeps
--     the final report's citations (turn_index) trivial to ground.
--
-- No changes to ai_cache / ai_runs / ai_analyses — already generic across
-- capabilities via the `capability` text column. This module writes ai_runs
-- but deliberately never writes ai_cache (see MockInterviewAIService.ts —
-- caching is off by design for a live conversation).

-- ════════════════════════════════════════════════════════════════════════
-- 1. mock_interview_sessions
-- ════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS mock_interview_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  interview_id uuid NOT NULL REFERENCES interviews(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Idempotency for the ONE charged call in this module. The client mints
  -- this before calling Start; a retried/duplicated request returns the
  -- existing session instead of charging 5 credits twice.
  client_key uuid NOT NULL,

  -- Setup, captured at start and immutable for the session's life.
  interviewer_role text NOT NULL,
  interviewer_role_label text NOT NULL,
  role_family text NOT NULL,
  round_label text,
  focus text,
  -- Standalone-interview inputs (NULL when interviews.job_id is set), same
  -- convention as interview_preps.manual_job_description.
  manual_job_description text,
  manual_company_description text,

  -- Phase 1 (Planning) output. `plan` is the client-safe subset (no
  -- candidate-profile-only-for-prompting internals); `plan_reasoning` is the
  -- model's internal analysis, server-only, never selected by any client
  -- repository — same convention as interview_preps.reasoning.
  plan jsonb,
  plan_reasoning jsonb,

  status text NOT NULL DEFAULT 'active',
  ended_reason text,

  -- Timer bookkeeping: accumulated elapsed time + the currently-running
  -- segment's start. `last_resumed_at` is NULL while paused/ended, so elapsed
  -- is always derivable as elapsed_ms + (now - last_resumed_at) when active.
  started_at timestamptz NOT NULL DEFAULT now(),
  elapsed_ms bigint NOT NULL DEFAULT 0,
  last_resumed_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,

  turn_count integer NOT NULL DEFAULT 0,
  coverage jsonb NOT NULL DEFAULT '{"competencies":[]}'::jsonb,
  -- Compact carry-forward context for the next turn's prompt — replaces the
  -- resume/job/prior-analyses payload after planning so per-turn prompts stay
  -- small and fast (see MockInterviewAIService.ts).
  rolling_summary text,

  -- Phase 3 (Final Report) output.
  report jsonb,
  report_reasoning jsonb,
  report_generated_at timestamptz,
  report_attempts integer NOT NULL DEFAULT 0,

  model text,
  prompt_version text,
  analysis_version text,
  resume_file_hash text,
  job_hash text,
  credits_charged integer NOT NULL DEFAULT 0,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT mock_interview_sessions_status_check
    CHECK (status IN ('active', 'paused', 'concluded', 'failed'))
);

ALTER TABLE mock_interview_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mock_interview_sessions_select_own" ON mock_interview_sessions;
CREATE POLICY "mock_interview_sessions_select_own" ON mock_interview_sessions FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "mock_interview_sessions_insert_own" ON mock_interview_sessions;
CREATE POLICY "mock_interview_sessions_insert_own" ON mock_interview_sessions FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "mock_interview_sessions_update_own" ON mock_interview_sessions;
CREATE POLICY "mock_interview_sessions_update_own" ON mock_interview_sessions FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "mock_interview_sessions_delete_own" ON mock_interview_sessions;
CREATE POLICY "mock_interview_sessions_delete_own" ON mock_interview_sessions FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS mock_interview_sessions_set_updated_at ON mock_interview_sessions;
CREATE TRIGGER mock_interview_sessions_set_updated_at BEFORE UPDATE ON mock_interview_sessions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- One session per (user, client_key) — the idempotency guarantee for Start.
CREATE UNIQUE INDEX IF NOT EXISTS idx_mock_sessions_client_key
  ON mock_interview_sessions (user_id, client_key);

CREATE INDEX IF NOT EXISTS idx_mock_sessions_interview
  ON mock_interview_sessions (interview_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_mock_sessions_user ON mock_interview_sessions (user_id);

-- ════════════════════════════════════════════════════════════════════════
-- 2. mock_interview_turns — one exchange (question + answer) per row
-- ════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS mock_interview_turns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES mock_interview_sessions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  turn_index integer NOT NULL,

  -- What the interviewer said.
  interviewer_message text NOT NULL,
  action text,
  target_competency text,
  references_turn integer,

  -- What the candidate said.
  candidate_answer text,
  answer_input_mode text,
  answered_at timestamptz,

  -- SERVER-ONLY. Written when the NEXT turn's call evaluates this answer;
  -- read only by report generation. Never selected by any client repository
  -- (mirrors interview_preps.reasoning and this table's own plan_reasoning).
  evaluation jsonb,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, turn_index),

  CONSTRAINT mock_interview_turns_answer_input_mode_check
    CHECK (answer_input_mode IS NULL OR answer_input_mode IN ('voice', 'text', 'mixed', 'skipped'))
);

ALTER TABLE mock_interview_turns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mock_interview_turns_select_own" ON mock_interview_turns;
CREATE POLICY "mock_interview_turns_select_own" ON mock_interview_turns FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "mock_interview_turns_insert_own" ON mock_interview_turns;
CREATE POLICY "mock_interview_turns_insert_own" ON mock_interview_turns FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "mock_interview_turns_update_own" ON mock_interview_turns;
CREATE POLICY "mock_interview_turns_update_own" ON mock_interview_turns FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "mock_interview_turns_delete_own" ON mock_interview_turns;
CREATE POLICY "mock_interview_turns_delete_own" ON mock_interview_turns FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS mock_interview_turns_set_updated_at ON mock_interview_turns;
CREATE TRIGGER mock_interview_turns_set_updated_at BEFORE UPDATE ON mock_interview_turns
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS idx_mock_turns_session
  ON mock_interview_turns (session_id, turn_index);
