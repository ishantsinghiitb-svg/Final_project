-- ── Module 10A: Job Intelligence Foundation ──
--
-- Architecture-only migration backing the admin-only manual crawl pipeline
-- (Crawler → Adapter → Parser → Normalizer → Deduplicator → Database — see
-- src/server/jobIntelligence/). No platform crawler ships yet; this just
-- gives the pipeline somewhere safe to write. Purely additive: no existing
-- column, function, policy, or the extension/user write path
-- (`upsert_global_job`) is touched.
--
-- Three additions:
--   1. global_jobs: `tags`, `normalized_company`, `normalized_role` columns
--      + a trigger-maintained `search_vector` full-text index (search-index
--      strategy, no UI yet). See the ⚠️ note at that column for why it is a
--      trigger and not `GENERATED ALWAYS AS (…) STORED`.
--   2. `job_sources`: retains EVERY contributing platform's (source,
--      source_job_id, source_url, url) for a canonical job — the piece the
--      existing hierarchical dedup (Module 4A) didn't have: a cross-platform
--      merge keeps only the first-seen source's URL on `global_jobs` itself
--      (COALESCE never overwrites a set value), silently discarding the
--      others. `job_sources` is the durable history of every source that
--      ever matched, independent of which one "won" the primary columns.
--   3. `admin_upsert_global_job`: a SECURITY DEFINER function granted ONLY
--      to `service_role`, for the admin crawl pipeline, which has no
--      authenticated end-user request to gate on (`upsert_global_job`
--      requires `auth.uid() IS NOT NULL` by design — see its own comment
--      calling it "the single write path" for the user/extension surfaces).
--      This is a deliberate sibling, not a shared code path: same dedup
--      tiers (reusing `normalize_company_name`, `normalize_role_text`,
--      `find_cross_platform_match` unchanged), different trust boundary.
--      Application-layer admin gating (env allowlist, see
--      src/server/jobIntelligence/adminAuth.ts) is a second, independent
--      gate in front of it.

-- ── 1. global_jobs additions ──

ALTER TABLE global_jobs
  ADD COLUMN IF NOT EXISTS tags text[],
  ADD COLUMN IF NOT EXISTS normalized_company text,
  ADD COLUMN IF NOT EXISTS normalized_role text;

-- Backfill from the existing conservative SQL normalizers so pre-existing
-- rows are immediately usable as tier-3 dedup candidates / search rows too
-- (see supabase/migrations/20260722000001_module4a_hierarchical_dedup.sql
-- for normalize_company_name / normalize_role_text).
UPDATE global_jobs
SET normalized_company = normalize_company_name(company_name),
    normalized_role = normalize_role_text(role)
WHERE normalized_company IS NULL OR normalized_role IS NULL;

CREATE INDEX IF NOT EXISTS idx_global_jobs_normalized_company_role
  ON global_jobs (normalized_company, normalized_role);

-- ── Full-text search index ──
-- role/normalized_role weighted highest, then company/normalized_company/
-- tags, then location/employment/experience, description last. Mirrors the
-- field list + weighting documented in
-- src/server/jobIntelligence/search/searchIndex.ts (buildSearchIndexDocument)
-- so the DB index and the pure-TS "what's searchable" contract agree. Skills
-- live in the `job_skills` join table and are searched via that join
-- (see JobRepository.findAllRanked's existing skill-match query) rather than
-- folded into this column.
--
-- ⚠️ This is a TRIGGER-maintained column, NOT `GENERATED ALWAYS AS (…) STORED`.
-- A generated column's expression must be IMMUTABLE, and `array_to_string`
-- (needed for the `tags text[]` term) is only STABLE — PostgreSQL marks it so
-- because it invokes the element type's output function, which is not
-- immutable for every possible array type. Using it in a generated column
-- fails at DDL time with `42P17: generation expression is not immutable`.
-- Every other function in this expression (to_tsvector(regconfig, text),
-- setweight, tsvector ||, coalesce, text ||) IS immutable — `array_to_string`
-- alone is what pushes the expression over the line. Wrapping it in a
-- deliberately-mislabelled IMMUTABLE helper would silence the error by lying
-- to the planner, so this uses the standard pre-generated-column approach
-- instead: a plain column kept current by a BEFORE INSERT OR UPDATE trigger.
-- Write cost is identical (a generated column recomputes on every write too)
-- and reads are unchanged — a plain GIN index over a stored tsvector.

-- Idempotency: if an earlier attempt of this migration managed to create
-- `search_vector` as a GENERATED column, drop it — a generated column cannot
-- be assigned by a trigger, so the two definitions can't coexist.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'global_jobs'
      AND column_name = 'search_vector'
      AND is_generated = 'ALWAYS'
  ) THEN
    ALTER TABLE global_jobs DROP COLUMN search_vector;
  END IF;
