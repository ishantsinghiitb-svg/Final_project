-- ── Module 7A: Interview Workspace ──
--
-- Purely additive. No renames, no drops.
--
-- The `interviews` table already exists (see
-- 20260713131602_create_interview_notification_preference_analytics_tables.sql)
-- with RLS, an `updated_at` trigger, and indexes — but it has never been
-- populated or read by any app code. This migration extends it with the
-- columns the real Interview Workspace needs; `company_name`, `role`,
-- `scheduled_at`, `interviewer`, `type` (Interview Round), `status`, `link`
-- (Meeting Link) and `application_id` are reused as-is.
--
-- `prep` (the original placeholder notes column) is left in place, unused —
-- superseded by the new `notes` column below.
--
-- Snapshot design: mirrors the `applications` table's own job-snapshot
-- pattern (denormalized fields + a soft FK) rather than Module 6's AI-cache
-- content-hashing, since there's no AI cache to invalidate here.

ALTER TABLE interviews
  -- Online/offline + where: mode drives which of link/location is shown.
  ADD COLUMN IF NOT EXISTS mode                 text NOT NULL DEFAULT 'online',
  ADD COLUMN IF NOT EXISTS location             text,
  -- Resume Snapshot: soft link + a name captured at link time so the
  -- interview still shows a meaningful label if the resume is later renamed
  -- or deleted (ON DELETE SET NULL breaks the link, not the display).
  ADD COLUMN IF NOT EXISTS resume_id            uuid REFERENCES resumes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS resume_name_snapshot text,
  -- Job Snapshot: soft link back to the live posting, if any. company_name/
  -- role (already NOT NULL on this table) are the denormalized display data.
  ADD COLUMN IF NOT EXISTS job_id               uuid REFERENCES global_jobs(id) ON DELETE SET NULL,
  -- Rich text notes (markdown-subset plain text — see src/lib/richText.ts).
  ADD COLUMN IF NOT EXISTS notes                text;

-- Guarded so re-runs don't error.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'interviews_mode_check'
  ) THEN
    ALTER TABLE interviews
      ADD CONSTRAINT interviews_mode_check
      CHECK (mode IN ('online', 'offline'));
  END IF;
END$$;

-- Resume/job snapshot lookups, mirroring idx_applications_resume_id /
-- idx_applications_cover_letter_id.
CREATE INDEX IF NOT EXISTS idx_interviews_resume_id ON interviews (resume_id);
CREATE INDEX IF NOT EXISTS idx_interviews_job_id ON interviews (job_id);
