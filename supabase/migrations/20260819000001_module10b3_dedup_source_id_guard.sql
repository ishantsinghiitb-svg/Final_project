-- ── Module 10B.3: source-ID-aware deduplication guard ──
--
-- The first live production crawl (2026-08-11) exposed a real defect: two
-- genuinely different, simultaneously-open requisitions from the SAME
-- source with the SAME normalized title/company/location — e.g. HighRadius
-- posting three distinct Greenhouse reqs (7701545003, 7701540003,
-- 7697979003) all titled "Implementation Consultant" in "Hyderabad,
-- Telangana, India" — were silently collapsed onto one `global_jobs` row.
--
-- Root cause: `admin_upsert_global_job`'s tier-2 fingerprint lookup
-- (`SELECT id FROM global_jobs WHERE fingerprint = v_fingerprint`) is global
-- — it never checks `source_job_id` once past tier 1 — so a same-source
-- posting carrying its OWN distinct, verified `source_job_id` could still
-- match tier 2 (or tier 3's cross-platform fuzzy score) purely because its
-- title/company/location happened to match another posting from the same
-- source. Each match then overwrote the canonical row's `url`/
-- `source_job_id` (COALESCE(new, old) always prefers the new value), so the
-- other requisitions were not just hidden — their identifying data was lost
-- from `global_jobs`, though `job_sources` still recorded each one's own
-- (source, source_job_id) correctly (see the read-only recovery assessment
-- run alongside this fix).
--
-- This is a CREATE OR REPLACE of the Module 10B.2 function (itself a
-- CREATE OR REPLACE of the Module 10A original), adding exactly one guard
-- block after the tier 1/2/3 resolution and changing nothing else. Tier 1
-- (exact (source, source_job_id) match) is unaffected by construction: a
-- genuine tier-1 match's `source_job_id` is by definition EQUAL to the
-- incoming one, so the guard's `<>` comparison can never fire for it. Only a
-- tier-2/tier-3 match that turns out to belong to a same-source row with its
-- own different, verified id is discarded — which sends that posting down
-- the INSERT branch instead, creating its own canonical row and its own
-- `job_sources` entry, exactly as tier 1 already does for every other
-- posting. Cross-source fingerprint/cross-platform merges (the entire point
-- of those tiers — e.g. the same posting seen via the extension on LinkedIn
-- and via a company's own Greenhouse board) are completely unaffected: the
-- guard only ever fires when `source = v_source`.
--
-- `find_cross_platform_match` (Module 4A, `20260722000001_...`) and the
-- extension's own `upsert_global_job` RPC are both untouched — this migration
-- only replaces `admin_upsert_global_job`, the crawler-only write path.

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

  -- ── Module 10B.3: source-ID-aware dedup guard ──
  -- A tier-2 (fingerprint) or tier-3 (cross-platform) match is discarded if
  -- the matched row is from the SAME source and carries its OWN distinct,
  -- non-null source_job_id. The source has already told us these are two
  -- different requisitions; that fact overrides a lower-confidence
  -- title/company/location heuristic. Never fires for a tier-1 match, whose
  -- source_job_id is always equal to v_source_job_id by construction.
  IF v_id IS NOT NULL AND v_source_job_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM global_jobs
      WHERE id = v_id
        AND source = v_source
        AND source_job_id IS NOT NULL
        AND source_job_id <> v_source_job_id
    ) THEN
      v_id := NULL;
    END IF;
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
