-- ── B3 fix — global_jobs can no longer be poisoned or hijacked by any authenticated user ──
--
-- PROBLEM: `upsert_global_job(jsonb)` is SECURITY DEFINER and
-- GRANT EXECUTE TO authenticated. It is the extension's and the dashboard's
-- ONLY write path for the shared global_jobs catalog
-- (extension/src/shared/supabase/jobs-api.ts, src/repositories/JobRepository.ts),
-- and BOTH call it as a direct `supabase.rpc("upsert_global_job", ...)` from
-- the browser with the caller's own session — there is no server-side proxy
-- in front of it, so a raw PostgREST call with the public anon key + any
-- signed-in user's JWT is indistinguishable from a legitimate extension
-- sync. Before this migration, the function had:
--   • no field-length bounds at all — role/company_name/source/description
--     could be arbitrarily long,
--   • no rate limit of any kind — a single account could write unlimited
--     rows,
--   • no re-verification of company identity on the UPDATE path: tiers 1
--     (exact source_job_id match) and 2 (exact fingerprint match) would
--     overwrite company_name, role, description, salary, company_url — every
--     field — based purely on identity-key agreement, with NO check that the
--     payload's company_name agreed with the EXISTING row's. `source_job_id`
--     is visible in any public job-posting URL, and `fingerprint` is an
--     UNSALTED sha256 of lowercased title|company|location (see
--     src/features/jobs/fingerprint.ts) — both are trivially reproducible by
--     anyone who has seen the public posting, without ever having captured
--     it through the extension. That let any authenticated user target and
--     deface an EXISTING row for a real company's real job with arbitrary
--     content, or flood the catalog with unlimited fake rows.
--
-- FIX (all inside upsert_global_job — no signature change, so every existing
-- caller keeps working unmodified):
--   1. Field bounds: role <= 200 chars, company_name <= 150, source <= 50
--      (reject — these can never legitimately be longer), description
--      truncated at 60000 chars (matches the crawler path's own
--      MAX_DESCRIPTION_LENGTH in JobValidator.ts; truncate rather than
--      reject since a genuinely long real description is plausible).
--      description_html is already sanitized AND capped at 100000 chars by
--      the BEFORE INSERT/UPDATE trigger from the A1 fix
--      (20260829000001_module13_sanitize_global_job_description_html.sql) —
--      unaffected, not duplicated here.
--   2. Per-user rate limit: a burst window (30 writes / 30s) plus a daily
--      cap (1000/day), checked-and-incremented atomically inside this same
--      SECURITY DEFINER call, before any catalog write. Mirrors the shape of
--      check_resume_parse_rate_limit (20260827000001) but is inlined here
--      rather than split into a separate pre-check RPC: that split only
--      works when a trusted server layer calls "check" before the real work
--      and "record" after it succeeds (extensionApi.ts does exactly that for
--      resume parsing) — upsert_global_job has no such layer in front of it,
--      so the gate has to live inside the one call a client can make.
--      The limits are hardcoded CONSTANTs in the function body, never
--      accepted as parameters — the same reasoning as the B1 fix
--      (20260831000001): a value a caller can supply is a value a caller can
--      inflate.
--   3. Company-identity re-verification on UPDATE: when an existing row is
--      matched (any tier), its stored company_name must normalize-equal the
--      incoming payload's company_name, or the call is rejected outright.
--      Tier 3 (find_cross_platform_match) already requires this as part of
--      finding the candidate in the first place, so this is a genuine no-op
--      for tier-3 matches; it is only ever decisive for tier 1 (exact
--      source_job_id), which never re-verified company identity before.
--      role is deliberately NOT included in this check: normalize_role_text
--      only lowercases/collapses whitespace (no truncation tolerance), and
--      the whole point of the listing-capture -> detail-page enrichment flow
--      (Module 4B) is that a later, richer capture of the SAME posting can
--      carry a more precise title than an earlier shallow one — gating on
--      exact role agreement would break that legitimate flow. company_name
--      is stable across every legitimate capture of the same real posting
--      and is the far more damaging identity to let a caller spoof (a
--      catalog entry defaced to claim a different employer), so it is the
--      right, minimal thing to enforce here.
--
-- UNCHANGED, deliberately: admin_upsert_global_job (service_role only, the
-- crawler's write path) is a completely separate function and is not
-- touched — crawlers run without an auth.uid() at all, so a per-user rate
-- limit keyed by user_id would not even apply to them, and they already go
-- through JobValidator.ts's own field bounds on the TypeScript side before
-- ever reaching that RPC. The tier 1-3 matching logic, the advisory locks,
-- the INSERT branch, and the skills-array handling are all byte-for-byte
-- unchanged from the prior definition.

BEGIN;

-- ── global_job_write_usage — per-user rate limit for upsert_global_job ──
CREATE TABLE IF NOT EXISTS global_job_write_usage (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  window_started_at timestamptz NOT NULL DEFAULT now(),
  window_count integer NOT NULL DEFAULT 0,
  day_bucket date NOT NULL DEFAULT (now() AT TIME ZONE 'UTC')::date,
  day_count integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE global_job_write_usage ENABLE ROW LEVEL SECURITY;

-- Client may read its own usage; writes happen only through the SECURITY
-- DEFINER upsert_global_job below — no INSERT/UPDATE policy, so a client
-- cannot reset or inflate its own counters directly.
DROP POLICY IF EXISTS "global_job_write_usage_select_own" ON global_job_write_usage;
CREATE POLICY "global_job_write_usage_select_own" ON global_job_write_usage FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION upsert_global_job(payload jsonb)
RETURNS global_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_id uuid;
  v_source text := payload->>'source';
  v_source_job_id text := payload->>'source_job_id';
  v_fingerprint text := payload->>'fingerprint';
  v_company_name text := payload->>'company_name';
  v_role text := payload->>'role';
  v_description text := payload->>'description';
  v_hiring_team jsonb := CASE
    WHEN jsonb_typeof(payload->'hiring_team') = 'array' THEN payload->'hiring_team'
    ELSE NULL
  END;
  v_row global_jobs;
  v_skill_name text;
  v_skill_id uuid;
  v_existing_company text;
  -- ── B3: hardcoded bounds (never parameters — see header) ──
  v_max_role_length CONSTANT integer := 200;
  v_max_company_length CONSTANT integer := 150;
  v_max_source_length CONSTANT integer := 50;
  v_max_description_length CONSTANT integer := 60000;
  v_burst_window_seconds CONSTANT integer := 30;
  v_burst_max CONSTANT integer := 30;
  v_daily_limit CONSTANT integer := 1000;
  v_now timestamptz := now();
  v_today date := (v_now AT TIME ZONE 'UTC')::date;
  v_usage global_job_write_usage;
BEGIN
  IF v_uid IS NULL THEN
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

  -- ── B3: field-length bounds ──
  IF length(v_role) > v_max_role_length THEN
    RAISE EXCEPTION 'role exceeds % characters', v_max_role_length;
  END IF;
  IF length(v_company_name) > v_max_company_length THEN
    RAISE EXCEPTION 'company_name exceeds % characters', v_max_company_length;
  END IF;
  IF length(v_source) > v_max_source_length THEN
    RAISE EXCEPTION 'source exceeds % characters', v_max_source_length;
  END IF;
  IF v_description IS NOT NULL AND length(v_description) > v_max_description_length THEN
    v_description := left(v_description, v_max_description_length);
  END IF;

  -- ── B3: per-user rate limit — burst window + daily cap, atomic with the
  -- rest of this call. Row-locked so a concurrent/replayed request from the
  -- same user serializes behind this one instead of racing it.
  INSERT INTO global_job_write_usage (user_id) VALUES (v_uid)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT * INTO v_usage FROM global_job_write_usage WHERE user_id = v_uid FOR UPDATE;

  IF v_now - v_usage.window_started_at >= make_interval(secs => v_burst_window_seconds) THEN
    v_usage.window_started_at := v_now;
    v_usage.window_count := 0;
  END IF;

  IF v_usage.day_bucket IS DISTINCT FROM v_today THEN
    v_usage.day_bucket := v_today;
    v_usage.day_count := 0;
  END IF;

  IF v_usage.window_count >= v_burst_max THEN
    UPDATE global_job_write_usage SET
      window_started_at = v_usage.window_started_at,
      window_count = v_usage.window_count,
      day_bucket = v_usage.day_bucket,
      day_count = v_usage.day_count,
      updated_at = v_now
    WHERE user_id = v_uid;
    RAISE EXCEPTION 'too many job syncs — please slow down and try again shortly';
  END IF;

  IF v_usage.day_count >= v_daily_limit THEN
    UPDATE global_job_write_usage SET
      window_started_at = v_usage.window_started_at,
      window_count = v_usage.window_count + 1,
      day_bucket = v_usage.day_bucket,
      day_count = v_usage.day_count,
      updated_at = v_now
    WHERE user_id = v_uid;
    RAISE EXCEPTION 'daily job-sync limit reached — try again tomorrow';
  END IF;

  UPDATE global_job_write_usage SET
    window_started_at = v_usage.window_started_at,
    window_count = v_usage.window_count + 1,
    day_bucket = v_usage.day_bucket,
    day_count = v_usage.day_count + 1,
    updated_at = v_now
  WHERE user_id = v_uid;

  -- ── Identity resolution — byte-for-byte unchanged from the prior definition ──
  PERFORM pg_advisory_xact_lock(hashtext('gj:' || v_source || ':' || coalesce(v_source_job_id, v_fingerprint, '')));

  IF v_source_job_id IS NOT NULL THEN
    SELECT id INTO v_id FROM global_jobs
      WHERE source = v_source AND source_job_id = v_source_job_id;
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

  -- ── B3: refuse to overwrite an existing row under a different company ──
  IF v_id IS NOT NULL THEN
    SELECT company_name INTO v_existing_company FROM global_jobs WHERE id = v_id;
    IF normalize_company_name(v_existing_company) <> normalize_company_name(v_company_name) THEN
      RAISE EXCEPTION 'job identity mismatch — refusing to overwrite an unrelated existing job';
    END IF;
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
      description = COALESCE(v_description, description),
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
      -- Irreversible promotion: AND (not COALESCE) with the existing value.
      -- Missing input defaults to `true` so an omitted field leaves the
      -- existing value untouched (true AND x = x); an explicit `false` (a
      -- real parser capture) always wins and stays won (false AND x = false
      -- forever, since every later AND with it is still false).
      is_manual_import = COALESCE((payload->>'is_manual_import')::boolean, true) AND is_manual_import,
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
      is_manual_import,
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
      v_description,
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

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════
-- VERIFY (run after applying, in the Supabase SQL editor — these mutate a
-- throwaway row so wrap in a transaction and ROLLBACK, or clean up after)
-- ═══════════════════════════════════════════════════════════════════════
--
-- 1. Field bounds are enforced.
--   SELECT upsert_global_job(jsonb_build_object(
--     'source', 'test', 'source_job_id', 'verify-1',
--     'company_name', 'Acme', 'role', repeat('x', 500)
--   ));
--   -- expect: ERROR "role exceeds 200 characters"
--
-- 2. A caller cannot overwrite an unrelated existing job by guessing its
--    source_job_id: pick a real (source, source_job_id) pair already in
--    global_jobs, then:
--   SELECT upsert_global_job(jsonb_build_object(
--     'source', '<that source>', 'source_job_id', '<that source_job_id>',
--     'company_name', 'Totally Different Company', 'role', 'Hijacked'
--   ));
--   -- expect: ERROR "job identity mismatch — refusing to overwrite an
--   --         unrelated existing job"
--
-- 3. A legitimate re-sync of the SAME job (same source_job_id AND same
--    company_name) still updates in place, not rejected:
--   SELECT upsert_global_job(jsonb_build_object(
--     'source', '<that source>', 'source_job_id', '<that source_job_id>',
--     'company_name', '<that company_name>', 'role', 'Updated Title'
--   ));
--   -- expect: success, same row id, role updated
--
-- 4. Rate limit: run upsert_global_job 31 times in under 30 seconds as the
--    same user (distinct fingerprints each time, e.g. varying `role`).
--   -- expect: the 31st call raises "too many job syncs — please slow down
--   --         and try again shortly"
--   SELECT window_count, day_count FROM global_job_write_usage WHERE user_id = auth.uid();
--
-- 5. admin_upsert_global_job (service_role, crawler path) is untouched and
--    still works without any of the above limits applying to it:
--   SELECT proname FROM pg_proc WHERE proname = 'admin_upsert_global_job';
--   -- expect: 1 row, unchanged signature
