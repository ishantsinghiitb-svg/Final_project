-- ── Global Job metadata: reposted / responses-managed flags ──
--
-- Adds two more independently-parsed LinkedIn badges the extension can now
-- detect: whether the posting was reposted, and whether applications route
-- through an external ATS ("Responses managed off LinkedIn") rather than
-- LinkedIn's own inbox. Additive only.

ALTER TABLE global_jobs
  ADD COLUMN IF NOT EXISTS reposted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS responses_managed boolean NOT NULL DEFAULT false;

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
  v_hiring_insights text[] := CASE
    WHEN jsonb_typeof(payload->'hiring_insights') = 'array'
    THEN ARRAY(SELECT jsonb_array_elements_text(payload->'hiring_insights'))
    ELSE NULL
  END;
  v_benefits text[] := CASE
    WHEN jsonb_typeof(payload->'benefits') = 'array'
    THEN ARRAY(SELECT jsonb_array_elements_text(payload->'benefits'))
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
      salary_min = COALESCE((payload->>'salary_min')::integer, salary_min),
      salary_max = COALESCE((payload->>'salary_max')::integer, salary_max),
      salary_currency = COALESCE(payload->>'salary_currency', salary_currency),
      description = COALESCE(payload->>'description', description),
      description_html = COALESCE(payload->>'description_html', description_html),
      url = COALESCE(payload->>'url', url),
      source_url = COALESCE(payload->>'source_url', source_url),
      company_url = COALESCE(payload->>'company_url', company_url),
      city = COALESCE(payload->>'city', city),
      country = COALESCE(payload->>'country', country),
      posted_ago = COALESCE(payload->>'posted_ago', posted_ago),
      applicant_count = COALESCE((payload->>'applicant_count')::integer, applicant_count),
      hiring_insights = COALESCE(v_hiring_insights, hiring_insights),
      easy_apply = COALESCE((payload->>'easy_apply')::boolean, easy_apply),
      promoted = COALESCE((payload->>'promoted')::boolean, promoted),
      reposted = COALESCE((payload->>'reposted')::boolean, reposted),
      responses_managed = COALESCE((payload->>'responses_managed')::boolean, responses_managed),
      industry = COALESCE(payload->>'industry', industry),
      job_function = COALESCE(payload->>'job_function', job_function),
      benefits = COALESCE(v_benefits, benefits),
      posted_at = COALESCE((payload->>'posted_at')::timestamptz, posted_at),
      company_logo_url = COALESCE(payload->>'company_logo_url', company_logo_url),
      source_job_id = COALESCE(v_source_job_id, source_job_id),
      fingerprint = COALESCE(v_fingerprint, fingerprint),
      is_closed = COALESCE((payload->>'is_closed')::boolean, is_closed),
      updated_at = now()
    WHERE id = v_id
    RETURNING * INTO v_row;
  ELSE
    INSERT INTO global_jobs (
      company_name, role, location, remote, work_mode, employment_type, experience_level,
      salary_min, salary_max, salary_currency, description, description_html, url, source,
      posted_at, company_logo_url, source_job_id, fingerprint, is_closed,
      source_url, company_url, city, country, posted_ago, applicant_count,
      hiring_insights, easy_apply, promoted, reposted, responses_managed,
      industry, job_function, benefits
    ) VALUES (
      v_company_name,
      v_role,
      payload->>'location',
      COALESCE((payload->>'remote')::boolean, false),
      payload->>'work_mode',
      payload->>'employment_type',
      payload->>'experience_level',
      (payload->>'salary_min')::integer,
      (payload->>'salary_max')::integer,
      COALESCE(payload->>'salary_currency', 'USD'),
      payload->>'description',
      payload->>'description_html',
      payload->>'url',
      v_source,
      (payload->>'posted_at')::timestamptz,
      payload->>'company_logo_url',
      v_source_job_id,
      v_fingerprint,
      COALESCE((payload->>'is_closed')::boolean, false),
      payload->>'source_url',
      payload->>'company_url',
      payload->>'city',
      payload->>'country',
      payload->>'posted_ago',
      (payload->>'applicant_count')::integer,
      v_hiring_insights,
      COALESCE((payload->>'easy_apply')::boolean, false),
      COALESCE((payload->>'promoted')::boolean, false),
      COALESCE((payload->>'reposted')::boolean, false),
      COALESCE((payload->>'responses_managed')::boolean, false),
      payload->>'industry',
      payload->>'job_function',
      v_benefits
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