END $$;

ALTER TABLE global_jobs ADD COLUMN IF NOT EXISTS search_vector tsvector;

-- The single definition of the search document. Both the trigger and the
-- backfill below call this, so the two can never disagree about which fields
-- are indexed or how they're weighted. STABLE (not IMMUTABLE) is the honest
-- marking given `array_to_string`; that's fine here because the result is
-- stored in a column and indexed with a plain GIN index — it never needs to
-- back an expression index.
CREATE OR REPLACE FUNCTION global_job_search_vector(
  p_role text,
  p_normalized_role text,
  p_company_name text,
  p_normalized_company text,
  p_tags text[],
  p_location text,
  p_city text,
  p_employment_type text,
  p_experience_level text,
  p_description text
)
RETURNS tsvector
LANGUAGE sql
STABLE
AS $$
  SELECT
    setweight(to_tsvector('english', coalesce(p_role, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(p_normalized_role, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(p_company_name, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(p_normalized_company, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(array_to_string(p_tags, ' '), '')), 'B') ||
    setweight(
      to_tsvector('english', coalesce(p_location, '') || ' ' || coalesce(p_city, '')),
      'C'
    ) ||
    setweight(
      to_tsvector('english', coalesce(p_employment_type, '') || ' ' || coalesce(p_experience_level, '')),
      'C'
    ) ||
    setweight(to_tsvector('english', coalesce(p_description, '')), 'D');
$$;

CREATE OR REPLACE FUNCTION global_jobs_search_vector_trigger()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Derive the normalized identity columns when the writer didn't supply
  -- them. `upsert_global_job` (the user/extension write path, deliberately
  -- left untouched by Module 10A) predates these columns and never sets
  -- them, so without this every extension-captured row would carry NULLs —
  -- missing from the search vector's B-weight terms AND invisible to
  -- SupabaseJobIntelligenceStore.findDedupCandidates' tier-3 candidate
  -- lookup, which filters on exactly these two columns.
  --
  -- A caller-supplied value always wins: admin_upsert_global_job passes the
  -- richer TS canonicalization ("Google Careers" -> "Google"), which
  -- normalize_company_name deliberately does not attempt. The extra
  -- `= normalize_company_name(OLD.company_name)` test refreshes a value only
  -- when it was itself SQL-derived and its source column just changed, so a
  -- caller's deliberate value is never clobbered as stale.
  IF NEW.normalized_company IS NULL
     OR (TG_OP = 'UPDATE'
         AND NEW.company_name IS DISTINCT FROM OLD.company_name
         AND NEW.normalized_company = normalize_company_name(OLD.company_name)) THEN
    NEW.normalized_company := normalize_company_name(NEW.company_name);
  END IF;

  IF NEW.normalized_role IS NULL
     OR (TG_OP = 'UPDATE'
         AND NEW.role IS DISTINCT FROM OLD.role
         AND NEW.normalized_role = normalize_role_text(OLD.role)) THEN
    NEW.normalized_role := normalize_role_text(NEW.role);
  END IF;

  NEW.search_vector := global_job_search_vector(
    NEW.role, NEW.normalized_role, NEW.company_name, NEW.normalized_company,
    NEW.tags, NEW.location, NEW.city, NEW.employment_type,
    NEW.experience_level, NEW.description
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS global_jobs_search_vector_update ON global_jobs;
CREATE TRIGGER global_jobs_search_vector_update
  BEFORE INSERT OR UPDATE ON global_jobs
  FOR EACH ROW EXECUTE FUNCTION global_jobs_search_vector_trigger();

-- Backfill every pre-existing row. Re-runnable: rows already carrying a
-- vector are skipped, and the trigger recomputes anything this touches.
UPDATE global_jobs
SET search_vector = global_job_search_vector(
  role, normalized_role, company_name, normalized_company,
  tags, location, city, employment_type, experience_level, description
)
WHERE search_vector IS NULL;

CREATE INDEX IF NOT EXISTS global_jobs_search_vector_idx ON global_jobs USING GIN (search_vector);

-- ── 2. job_sources ──

CREATE TABLE IF NOT EXISTS job_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES global_jobs(id) ON DELETE CASCADE,
  source text NOT NULL,
  source_job_id text,
  source_url text,
  url text,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

-- One row per (job, source, source_job_id) when the source gave a stable id...
CREATE UNIQUE INDEX IF NOT EXISTS job_sources_job_source_sourcejob_unique
  ON job_sources (job_id, source, source_job_id) WHERE source_job_id IS NOT NULL;
-- ...otherwise at most one fingerprint-only row per (job, source).
CREATE UNIQUE INDEX IF NOT EXISTS job_sources_job_source_unique
  ON job_sources (job_id, source) WHERE source_job_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_job_sources_job_id ON job_sources (job_id);

ALTER TABLE job_sources ENABLE ROW LEVEL SECURITY;

-- Public read, same posture as global_jobs itself — a source-attribution
-- list is not sensitive. No INSERT/UPDATE/DELETE policy is granted to
-- anon/authenticated: only the service-role admin pipeline writes here
-- (service_role bypasses RLS entirely), so client roles are read-only by
-- construction, not by an easily-missed WITH CHECK clause.
DROP POLICY IF EXISTS "job_sources_public_read" ON job_sources;
CREATE POLICY "job_sources_public_read" ON job_sources FOR SELECT
  TO anon, authenticated USING (true);

-- ── 3. admin_upsert_global_job ──

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

  -- Same advisory-lock keys `upsert_global_job` uses, so the admin path and
  -- the user/extension path serialize against each other for the same job
  -- identity instead of racing (see 20260722000001's comment).
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

  -- Resolve/create the companies row (Sprint-2+ linkage CompanyRepository.upsert
  -- already anticipated) using the canonical normalized name so
  -- "Google Careers" and "Google" resolve to the same company.
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
      technologies, languages, parser_version, parser_confidence, extraction_warnings
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
      -- Defaults to false, same as upsert_global_job's INSERT branch — an
      -- admin-crawled job is a real platform listing, not a manually-pasted
      -- URL, so it must be eligible for the Jobs page discovery feed
      -- (JobRepository.applyDiscoveryVisibility excludes is_manual_import=true).
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
      INSERT INTO job_skills (job_id, skill_id) VALUES (v_id, v_skill_id)
      ON CONFLICT (job_id, skill_id) DO NOTHING;
    END LOOP;
  END IF;

  -- Record this platform's contribution — every source that ever matched
  -- this canonical job keeps its own (source_job_id, source_url, url) row
  -- here, regardless of whether it won the primary global_jobs columns.
  -- Two partial unique indexes exist (with/without source_job_id) and a
  -- single INSERT can only target one ON CONFLICT arbiter, so which
  -- statement runs depends on which index this row actually falls under —
  -- inserting the source_job_id-less row against the "IS NOT NULL" arbiter
  -- would silently insert a duplicate every call instead of upserting.
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
