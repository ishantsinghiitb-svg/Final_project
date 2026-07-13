-- ── Interview, Notification, Preference, Analytics Tables ──

-- ── interviews ──
CREATE TABLE IF NOT EXISTS interviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  application_id uuid REFERENCES applications(id) ON DELETE SET NULL,
  company_name text NOT NULL,
  role text NOT NULL,
  scheduled_at timestamptz NOT NULL,
  interviewer text,
  type text NOT NULL DEFAULT 'Recruiter',
  status text NOT NULL DEFAULT 'scheduled',
  link text,
  prep text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE interviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "interviews_select_own" ON interviews;
CREATE POLICY "interviews_select_own" ON interviews FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "interviews_insert_own" ON interviews;
CREATE POLICY "interviews_insert_own" ON interviews FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "interviews_update_own" ON interviews;
CREATE POLICY "interviews_update_own" ON interviews FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "interviews_delete_own" ON interviews;
CREATE POLICY "interviews_delete_own" ON interviews FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- ── notifications ──
CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL,
  priority text NOT NULL DEFAULT 'medium',
  title text NOT NULL,
  body text,
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notifications_select_own" ON notifications;
CREATE POLICY "notifications_select_own" ON notifications FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "notifications_insert_own" ON notifications;
CREATE POLICY "notifications_insert_own" ON notifications FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "notifications_update_own" ON notifications;
CREATE POLICY "notifications_update_own" ON notifications FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "notifications_delete_own" ON notifications;
CREATE POLICY "notifications_delete_own" ON notifications FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- ── notification_preferences ──
CREATE TABLE IF NOT EXISTS notification_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, type)
);

ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notification_preferences_select_own" ON notification_preferences;
CREATE POLICY "notification_preferences_select_own" ON notification_preferences FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "notification_preferences_insert_own" ON notification_preferences;
CREATE POLICY "notification_preferences_insert_own" ON notification_preferences FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "notification_preferences_update_own" ON notification_preferences;
CREATE POLICY "notification_preferences_update_own" ON notification_preferences FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "notification_preferences_delete_own" ON notification_preferences;
CREATE POLICY "notification_preferences_delete_own" ON notification_preferences FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- ── user_preferences ──
CREATE TABLE IF NOT EXISTS user_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  key text NOT NULL,
  value text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, key)
);

ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_preferences_select_own" ON user_preferences;
CREATE POLICY "user_preferences_select_own" ON user_preferences FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_preferences_insert_own" ON user_preferences;
CREATE POLICY "user_preferences_insert_own" ON user_preferences FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_preferences_update_own" ON user_preferences;
CREATE POLICY "user_preferences_update_own" ON user_preferences FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_preferences_delete_own" ON user_preferences;
CREATE POLICY "user_preferences_delete_own" ON user_preferences FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- ── analytics_events ──
CREATE TABLE IF NOT EXISTS analytics_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event text NOT NULL,
  properties jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "analytics_events_select_own" ON analytics_events;
CREATE POLICY "analytics_events_select_own" ON analytics_events FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "analytics_events_insert_own" ON analytics_events;
CREATE POLICY "analytics_events_insert_own" ON analytics_events FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "analytics_events_delete_own" ON analytics_events;
CREATE POLICY "analytics_events_delete_own" ON analytics_events FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- ── updated_at triggers ──
DROP TRIGGER IF EXISTS interviews_set_updated_at ON interviews;
CREATE TRIGGER interviews_set_updated_at BEFORE UPDATE ON interviews
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS notification_preferences_set_updated_at ON notification_preferences;
CREATE TRIGGER notification_preferences_set_updated_at BEFORE UPDATE ON notification_preferences
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS user_preferences_set_updated_at ON user_preferences;
CREATE TRIGGER user_preferences_set_updated_at BEFORE UPDATE ON user_preferences
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
