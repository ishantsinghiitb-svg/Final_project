-- ── Community Placeholder Tables ──
-- Schema-only placeholders for future community features.
-- No business logic implemented; tables are ready for Phase 3+.

-- ── communities ──
CREATE TABLE IF NOT EXISTS communities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  member_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE communities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "communities_public_read" ON communities;
CREATE POLICY "communities_public_read" ON communities FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "communities_insert_authenticated" ON communities;
CREATE POLICY "communities_insert_authenticated" ON communities FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "communities_update_own" ON communities;
CREATE POLICY "communities_update_own" ON communities FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

-- ── community_members ──
CREATE TABLE IF NOT EXISTS community_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id uuid NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  joined_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (community_id, user_id)
);

ALTER TABLE community_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "community_members_select_own" ON community_members;
CREATE POLICY "community_members_select_own" ON community_members FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "community_members_insert_own" ON community_members;
CREATE POLICY "community_members_insert_own" ON community_members FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "community_members_delete_own" ON community_members;
CREATE POLICY "community_members_delete_own" ON community_members FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- ── messages ──
CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id uuid NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "messages_select_authenticated" ON messages;
CREATE POLICY "messages_select_authenticated" ON messages FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "messages_insert_own" ON messages;
CREATE POLICY "messages_insert_own" ON messages FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "messages_delete_own" ON messages;
CREATE POLICY "messages_delete_own" ON messages FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- ── updated_at triggers ──
DROP TRIGGER IF EXISTS communities_set_updated_at ON communities;
CREATE TRIGGER communities_set_updated_at BEFORE UPDATE ON communities
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
