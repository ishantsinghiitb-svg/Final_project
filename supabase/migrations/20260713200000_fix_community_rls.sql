-- ── Fix Community RLS: Add creator_id and Tighten Policies ──
--
-- BEFORE:
--   communities_update_own  → USING (true) WITH CHECK (true)
--     Any authenticated user could UPDATE any community record.
--   communities_insert_authenticated  → WITH CHECK (true)
--     creator_id was never enforced on insert.
--
-- AFTER:
--   INSERT requires auth.uid() = creator_id (caller owns the row they create).
--   UPDATE only allowed when auth.uid() = creator_id (only the creator can modify).
--
-- Existing rows (if any) will have creator_id = NULL and cannot be updated
-- until ownership is assigned by a super-admin or via a data migration.
-- New community inserts must supply creator_id = auth.uid().

-- ── Step 1: Add creator_id column ───────────────────────────────────────────
ALTER TABLE communities
  ADD COLUMN IF NOT EXISTS creator_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- ── Step 2: Tighten INSERT — caller must set creator_id = their own user id ─
DROP POLICY IF EXISTS "communities_insert_authenticated" ON communities;
CREATE POLICY "communities_insert_authenticated" ON communities FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = creator_id);

-- ── Step 3: Tighten UPDATE — only the creator may modify their community ────
DROP POLICY IF EXISTS "communities_update_own" ON communities;
CREATE POLICY "communities_update_own" ON communities FOR UPDATE
  TO authenticated
  USING  (auth.uid() = creator_id)
  WITH CHECK (auth.uid() = creator_id);

-- ── Step 4: Index for creator_id lookups ────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_communities_creator_id ON communities (creator_id);
