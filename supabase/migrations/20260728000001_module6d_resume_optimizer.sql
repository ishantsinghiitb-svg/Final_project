-- ── Module 6D: Resume Optimization Studio ──
--
-- Purely additive. No renames, no drops, no changes to Module 1–6C behavior.
-- The optimizer reuses the existing AI engine tables wholesale:
--   • ai_cache    — optimizer responses are cached by input_hash (unchanged).
--   • ai_runs     — every optimize run is audited (unchanged).
--   • ai_analyses — each optimization is stored as a durable, generic history
--                   row (capability = 'resume_optimizer'); no new table.
--   • user_ai_usage / consume_ai_credit / refund_ai_credit — shared credit pool.
--
-- The ONLY schema change is enriching `resume_versions` (created in Module 3B)
-- with nullable metadata so a saved optimized version can carry its own name and
-- record how it was produced. Existing rows and the Module 6A resume-management
-- surface are untouched — every column below is nullable/defaulted.

ALTER TABLE resume_versions
  ADD COLUMN IF NOT EXISTS name text,                    -- user-chosen version name ("Product Resume v2")
  ADD COLUMN IF NOT EXISTS source text,                  -- how it was created (e.g. 'optimizer')
  ADD COLUMN IF NOT EXISTS category text,                -- optimizer career category, when source = 'optimizer'
  ADD COLUMN IF NOT EXISTS analysis_id uuid REFERENCES ai_analyses(id) ON DELETE SET NULL;

-- List a resume's versions newest-first (the "switch between versions" surface).
CREATE INDEX IF NOT EXISTS resume_versions_resume_created_idx
  ON resume_versions (resume_id, version_number DESC);
