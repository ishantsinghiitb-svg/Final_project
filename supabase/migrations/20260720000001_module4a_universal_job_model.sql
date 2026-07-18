-- ── Module 4A: Universal Job Model persistence ──
--
-- Extends global_jobs with the genuinely-new fields the Universal Job Model
-- carries that had no equivalent column yet. Synonyms of existing columns
-- (title→role, externalID→source_job_id, seniority→experience_level,
-- remoteType→work_mode, …) are NOT duplicated — they keep mapping to the
-- columns they already used. Purely additive: no renames, no drops, no changes
-- to existing Module 1–3 behavior or data. The single write path
-- (upsert_global_job) and its (source, source_job_id)/fingerprint dedup are
-- preserved exactly; only new fields are threaded through.

ALTER TABLE global_jobs
  ADD COLUMN IF NOT EXISTS state text,
  ADD COLUMN IF NOT EXISTS department text,
  ADD COLUMN IF NOT EXISTS company_career_url text,
  ADD COLUMN IF NOT EXISTS salary_period text,
  ADD COLUMN IF NOT EXISTS salary_text text,
  ADD COLUMN IF NOT EXISTS responsibilities text[],
  ADD COLUMN IF NOT EXISTS requirements text[],
  ADD COLUMN IF NOT EXISTS preferred_qualifications text[],
  ADD COLUMN IF NOT EXISTS technologies text[],
  ADD COLUMN IF NOT EXISTS languages text[],
  ADD COLUMN IF NOT EXISTS expiry_date timestamptz,
  ADD COLUMN IF NOT EXISTS hiring_team jsonb,
  ADD COLUMN IF NOT EXISTS recruiter_name text,
  ADD COLUMN IF NOT EXISTS recruiter_profile text,
  ADD COLUMN IF NOT EXISTS company_size text,
  ADD COLUMN IF NOT EXISTS parser_version text,
  ADD COLUMN IF NOT EXISTS parser_confidence real,
  ADD COLUMN IF NOT EXISTS extraction_warnings text[];

