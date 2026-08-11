-- ── Module 10B.2: job observation lifecycle + report semantics ──
--
-- Two additions, both purely additive. No existing column changes meaning, no
-- row is ever deleted, and the extension/user write path (`upsert_global_job`)
-- is untouched.
--
--   1. `global_jobs.last_seen_at` — the 30-day active-job rule, done correctly.
--   2. `crawl_runs.jobs_rejected` — `rejected` split out from `skipped`.
--
-- ── Why last_seen_at, and not posted_at ──
--
-- The product rule is "jobs older than 30 days are not active". The obvious
-- implementation — filter `posted_at` — is WRONG here, and this codebase
-- already learned that the hard way: `JobRepository.applyDiscoveryVisibility`
-- carries a comment explaining that a `posted_at` age ceiling was shipped and
-- then REVERTED as a reported regression, because `posted_at` is the ORIGINAL
-- posting date. A still-open job that is reposted or re-discovered today
-- legitimately carries a months-old `posted_at`, and the ceiling silently
-- dropped those valid rows from the discovery feed while they stayed visible
-- under Applications / Saved / Job Detail.
--
-- So the two dates are given distinct, explicit meanings:
--
--   posted_at     — when the SOURCE says the job was originally posted.
--                   Historical fact. Never used to decide active visibility.
--   last_seen_at  — the most recent crawl in which we OBSERVED this job as
--                   live on its source. Freshness signal. This is what active
--                   visibility keys off.
--
-- A job repeatedly seen by the crawler stays active however old its
-- `posted_at`. A job that stops appearing on its source stops being refreshed
-- and ages out of the active window on its own — with no delete, no flag flip,
-- and no bulk update that a partial crawl could get wrong.
--
-- ⚠️ Ageing is PASSIVE by design (Module 10B.2 crawl safety). Nothing here
-- marks jobs inactive. A source returning 0 jobs, a 5xx, a timeout or a
-- half-finished pagination therefore CANNOT wipe previously known jobs: the
-- worst it can do is fail to refresh them, and one missed crawl inside a
-- 30-day window changes nothing.

-- ── 1. global_jobs.last_seen_at ──

ALTER TABLE global_jobs
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;

-- Backfill: `updated_at` is the best existing evidence of when a row was last
-- touched by anything. Using it (rather than now()) means pre-existing rows
-- keep their real relative freshness instead of all looking brand new.
UPDATE global_jobs
SET last_seen_at = COALESCE(updated_at, created_at, now())
WHERE last_seen_at IS NULL;

ALTER TABLE global_jobs
  ALTER COLUMN last_seen_at SET DEFAULT now();

-- Discovery filters on this, so it needs an index. Partial on the columns the
-- discovery query already narrows by, to stay small.
CREATE INDEX IF NOT EXISTS idx_global_jobs_last_seen_at
  ON global_jobs (last_seen_at DESC)
  WHERE is_closed = false AND is_manual_import = false;

COMMENT ON COLUMN global_jobs.last_seen_at IS
  'Most recent crawl in which this job was observed live on its source. Drives '
  '30-day active visibility. Distinct from posted_at (original posting date), '
  'which must NOT be used for freshness — see Module 10B.2.';

-- ── 2. admin_upsert_global_job stamps last_seen_at ──
--
-- A crawler write IS an observation, so every insert AND update through the
-- admin path refreshes it. Deliberately NOT wrapped in COALESCE like the other
-- update columns: those preserve a previously-known value when a later crawl
-- omits the field, but "when did we last see this" must always take the newest
-- value or the whole lifecycle stops moving.
--
-- This is a CREATE OR REPLACE of the Module 10A function, adding two lines and
-- changing nothing else — the dedup tiers, advisory locks, company/skill
-- linkage and job_sources handling are all byte-identical to 20260813000001.

