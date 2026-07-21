-- ── Module 5B: Collections ──
--
-- User-defined groupings of Global Jobs ("Dream Companies", "Summer 2027",
-- "PM Internships", ...). A job may belong to many collections; collections
-- reference global_jobs by id only — no job data is duplicated, and a job
-- does NOT need to be saved first to be added to a collection.
--
-- Purely additive: two new tables, no change to any existing table, column,
-- index, policy, function, or trigger.

-- ── collections ──
CREATE TABLE IF NOT EXISTS collections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  -- Small preset key (e.g. "blue", "purple") mirroring the existing Chip tone
  -- vocabulary — validated app-side, not constrained here (same convention as
  -- applications.priority, which is CHECK-constrained; color is purely
  -- cosmetic so it's left unconstrained to avoid a migration every time a
  -- preset is added).
  color text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE collections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "collections_select_own" ON collections FOR SELECT
  TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "collections_insert_own" ON collections FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "collections_update_own" ON collections FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "collections_delete_own" ON collections FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- Reuses the shared set_updated_at() trigger function already used by
-- global_jobs, applications, saved_jobs's siblings, cover_letters, etc.
CREATE TRIGGER collections_set_updated_at BEFORE UPDATE ON collections
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS idx_collections_user_id ON collections (user_id);
CREATE INDEX IF NOT EXISTS idx_collections_user_updated ON collections (user_id, updated_at DESC);

-- ── collection_jobs (join; references global_jobs — no job duplication) ──
CREATE TABLE IF NOT EXISTS collection_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id uuid NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES global_jobs(id) ON DELETE CASCADE,
  -- Denormalized owner, same convention as application_contacts /
  -- application_reminders — lets RLS scope directly on this table without a
  -- join back to collections, and lets findCollectionIdsForJob query by
  -- (user_id, job_id) without joining.
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  added_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (collection_id, job_id)
);

ALTER TABLE collection_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "collection_jobs_select_own" ON collection_jobs FOR SELECT
  TO authenticated USING (auth.uid() = user_id);
-- INSERT additionally verifies the target collection is owned by the same
-- user, so a denormalized user_id can never be paired with someone else's
-- collection_id.
CREATE POLICY "collection_jobs_insert_own" ON collection_jobs FOR INSERT
  TO authenticated WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM collections c WHERE c.id = collection_id AND c.user_id = auth.uid())
  );
CREATE POLICY "collection_jobs_delete_own" ON collection_jobs FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_collection_jobs_collection_id ON collection_jobs (collection_id);
CREATE INDEX IF NOT EXISTS idx_collection_jobs_job_id ON collection_jobs (job_id);
CREATE INDEX IF NOT EXISTS idx_collection_jobs_user_id ON collection_jobs (user_id);
CREATE INDEX IF NOT EXISTS idx_collection_jobs_user_job ON collection_jobs (user_id, job_id);

-- ── Deletion safety (documented, not enforced by new code — enforced by FK
-- direction) ──
-- Deleting a collection cascades ONLY into collection_jobs (removing
-- membership rows) via collection_jobs.collection_id's ON DELETE CASCADE.
-- global_jobs has no foreign key pointing at collections, so a collection
-- deletion can never reach, cascade into, or delete a global_jobs row. The
-- job remains in global_jobs (and in any OTHER collection it belongs to)
-- untouched.
