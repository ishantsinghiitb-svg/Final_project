-- ── Resume Tables ──

-- ── resumes ──
CREATE TABLE IF NOT EXISTS resumes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  tailored_for text,
  file_url text,
  score integer,
  keywords_count integer DEFAULT 0,
  times_used integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE resumes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "resumes_select_own" ON resumes;
CREATE POLICY "resumes_select_own" ON resumes FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "resumes_insert_own" ON resumes;
CREATE POLICY "resumes_insert_own" ON resumes FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "resumes_update_own" ON resumes;
CREATE POLICY "resumes_update_own" ON resumes FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "resumes_delete_own" ON resumes;
CREATE POLICY "resumes_delete_own" ON resumes FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- ── resume_versions ──
CREATE TABLE IF NOT EXISTS resume_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resume_id uuid NOT NULL REFERENCES resumes(id) ON DELETE CASCADE,
  version_number integer NOT NULL,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (resume_id, version_number)
);

ALTER TABLE resume_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "resume_versions_select_own" ON resume_versions;
CREATE POLICY "resume_versions_select_own" ON resume_versions FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM resumes r WHERE r.id = resume_versions.resume_id AND r.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "resume_versions_insert_own" ON resume_versions;
CREATE POLICY "resume_versions_insert_own" ON resume_versions FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM resumes r WHERE r.id = resume_versions.resume_id AND r.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "resume_versions_delete_own" ON resume_versions;
CREATE POLICY "resume_versions_delete_own" ON resume_versions FOR DELETE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM resumes r WHERE r.id = resume_versions.resume_id AND r.user_id = auth.uid()
  ));

-- ── resume_ats_scores ──
CREATE TABLE IF NOT EXISTS resume_ats_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resume_version_id uuid NOT NULL REFERENCES resume_versions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  score integer NOT NULL,
  breakdown jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE resume_ats_scores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "resume_ats_scores_select_own" ON resume_ats_scores;
CREATE POLICY "resume_ats_scores_select_own" ON resume_ats_scores FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "resume_ats_scores_insert_own" ON resume_ats_scores;
CREATE POLICY "resume_ats_scores_insert_own" ON resume_ats_scores FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "resume_ats_scores_delete_own" ON resume_ats_scores;
CREATE POLICY "resume_ats_scores_delete_own" ON resume_ats_scores FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- ── updated_at triggers ──
DROP TRIGGER IF EXISTS resumes_set_updated_at ON resumes;
CREATE TRIGGER resumes_set_updated_at BEFORE UPDATE ON resumes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
