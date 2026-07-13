-- ── Job Tables ──

-- ── global_jobs ──
CREATE TABLE IF NOT EXISTS global_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES companies(id) ON DELETE SET NULL,
  company_name text NOT NULL,
  role text NOT NULL,
  role_id uuid REFERENCES roles(id) ON DELETE SET NULL,
  location_id uuid REFERENCES locations(id) ON DELETE SET NULL,
  location text,
  remote boolean NOT NULL DEFAULT false,
  work_mode text DEFAULT 'remote',
  employment_type text DEFAULT 'full-time',
  experience_level text,
  salary_min integer,
  salary_max integer,
  salary_currency text DEFAULT 'USD',
  description text,
  url text,
  source text NOT NULL DEFAULT 'Manual',
  posted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE global_jobs ENABLE ROW LEVEL SECURITY;

-- public read
DROP POLICY IF EXISTS "global_jobs_public_read" ON global_jobs;
CREATE POLICY "global_jobs_public_read" ON global_jobs FOR SELECT
  TO anon, authenticated USING (true);

-- ── job_skills (many-to-many) ──
CREATE TABLE IF NOT EXISTS job_skills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES global_jobs(id) ON DELETE CASCADE,
  skill_id uuid NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  required boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (job_id, skill_id)
);

ALTER TABLE job_skills ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "job_skills_public_read" ON job_skills;
CREATE POLICY "job_skills_public_read" ON job_skills FOR SELECT
  TO anon, authenticated USING (true);

-- ── saved_jobs ──
CREATE TABLE IF NOT EXISTS saved_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES global_jobs(id) ON DELETE CASCADE,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, job_id)
);

ALTER TABLE saved_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "saved_jobs_select_own" ON saved_jobs;
CREATE POLICY "saved_jobs_select_own" ON saved_jobs FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "saved_jobs_insert_own" ON saved_jobs;
CREATE POLICY "saved_jobs_insert_own" ON saved_jobs FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "saved_jobs_delete_own" ON saved_jobs;
CREATE POLICY "saved_jobs_delete_own" ON saved_jobs FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "saved_jobs_update_own" ON saved_jobs;
CREATE POLICY "saved_jobs_update_own" ON saved_jobs FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── updated_at triggers ──
DROP TRIGGER IF EXISTS global_jobs_set_updated_at ON global_jobs;
CREATE TRIGGER global_jobs_set_updated_at BEFORE UPDATE ON global_jobs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
