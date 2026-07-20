-- ── Module 5A: Saved Job archive ──
--
-- Adds soft-archive state to saved_jobs so a user can tuck a bookmark away
-- without losing it — "archive instead of delete" (frozen product decision #7).
-- Purely additive: two nullable/defaulted columns plus one index. The existing
-- save (INSERT) and unsave (DELETE) behavior is unchanged — archiving is a new,
-- separate state layered on top, never a replacement for either.
--
-- Does NOT touch global_jobs, upsert_global_job, the dedup engine, or any
-- Module 1–4 object. No renames, no drops.

ALTER TABLE saved_jobs
  ADD COLUMN IF NOT EXISTS archived    boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

-- The Saved page lists active bookmarks by default and archived ones on
-- demand, both scoped to the owner and ordered by recency — this composite
-- keeps both partitions fast without a full scan of the user's saves.
CREATE INDEX IF NOT EXISTS idx_saved_jobs_user_archived
  ON saved_jobs (user_id, archived, created_at DESC);
