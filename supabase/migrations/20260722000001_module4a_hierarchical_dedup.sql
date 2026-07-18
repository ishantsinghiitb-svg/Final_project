-- ── Module 4A: hierarchical + cross-platform Global Job dedup ──
--
-- global_jobs is a shared catalog: only one row should exist per real-world
-- opening, regardless of user, extension vs. manual import, or source
-- platform. Resolution priority, in order:
--
--   1. (source, source_job_id)  — exact, unchanged from prior migrations
--   2. fingerprint               — exact, unchanged from prior migrations
--   3. cross-platform similarity — NEW: the same opening posted on a
--      different board (LinkedIn, Greenhouse, Lever, Ashby, Workday,
--      Wellfound, Indeed, ...) with no shared external id or fingerprint
--
-- Tier 3 is deliberately conservative — "false positives are worse than
-- duplicates":
--   • company + role + location must ALL match after normalization (company
--     legal suffixes stripped, whitespace/case collapsed). A resolvable
--     location is REQUIRED on both sides and must agree; two postings that
--     only differ by city (e.g. Google/Bangalore vs. Google/Hyderabad) can
--     never merge, and a posting with no location at all never attempts
--     cross-platform matching.
--   • work_mode / employment_type are hard gates too: if both sides have a
--     value and it conflicts, that candidate is rejected outright — absence
--     on either side is neutral (doesn't help, doesn't hurt).
--   • Passing every gate above is worth 80/100 confidence — deliberately
--     BELOW the merge bar on its own, so title+company (+location) alone can
--     never trigger a merge. Reaching 90 requires at least one more
--     independent corroborating signal: posted_at within ±2 days (+10) or an
--     overlapping salary range (+10). Merge only fires at confidence ≥ 90.
--
-- Extensibility: all tier-3 logic lives in `find_cross_platform_match`, a
-- single internal helper `upsert_global_job` calls after tiers 1–2 miss. A
-- future fuzzy/embedding-based strategy only has to change (or replace) that
-- one function's body — `upsert_global_job`'s signature, every caller, and
-- tiers 1–2 never need to change.
--
-- Concurrency: advisory locks (auto-released at transaction end, i.e. at the
-- end of this single RPC call) serialize concurrent upserts that share an
-- identity key, so two simultaneous requests for the same job can no longer
-- both pass their "does this already exist" check before either commits —
-- the second call always sees the first's row and updates it in place
-- instead of inserting a sibling.
--
-- Purely additive: no renames, no drops, no changes to any existing column,
-- to tiers 1–2's logic, or to any other Module 1–4A behavior.

-- ── Normalization helpers ──
-- IMMUTABLE so they can back a functional index (below) and so tier 3's
-- matching is deterministic given the same inputs.

