-- ── Application Tables ──

-- ── applications ──
CREATE TABLE IF NOT EXISTS applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_id uuid REFERENCES global_jobs(id) ON DELETE SET NULL,
  company_name text NOT NULL,
  role text NOT NULL,
  status text NOT NULL DEFAULT 'interested',
  applied_at timestamptz,
  next_step text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE applications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "applications_select_own" ON applications;
CREATE POLICY "applications_select_own" ON applications FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "applications_insert_own" ON applications;
CREATE POLICY "applications_insert_own" ON applications FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "applications_update_own" ON applications;
CREATE POLICY "applications_update_own" ON applications FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "applications_delete_own" ON applications;
CREATE POLICY "applications_delete_own" ON applications FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- ── application_activity ──
CREATE TABLE IF NOT EXISTS application_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL,
  text text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE application_activity ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "application_activity_select_own" ON application_activity;
CREATE POLICY "application_activity_select_own" ON application_activity FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "application_activity_insert_own" ON application_activity;
CREATE POLICY "application_activity_insert_own" ON application_activity FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "application_activity_delete_own" ON application_activity;
CREATE POLICY "application_activity_delete_own" ON application_activity FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- ── updated_at triggers ──
DROP TRIGGER IF EXISTS applications_set_updated_at ON applications;
CREATE TRIGGER applications_set_updated_at BEFORE UPDATE ON applications
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
