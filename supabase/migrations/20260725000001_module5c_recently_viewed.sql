-- ── Module 5C: Recently Viewed ──
--
-- Tracks, per user, which global_jobs a user has opened the detail page for.
-- One row per (user, job) — opening a job again is an upsert that only bumps
-- viewed_at, so there are never duplicate entries and "no duplicates" /
-- "opening a job updates its timestamp" both fall out of the UNIQUE
-- constraint + ON CONFLICT upsert (same convention as collection_jobs.addJob).
--
-- "Maximum 10" is enforced on the READ side only (ORDER BY viewed_at DESC
-- LIMIT 10) — historical rows beyond 10 are kept, never deleted, per product
-- decision. No trigger, no cleanup job — purely additive.
--
-- Lives alongside saved_jobs conceptually (a lightweight per-user/per-job
-- fact, not a new top-level entity), so its read/write methods live in the
-- existing JobRepository/JobService rather than a new repository.

CREATE TABLE IF NOT EXISTS recently_viewed (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES global_jobs(id) ON DELETE CASCADE,
  viewed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, job_id)
);

ALTER TABLE recently_viewed ENABLE ROW LEVEL SECURITY;

CREATE POLICY "recently_viewed_select_own" ON recently_viewed FOR SELECT
  TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "recently_viewed_insert_own" ON recently_viewed FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "recently_viewed_update_own" ON recently_viewed FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "recently_viewed_delete_own" ON recently_viewed FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_recently_viewed_user_viewed
  ON recently_viewed (user_id, viewed_at DESC);
