-- ── Module 7B: AI Interview Preparation ──
--
-- Purely additive. No renames, no drops, no changes to `interviews` (7A).
--
-- Two new tables:
--   • interview_preps        — one generated workspace per interview (1:1).
--   • interview_prep_answers — one editable answer per question per prep.
--
-- interview_id/resume_id/job_id already live on `interviews` (7A) and stay the
-- single source of truth for "which resume/job" — interview_preps does NOT
-- duplicate those as FK columns, only the hashes actually used for a given
-- generation (for cache/audit purposes), to avoid the two tables drifting.
--
-- No changes to ai_cache / ai_runs / ai_analyses — they are already generic
-- across capabilities via the `capability` text column.

-- ════════════════════════════════════════════════════════════════════════
-- 1. interview_preps — one generated workspace per interview (1:1)
-- ════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS interview_preps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  interview_id uuid NOT NULL UNIQUE REFERENCES interviews(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Standalone-interview inputs (NULL when interviews.job_id is set — the live
  -- global_jobs row is the source of truth in that case). Persisted here (not
  -- on `interviews`) so 7A's table stays untouched, and so Regenerate can reuse
  -- or edit them without re-typing.
  manual_job_description text,
  manual_company_description text,

  -- Generated content (validated InterviewPrepDraft, minus `internal`) and the
  -- model's reasoning block — reasoning is stored for quality debugging only,
  -- same convention as cover_letters' `reasoning` on ai_analyses. Never shown.
  content jsonb,
  reasoning jsonb,

  model text,
  prompt_version text,
  analysis_version text,
  resume_file_hash text,
  job_hash text,
  input_hash text,

  -- Editing-session gate — identical mechanism to cover_letters.ai_session_id.
  -- Opens/rotates only on a charged event (generate or regenerate-entire).
  ai_session_id uuid,
  ai_session_started_at timestamptz,

  -- User-tracked, non-AI progress: e.g. { "checklistChecked": ["c-0","c-2"] }.
  -- Question-answer progress is NOT duplicated here — it's derived from the
  -- presence/content of rows in interview_prep_answers.
  progress jsonb NOT NULL DEFAULT '{}'::jsonb,

  generated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE interview_preps ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "interview_preps_select_own" ON interview_preps;
CREATE POLICY "interview_preps_select_own" ON interview_preps FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "interview_preps_insert_own" ON interview_preps;
CREATE POLICY "interview_preps_insert_own" ON interview_preps FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "interview_preps_update_own" ON interview_preps;
CREATE POLICY "interview_preps_update_own" ON interview_preps FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "interview_preps_delete_own" ON interview_preps;
CREATE POLICY "interview_preps_delete_own" ON interview_preps FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS interview_preps_set_updated_at ON interview_preps;
CREATE TRIGGER interview_preps_set_updated_at BEFORE UPDATE ON interview_preps
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS idx_interview_preps_user_id ON interview_preps (user_id);

-- ════════════════════════════════════════════════════════════════════════
-- 2. interview_prep_answers — one editable answer per question per prep
-- ════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS interview_prep_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  interview_prep_id uuid NOT NULL REFERENCES interview_preps(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Stable id assigned server-side at generation time (q-0, q-1, ...) —
  -- matches an entry in interview_preps.content.questions[].id.
  question_id text NOT NULL,
  answer text NOT NULL DEFAULT '',
  ai_generated boolean NOT NULL DEFAULT false,
  last_generated_at timestamptz,
  edited_at timestamptz,
  model text,
  prompt_version text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (interview_prep_id, question_id)
);

ALTER TABLE interview_prep_answers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "interview_prep_answers_select_own" ON interview_prep_answers;
CREATE POLICY "interview_prep_answers_select_own" ON interview_prep_answers FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "interview_prep_answers_insert_own" ON interview_prep_answers;
CREATE POLICY "interview_prep_answers_insert_own" ON interview_prep_answers FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "interview_prep_answers_update_own" ON interview_prep_answers;
CREATE POLICY "interview_prep_answers_update_own" ON interview_prep_answers FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "interview_prep_answers_delete_own" ON interview_prep_answers;
CREATE POLICY "interview_prep_answers_delete_own" ON interview_prep_answers FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS interview_prep_answers_set_updated_at ON interview_prep_answers;
CREATE TRIGGER interview_prep_answers_set_updated_at BEFORE UPDATE ON interview_prep_answers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS idx_interview_prep_answers_prep_id
  ON interview_prep_answers (interview_prep_id);