CREATE OR REPLACE FUNCTION admin_upsert_global_job(payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_created boolean := false;
  v_source text := payload->>'source';
  v_source_job_id text := payload->>'source_job_id';
  v_fingerprint text := payload->>'fingerprint';
  v_company_name text := payload->>'company_name';
  v_role text := payload->>'role';
  v_normalized_company text := coalesce(payload->>'normalized_company', normalize_company_name(v_company_name));
  v_normalized_role text := coalesce(payload->>'normalized_role', normalize_role_text(v_role));
  v_tags text[] := jsonb_to_text_array(payload->'tags');
  v_hiring_team jsonb := CASE
    WHEN jsonb_typeof(payload->'hiring_team') = 'array' THEN payload->'hiring_team'
    ELSE NULL
  END;
  v_row global_jobs;
  v_skill_name text;
  v_skill_id uuid;
  v_company_id uuid;
BEGIN
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

  PERFORM pg_advisory_xact_lock(hashtext('gj:' || v_source || ':' || coalesce(v_source_job_id, v_fingerprint, '')));

  IF v_source_job_id IS NOT NULL THEN
    SELECT id INTO v_id FROM global_jobs WHERE source = v_source AND source_job_id = v_source_job_id;
  END IF;

  IF v_id IS NULL AND v_fingerprint IS NOT NULL THEN
    SELECT id INTO v_id FROM global_jobs WHERE fingerprint = v_fingerprint;
  END IF;

  IF v_id IS NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext(
      'gj-xplat:' || normalize_company_name(v_company_name) || ':' || normalize_role_text(v_role)
    ));
    v_id := find_cross_platform_match(payload);
  END IF;

  INSERT INTO companies (name) VALUES (v_normalized_company)
  ON CONFLICT (lower(name)) DO UPDATE SET name = companies.name
  RETURNING id INTO v_company_id;

  IF v_id IS NOT NULL THEN
    UPDATE global_jobs SET
      company_id = COALESCE(company_id, v_company_id),
      company_name = v_company_name,
      role = v_role,
      normalized_company = v_normalized_company,
      normalized_role = v_normalized_role,
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
      tags = COALESCE(v_tags, tags),
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
      is_manual_import = COALESCE((payload->>'is_manual_import')::boolean, true) AND is_manual_import,
      parser_version = COALESCE(payload->>'parser_version', parser_version),
      parser_confidence = COALESCE((payload->>'parser_confidence')::real, parser_confidence),
      extraction_warnings = COALESCE(jsonb_to_text_array(payload->'extraction_warnings'), extraction_warnings),
      -- ⚠️ Module 10B.2: NOT COALESCE'd. Every crawler write is a fresh
      -- observation, so this always advances.
      last_seen_at = now(),
      updated_at = now()
    WHERE id = v_id
    RETURNING * INTO v_row;
  ELSE
    v_created := true;
    INSERT INTO global_jobs (
      company_id, company_name, role, normalized_company, normalized_role,
      location, remote, work_mode, employment_type, experience_level,
      department, salary_min, salary_max, salary_currency, salary_period, salary_text,
      description, description_html, responsibilities, requirements, preferred_qualifications,
      tags, url, source, posted_at, expiry_date, company_logo_url, source_job_id, fingerprint, is_closed,
      is_manual_import,
      source_url, company_url, company_career_url, city, state, country, posted_ago, applicant_count,
      hiring_insights, hiring_team, recruiter_name, recruiter_profile, company_size,
      easy_apply, promoted, reposted, responses_managed, industry, job_function, benefits,
      technologies, languages, parser_version, parser_confidence, extraction_warnings,
      last_seen_at
    ) VALUES (
      v_company_id, v_company_name, v_role, v_normalized_company, v_normalized_role,
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
      v_tags,
      payload->>'url',
      v_source,
      (payload->>'posted_at')::timestamptz,
      (payload->>'expiry_date')::timestamptz,
      payload->>'company_logo_url',
      v_source_job_id,
      v_fingerprint,
      COALESCE((payload->>'is_closed')::boolean, false),
      COALESCE((payload->>'is_manual_import')::boolean, false),
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
      jsonb_to_text_array(payload->'extraction_warnings'),
      now()
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
      INSERT INTO job_skills (job_id, skill_id) VALUES (v_id, v_skill_id)
      ON CONFLICT (job_id, skill_id) DO NOTHING;
    END LOOP;
  END IF;

  IF v_source_job_id IS NOT NULL THEN
    INSERT INTO job_sources (job_id, source, source_job_id, source_url, url, first_seen_at, last_seen_at)
    VALUES (v_id, v_source, v_source_job_id, payload->>'source_url', payload->>'url', now(), now())
    ON CONFLICT (job_id, source, source_job_id) WHERE source_job_id IS NOT NULL
      DO UPDATE SET
        source_url = COALESCE(EXCLUDED.source_url, job_sources.source_url),
        url = COALESCE(EXCLUDED.url, job_sources.url),
        last_seen_at = now();
  ELSE
    INSERT INTO job_sources (job_id, source, source_job_id, source_url, url, first_seen_at, last_seen_at)
    VALUES (v_id, v_source, NULL, payload->>'source_url', payload->>'url', now(), now())
    ON CONFLICT (job_id, source) WHERE source_job_id IS NULL
      DO UPDATE SET
        source_url = COALESCE(EXCLUDED.source_url, job_sources.source_url),
        url = COALESCE(EXCLUDED.url, job_sources.url),
        last_seen_at = now();
  END IF;

  RETURN jsonb_build_object('id', v_id, 'created', v_created);
END;
$$;

REVOKE ALL ON FUNCTION admin_upsert_global_job(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_upsert_global_job(jsonb) TO service_role;

-- ── 3. crawl_runs.jobs_rejected ──
--
-- `rejected` (the validator refused a posting) is now reported separately from
-- `skipped` (the crawler deliberately excluded a draft / unpublished offer).
-- Hiding one inside the other made a board full of drafts look identical to a
-- parser that had started failing.

ALTER TABLE crawl_runs
  ADD COLUMN IF NOT EXISTS jobs_rejected integer NOT NULL DEFAULT 0;
