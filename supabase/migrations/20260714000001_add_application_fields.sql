-- ── Module 2A: Add inherited job fields to applications ──
-- These columns store the denormalised snapshot of the job at application time.
-- They are populated from the GlobalJob when the application is created via the
-- "Did you apply?" flow, so they remain accurate even if the global job is later
-- modified or deleted (job_id → SET NULL on cascade).

ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS location         text,
  ADD COLUMN IF NOT EXISTS salary_min       numeric,
  ADD COLUMN IF NOT EXISTS salary_max       numeric,
  ADD COLUMN IF NOT EXISTS salary_currency  text,
  ADD COLUMN IF NOT EXISTS source           text,
  ADD COLUMN IF NOT EXISTS url              text;

-- Add an index on status for efficient Kanban queries
CREATE INDEX IF NOT EXISTS idx_applications_user_status
  ON applications (user_id, status);

-- Add an index on applied_at for sorting
CREATE INDEX IF NOT EXISTS idx_applications_user_applied_at
  ON applications (user_id, applied_at DESC NULLS LAST);