-- Small helper: a jsonb array → text[] (NULL for anything that isn't an array),
-- so the upsert can COALESCE list fields without repeating the CASE expression.
CREATE OR REPLACE FUNCTION jsonb_to_text_array(input jsonb)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN jsonb_typeof(input) = 'array'
    THEN ARRAY(SELECT jsonb_array_elements_text(input))
    ELSE NULL
  END;
$$;

-- ── upsert_global_job (extended) ──
-- Identical resolution/validation/skill-linking as the prior version; adds the
-- Universal Job Model's new columns to the UPDATE and INSERT paths.
CREATE OR REPLACE FUNCTION upsert_global_job(payload jsonb)
RETURNS global_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_source text := payload->>'source';
  v_source_job_id text := payload->>'source_job_id';
  v_fingerprint text := payload->>'fingerprint';
  v_company_name text := payload->>'company_name';
  v_role text := payload->>'role';
  v_hiring_team jsonb := CASE
    WHEN jsonb_typeof(payload->'hiring_team') = 'array' THEN payload->'hiring_team'
    ELSE NULL
  END;
  v_row global_jobs;
  v_skill_name text;
  v_skill_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  IF v_source IS NULL OR btrim(v_source) = '' THEN
    RAISE EXCEPTION 'source is required';
  END IF;

  IF v_company_name IS NULL OR btrim(v_company_name) = '' THEN
    RAISE EXCEPTION 'company_name is required';
  END IF;

  IF v_role IS NULL OR btrim(v_role) = '' THEN
    RAISE EXCEPTION 'role is required';
  END IF;

  IF v_source_job_id IS NULL AND v_fingerprint IS NULL THEN
    RAISE EXCEPTION 'source_job_id or fingerprint is required';
  END IF;

  IF v_source_job_id IS NOT NULL THEN
    SELECT id INTO v_id FROM global_jobs
      WHERE source = v_source AND source_job_id = v_source_job_id;
  END IF;

  IF v_id IS NULL AND v_fingerprint IS NOT NULL THEN
    SELECT id INTO v_id FROM global_jobs WHERE fingerprint = v_fingerprint;
  END IF;

  IF v_id IS NOT NULL THEN
    UPDATE global_jobs SET
      company_name = v_company_name,
      role = v_role,
      location = COALESCE(payload->>'location', location),
      remote = COALESCE((payload->>'remote')::boolean, remote),
      work_mode = COALESCE(payload->>'work_mode', work_mode),
      employment_type = COALESCE(payload->>'employment_type', employment_type),
      experience_level = COALESCE(payload->>'experience_level', experience_level),
      department = COALESCE(payload->>'department', department),
      salary_min = COALESCE((payload->>'salary_min')::integer, salary_min),
      salary_max = COALESCE((payload->>'salary_max')::integer, salary_max),
      salary_currency = COALESCE(payload->>'salary_currency', salary_currency),
      salary_period = COALESCE(payload->>'salary_period', salary_period),
      salary_text = COALESCE(payload->>'salary_text', salary_text),
      description = COALESCE(payload->>'description', description),
      description_html = COALESCE(payload->>'description_html', description_html),
      responsibilities = COALESCE(jsonb_to_text_array(payload->'responsibilities'), responsibilities),
      requirements = COALESCE(jsonb_to_text_array(payload->'requirements'), requirements),
      preferred_qualifications =
        COALESCE(jsonb_to_text_array(payload->'preferred_qualifications'), preferred_qualifications),
      url = COALESCE(payload->>'url', url),
      source_url = COALESCE(payload->>'source_url', source_url),
      company_url = COALESCE(payload->>'company_url', company_url),
      company_career_url = COALESCE(payload->>'company_career_url', company_career_url),
      city = COALESCE(payload->>'city', city),
      state = COALESCE(payload->>'state', state),
      country = COALESCE(payload->>'country', country),
      posted_ago = COALESCE(payload->>'posted_ago', posted_ago),
      posted_at = COALESCE((payload->>'posted_at')::timestamptz, posted_at),
      expiry_date = COALESCE((payload->>'expiry_date')::timestamptz, expiry_date),
      applicant_count = COALESCE((payload->>'applicant_count')::integer, applicant_count),
      hiring_insights = COALESCE(jsonb_to_text_array(payload->'hiring_insights'), hiring_insights),
      hiring_team = COALESCE(v_hiring_team, hiring_team),
      recruiter_name = COALESCE(payload->>'recruiter_name', recruiter_name),
      recruiter_profile = COALESCE(payload->>'recruiter_profile', recruiter_profile),
      company_size = COALESCE(payload->>'company_size', company_size),
      easy_apply = COALESCE((payload->>'easy_apply')::boolean, easy_apply),
      promoted = COALESCE((payload->>'promoted')::boolean, promoted),
      reposted = COALESCE((payload->>'reposted')::boolean, reposted),
      responses_managed = COALESCE((payload->>'responses_managed')::boolean, responses_managed),
      industry = COALESCE(payload->>'industry', industry),
      job_function = COALESCE(payload->>'job_function', job_function),
      benefits = COALESCE(jsonb_to_text_array(payload->'benefits'), benefits),
      technologies = COALESCE(jsonb_to_text_array(payload->'technologies'), technologies),
      languages = COALESCE(jsonb_to_text_array(payload->'languages'), languages),
      company_logo_url = COALESCE(payload->>'company_logo_url', company_logo_url),
      source_job_id = COALESCE(v_source_job_id, source_job_id),
      fingerprint = COALESCE(v_fingerprint, fingerprint),
      is_closed = COALESCE((payload->>'is_closed')::boolean, is_closed),
      parser_version = COALESCE(payload->>'parser_version', parser_version),
      parser_confidence = COALESCE((payload->>'parser_confidence')::real, parser_confidence),
      extraction_warnings = COALESCE(jsonb_to_text_array(payload->'extraction_warnings'), extraction_warnings),
      updated_at = now()
    WHERE id = v_id
    RETURNING * INTO v_row;
  ELSE
    INSERT INTO global_jobs (
      company_name, role, location, remote, work_mode, employment_type, experience_level,
      department, salary_min, salary_max, salary_currency, salary_period, salary_text,
      description, description_html, responsibilities, requirements, preferred_qualifications,
      url, source, posted_at, expiry_date, company_logo_url, source_job_id, fingerprint, is_closed,
      source_url, company_url, company_career_url, city, state, country, posted_ago, applicant_count,
      hiring_insights, hiring_team, recruiter_name, recruiter_profile, company_size,
      easy_apply, promoted, reposted, responses_managed, industry, job_function, benefits,
      technologies, languages, parser_version, parser_confidence, extraction_warnings
    ) VALUES (
      v_company_name,
      v_role,
      payload->>'location',
      COALESCE((payload->>'remote')::boolean, false),
      payload->>'work_mode',
      payload->>'employment_type',
      payload->>'experience_level',
      payload->>'department',
      (payload->>'salary_min')::integer,
      (payload->>'salary_max')::integer,
      COALESCE(payload->>'salary_currency', 'USD'),
      payload->>'salary_period',
      payload->>'salary_text',
      payload->>'description',
      payload->>'description_html',
      jsonb_to_text_array(payload->'responsibilities'),
      jsonb_to_text_array(payload->'requirements'),
      jsonb_to_text_array(payload->'preferred_qualifications'),
      payload->>'url',
      v_source,
      (payload->>'posted_at')::timestamptz,
      (payload->>'expiry_date')::timestamptz,
      payload->>'company_logo_url',
      v_source_job_id,
      v_fingerprint,
      COALESCE((payload->>'is_closed')::boolean, false),
      payload->>'source_url',
      payload->>'company_url',
      payload->>'company_career_url',
      payload->>'city',
      payload->>'state',
      payload->>'country',
      payload->>'posted_ago',
      (payload->>'applicant_count')::integer,
      jsonb_to_text_array(payload->'hiring_insights'),
      v_hiring_team,
      payload->>'recruiter_name',
      payload->>'recruiter_profile',
      payload->>'company_size',
      COALESCE((payload->>'easy_apply')::boolean, false),
      COALESCE((payload->>'promoted')::boolean, false),
      COALESCE((payload->>'reposted')::boolean, false),
      COALESCE((payload->>'responses_managed')::boolean, false),
      payload->>'industry',
      payload->>'job_function',
      jsonb_to_text_array(payload->'benefits'),
      jsonb_to_text_array(payload->'technologies'),
      jsonb_to_text_array(payload->'languages'),
      payload->>'parser_version',
      (payload->>'parser_confidence')::real,
      jsonb_to_text_array(payload->'extraction_warnings')
    )
    RETURNING * INTO v_row;
  END IF;

  v_id := v_row.id;

  IF jsonb_typeof(payload->'skills') = 'array' THEN
    FOR v_skill_name IN SELECT jsonb_array_elements_text(payload->'skills') LOOP
      IF v_skill_name IS NULL OR btrim(v_skill_name) = '' THEN
        CONTINUE;
      END IF;

      INSERT INTO skills (name) VALUES (btrim(v_skill_name))
      ON CONFLICT (lower(name)) DO UPDATE SET name = skills.name
      RETURNING id INTO v_skill_id;

      INSERT INTO job_skills (job_id, skill_id)
      VALUES (v_id, v_skill_id)
      ON CONFLICT (job_id, skill_id) DO NOTHING;
    END LOOP;
  END IF;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION upsert_global_job(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION upsert_global_job(jsonb) TO authenticated;