CREATE OR REPLACE FUNCTION normalize_company_name(input text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  -- Strips punctuation, then a single common trailing legal suffix, so
  -- "Google LLC", "Google, Inc.", "Google Inc" and "Google" all normalize to
  -- the same value. Deliberately simple/rule-based rather than a lookup
  -- table — good enough to defeat the most common cross-platform naming
  -- noise without pretending to be a real company-entity resolver.
  SELECT btrim(
    regexp_replace(
      regexp_replace(
        regexp_replace(lower(coalesce(input, '')), '[.,]', '', 'g'),
        '\s+', ' ', 'g'
      ),
      '\s+(inc|llc|ltd|limited|corp|corporation|co|gmbh|plc|pvt ltd|private limited)$',
      ''
    )
  );
$$;

CREATE OR REPLACE FUNCTION normalize_role_text(input text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT btrim(regexp_replace(lower(coalesce(input, '')), '\s+', ' ', 'g'));
$$;

CREATE OR REPLACE FUNCTION normalize_location_text(input text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT NULLIF(btrim(regexp_replace(lower(coalesce(input, '')), '\s+', ' ', 'g')), '');
$$;

-- Keeps the tier-3 candidate lookup (WHERE on normalized company + role) fast
-- as the catalog grows, the same way global_jobs_discovery_idx already does
-- for the Jobs page listing.
CREATE INDEX IF NOT EXISTS global_jobs_normalized_identity_idx
  ON global_jobs (normalize_company_name(company_name), normalize_role_text(role));

-- ── Tier 3: cross-platform similarity match ──
CREATE OR REPLACE FUNCTION find_cross_platform_match(payload jsonb)
RETURNS uuid
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_company text := normalize_company_name(payload->>'company_name');
  v_role text := normalize_role_text(payload->>'role');
  v_location text := normalize_location_text(coalesce(payload->>'city', payload->>'location'));
  v_work_mode text := payload->>'work_mode';
  v_employment_type text := payload->>'employment_type';
  v_posted_at timestamptz := (payload->>'posted_at')::timestamptz;
  v_salary_min numeric := (payload->>'salary_min')::numeric;
  v_salary_max numeric := (payload->>'salary_max')::numeric;
  v_candidate RECORD;
  v_best_id uuid := NULL;
  v_best_score numeric := 0;
  v_score numeric;
BEGIN
  -- Conservative entry requirement: without a company, a role, AND a
  -- resolvable location on the INCOMING payload, there's nothing safe to
  -- fuzzy-match against — never guess a merge from partial data.
  IF v_company = '' OR v_role = '' OR v_location IS NULL THEN
    RETURN NULL;
  END IF;

  FOR v_candidate IN
    SELECT id, work_mode, employment_type, posted_at, salary_min, salary_max
    FROM global_jobs
    WHERE normalize_company_name(company_name) = v_company
      AND normalize_role_text(role) = v_role
      AND normalize_location_text(coalesce(city, location)) = v_location
  LOOP
    -- Hard gates — a categorical field present on BOTH sides must agree.
    -- Two postings for the same company/role/location but conflicting
    -- employment type or work mode are a different real-world opening
    -- (e.g. a contract role vs. a full-time one), not the same one
    -- cross-posted. Absence on either side is neutral, not disqualifying.
    IF v_work_mode IS NOT NULL AND v_candidate.work_mode IS NOT NULL
       AND v_work_mode <> v_candidate.work_mode THEN
      CONTINUE;
    END IF;
    IF v_employment_type IS NOT NULL AND v_candidate.employment_type IS NOT NULL
       AND v_employment_type <> v_candidate.employment_type THEN
      CONTINUE;
    END IF;

    -- Passing company + role + location (+ the two gates above) is worth 80
    -- — below the 90 merge bar on its own. At least one independent
    -- corroborating signal is required to actually merge.
    v_score := 80;

    IF v_posted_at IS NOT NULL AND v_candidate.posted_at IS NOT NULL
       AND abs(extract(epoch FROM (v_posted_at - v_candidate.posted_at))) <= 2 * 86400 THEN
      v_score := v_score + 10;
    END IF;

    IF v_salary_min IS NOT NULL AND v_salary_max IS NOT NULL
       AND v_candidate.salary_min IS NOT NULL AND v_candidate.salary_max IS NOT NULL
       AND v_salary_min <= v_candidate.salary_max
       AND v_candidate.salary_min <= v_salary_max THEN
      v_score := v_score + 10;
    END IF;

    IF v_score > v_best_score THEN
      v_best_score := v_score;
      v_best_id := v_candidate.id;
    END IF;
  END LOOP;

  IF v_best_score >= 90 THEN
    RETURN v_best_id;
  END IF;

  RETURN NULL;
END;
$$;

-- ── upsert_global_job (extended with tier 3 + concurrency-safe locking) ──
-- Identical column list/COALESCE semantics to the prior migration. The only
-- behavioral additions are the two advisory locks and the tier-3 lookup
-- inserted between the existing fingerprint lookup and the INSERT branch.
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

  -- Serializes concurrent upserts for the SAME (source, source_job_id) or
  -- fingerprint identity: released automatically when this transaction (this
  -- single RPC call) ends. Without it, two simultaneous requests for the
  -- same job could both run their "does this exist?" SELECT before either
  -- commits an INSERT, and both conclude "no" — the second call now blocks
  -- here until the first finishes, then correctly finds its row.
  PERFORM pg_advisory_xact_lock(hashtext('gj:' || v_source || ':' || coalesce(v_source_job_id, v_fingerprint, '')));

  IF v_source_job_id IS NOT NULL THEN
    SELECT id INTO v_id FROM global_jobs
      WHERE source = v_source AND source_job_id = v_source_job_id;
  END IF;

  IF v_id IS NULL AND v_fingerprint IS NOT NULL THEN
    SELECT id INTO v_id FROM global_jobs WHERE fingerprint = v_fingerprint;
  END IF;

  -- Tier 3 — only attempted once tiers 1–2 have both missed. Same locking
  -- rationale as above, keyed by the normalized identity tier 3 matches on,
  -- so two concurrent cross-platform posts of the same opening also
  -- serialize instead of racing.
  IF v_id IS NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext(
      'gj-xplat:' || normalize_company_name(v_company_name) || ':' || normalize_role_text(v_role)
    ));
    v_id := find_cross_platform_match(payload);
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

REVOKE ALL ON FUNCTION find_cross_platform_match(jsonb) FROM PUBLIC;
