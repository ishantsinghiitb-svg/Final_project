-- ── Module 7B: AI Interview Preparation — intelligence upgrade ──
--
-- Purely additive. One new nullable column on interview_preps for the
-- optional "Additional Interview Context" the candidate can type before
-- generating (e.g. "final hiring manager round", "they'll focus on SQL").
-- Reused automatically on Regenerate the same way manual_job_description
-- already is. No changes to any other table, no changes to RLS policies,
-- no changes to credit/session columns.

ALTER TABLE interview_preps
  ADD COLUMN IF NOT EXISTS additional_context text;
