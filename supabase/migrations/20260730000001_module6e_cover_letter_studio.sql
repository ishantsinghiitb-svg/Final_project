-- ── Module 6E: AI Cover Letter Studio (foundation phase) ──
--
-- Purely additive. No renames, no drops, no changes to Module 1–6D behavior.
--
-- The Studio reuses the existing AI engine tables wholesale, exactly like the
-- Resume Optimizer (6D) did:
--   • ai_cache    — generations are cached by input_hash (unchanged).
--   • ai_runs     — every generation / AI action is audited (unchanged).
--   • ai_analyses — each AI call is stored as a generic history row
--                   (capability = 'cover_letter'); no new analysis table.
--   • user_ai_usage / consume_ai_credit / refund_ai_credit — shared credit pool.
--
-- Two schema changes, both additive:
--   1. `cover_letters` (Module 3B) is promoted from an upload-only stub into the
--      Studio DOCUMENT. Every new column is nullable or defaulted, so existing
--      uploaded rows and the Module 3B application cover-letter picker keep
--      working untouched (source defaults to 'upload' for them).
--   2. `cover_letter_versions` — append-only version history, mirroring
--      `resume_versions`. Every generation, AI action, manual save, duplicate
--      and restore appends a row; nothing is ever overwritten.
--
-- NOTE ON NUMBERING: an earlier migration (20260729000001) is also labelled
-- "module 6E" (the AI quality pass). This is the second 6E migration — the
-- timestamp prefix keeps ordering unambiguous.

-- ════════════════════════════════════════════════════════════════════════
-- 1. cover_letters — the Studio document (additive columns only)
-- ════════════════════════════════════════════════════════════════════════
ALTER TABLE cover_letters
  -- Where the letter came from: 'upload' (Module 3B file upload) or 'studio'.
  ADD COLUMN IF NOT EXISTS source              text NOT NULL DEFAULT 'upload',
  -- Working buffer — the text currently shown in the editor. NULL for uploads.
  ADD COLUMN IF NOT EXISTS content             text,
  -- Soft ref to global_jobs (kept if the job row is later removed).
  ADD COLUMN IF NOT EXISTS job_id              uuid,
  ADD COLUMN IF NOT EXISTS resume_id           uuid REFERENCES resumes(id) ON DELETE SET NULL,
  -- Company / role snapshotted at creation so history reads correctly even if
  -- the job row changes or disappears.
  ADD COLUMN IF NOT EXISTS company_name        text,
  ADD COLUMN IF NOT EXISTS role_title          text,
  -- Generation settings last used (the Studio re-opens with these).
  ADD COLUMN IF NOT EXISTS tone                text,
  ADD COLUMN IF NOT EXISTS length              text,
  ADD COLUMN IF NOT EXISTS custom_instructions text,
  -- 'draft' | 'final' | 'downloaded'
  ADD COLUMN IF NOT EXISTS status              text NOT NULL DEFAULT 'draft',
  -- The version the editor buffer was last synced from.
  ADD COLUMN IF NOT EXISTS current_version_id  uuid,
  ADD COLUMN IF NOT EXISTS word_count          integer,
  ADD COLUMN IF NOT EXISTS last_edited_at      timestamptz,
  ADD COLUMN IF NOT EXISTS downloaded_at       timestamptz;

-- Constrain the new enum-ish columns (guarded so re-runs don't error).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cover_letters_status_check'
  ) THEN
    ALTER TABLE cover_letters
      ADD CONSTRAINT cover_letters_status_check
      CHECK (status IN ('draft', 'final', 'downloaded'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cover_letters_source_check'
  ) THEN
    ALTER TABLE cover_letters
      ADD CONSTRAINT cover_letters_source_check
      CHECK (source IN ('upload', 'studio'));
  END IF;
END$$;

-- History list: the user's letters, most recently touched first.
CREATE INDEX IF NOT EXISTS cover_letters_user_updated_idx
  ON cover_letters (user_id, updated_at DESC);

-- "Do I already have a letter for this job?" (the job-detail entry point).
CREATE INDEX IF NOT EXISTS cover_letters_user_job_idx
  ON cover_letters (user_id, job_id, updated_at DESC);

-- ════════════════════════════════════════════════════════════════════════
-- 2. cover_letter_versions — append-only version history
-- ════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS cover_letter_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cover_letter_id uuid NOT NULL REFERENCES cover_letters(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  version_number integer NOT NULL,
  content text NOT NULL,
  -- Optional user-facing label ("Shorter intro", "Final"). NULL = "Version N".
  label text,
  -- How this version was produced: 'generate' | 'ai_action' | 'manual'
  -- | 'duplicate' | 'restore'.
  source text NOT NULL DEFAULT 'manual',
  -- The specific AI action, when source = 'ai_action' (e.g. 'regenerate_intro').
  ai_action text,
  tone text,
  length text,
  custom_instructions text,
  -- Provenance for AI-produced versions (all NULL for manual edits).
  analysis_id uuid REFERENCES ai_analyses(id) ON DELETE SET NULL,
  model text,
  prompt_version text,
  analysis_version text,
  word_count integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cover_letter_id, version_number)
);

ALTER TABLE cover_letter_versions ENABLE ROW LEVEL SECURITY;

-- Append-only history with the one exception of `label` (rename a version), so
-- SELECT / INSERT / UPDATE are allowed but DELETE is not — versions disappear
-- only when their parent document is deleted (ON DELETE CASCADE).
DROP POLICY IF EXISTS "cover_letter_versions_select_own" ON cover_letter_versions;
CREATE POLICY "cover_letter_versions_select_own" ON cover_letter_versions FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "cover_letter_versions_insert_own" ON cover_letter_versions;
CREATE POLICY "cover_letter_versions_insert_own" ON cover_letter_versions FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "cover_letter_versions_update_own" ON cover_letter_versions;
CREATE POLICY "cover_letter_versions_update_own" ON cover_letter_versions FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- The version switcher: a document's versions, newest first.
CREATE INDEX IF NOT EXISTS cover_letter_versions_doc_number_idx
  ON cover_letter_versions (cover_letter_id, version_number DESC);
