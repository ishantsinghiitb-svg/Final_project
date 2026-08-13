-- ── Module 11A: Company Identity + Logo System ──
--
-- Goal: ONE canonical `companies` row and ONE canonical logo per real-world
-- employer, reused everywhere a company is shown, instead of every job
-- carrying its own independently-scraped name/logo. Purely additive to the
-- existing `companies` table (see 20260713131454_create_reference_tables.sql)
-- and to `admin_upsert_global_job` (Module 10A/10B.3) — no crawler adapter,
-- source-verification, dedup-tier, or `upsert_global_job` (extension write
-- path) logic is touched.
--
-- Five pieces:
--   1. `companies` gains `normalized_key` (the real identity key — see below),
--      `aliases`, `domain`, `logo_source`, `logo_checked_at`.
--   2. A one-time backfill + merge pass so every EXISTING row gets a
--      `normalized_key` and pre-existing legal-suffix-only duplicates (e.g. a
--      "Acme" row and a separately-created "Acme Inc" row, both allowed to
--      coexist under the old `lower(name)`-only uniqueness) collapse into
--      one, with their `global_jobs.company_id` references repointed. This
--      pass is CONSERVATIVE: it only merges rows whose SQL-side
--      `normalize_company_name()` output already agrees — the same bar
--      already trusted for cross-platform job dedup (see
--      `find_cross_platform_match`, Module 4A). It does NOT apply the richer
--      curated alias table (Zomato/Eternal, Freshdesk/Freshworks, …) — that
--      one only exists in TypeScript (`src/server/company/identity.ts` +
--      `crawl/registry/companyIdentity.ts`) and is applied by the operator-run
--      `scripts/backfillCompanyIdentity.ts` afterward. See that script's own
--      header for why the two passes are deliberately split.
--   3. `normalized_key` becomes the real uniqueness/conflict target (a
--      partial unique index — NULL/empty stays unconstrained defensively,
--      though the backfill above ensures no row is left that way). A
--      BEFORE INSERT/UPDATE trigger defaults it from `name` via the existing
--      `normalize_company_name()` whenever a caller doesn't supply one — so
--      `upsert_global_job` (the extension path, untouched) keeps working
--      exactly as before AND participates in the same identity key.
--   4. A logo-propagation trigger: whenever `companies.logo_url` is set or
--      changes, every `global_jobs` row already linked via `company_id`
--      is updated to the SAME `company_logo_url` — the mechanism that makes
--      "same canonical logo everywhere" true without touching a single
--      repository or UI component (they all already read
--      `global_jobs.company_logo_url` live, per-request — see
--      JobRepository/ApplicationRepository/InterviewRepository).
--   5. `admin_upsert_global_job` (Module 10 crawler ingestion) is patched so
--      its `companies` upsert targets `normalized_key` and accepts three new
--      OPTIONAL payload fields (`company_canonical_name`,
--      `company_normalized_key`, `company_domain`) computed by
--      `resolveCanonicalCompany()` before the RPC is called (see
--      SupabaseJobIntelligenceStore.ts). Omitting them reproduces today's
--      exact behavior — fully backward compatible. `company_logo_url` on the
--      job row itself now prefers the CANONICAL company logo over the job's
--      own freshly-scraped one, so a newly-crawled posting for an
--      already-known company immediately shows the established logo instead
--      of waiting for the propagation trigger.
--
-- Deliberately UNCHANGED: `global_jobs.company_name` / `normalized_company`
-- (both stay exactly the raw/SQL-normalized values they always were — the
-- cross-platform dedup grouping key `find_cross_platform_match` reads is not
-- touched by this migration), `upsert_global_job` (extension path), every
-- adapter, `SourceVerifier`, `DeduplicationEngine`, and `last_seen_at`/30-day
-- freshness logic.

-- ── 1. New columns ──

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS normalized_key text,
  ADD COLUMN IF NOT EXISTS aliases text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS domain text,
  ADD COLUMN IF NOT EXISTS logo_source text,
  ADD COLUMN IF NOT EXISTS logo_checked_at timestamptz;

COMMENT ON COLUMN companies.normalized_key IS
  'Stable identity/conflict key. Defaults from normalize_company_name(name) via trigger when a caller does not supply a richer, alias-resolved one. See companies_set_normalized_key_trigger.';
COMMENT ON COLUMN companies.aliases IS
  'Other names this entity is known by (merged in from duplicate rows collapsed during backfill, or supplied by a resolver). Display/search aid only — matching uses normalized_key.';
COMMENT ON COLUMN companies.domain IS
  'Lowercased, www.-stripped hostname of the company''s official site, when known. Powers the domain-based logo fallback (src/server/company/logo.ts).';
COMMENT ON COLUMN companies.logo_source IS
  'Provenance of logo_url: ''job_scraped'' (captured off a real posting) or ''domain_favicon'' (Module 11A domain fallback). NULL when logo_url is NULL or was set manually.';
COMMENT ON COLUMN companies.logo_checked_at IS
  'When the domain-based logo fallback last attempted this company, whether or not it found one — lets the resolver skip companies it already tried instead of re-checking every run.';

-- ── 2. One-time backfill + conservative merge ──

DO $$
DECLARE
  v_group RECORD;
  v_survivor_id uuid;
  v_dup_id uuid;
BEGIN
  -- Every row gets a normalized_key. Existing rows only (new rows get one via
  -- the trigger created in step 3, but that trigger doesn't exist yet at this
  -- point in the migration, so this UPDATE also covers rows inserted between
  -- migrations in a fresh `db reset` replay).
  UPDATE companies
  SET normalized_key = normalize_company_name(name)
  WHERE normalized_key IS NULL OR normalized_key = '';

  -- Merge groups that share a normalized_key — i.e. pre-existing rows the old
  -- lower(name)-only uniqueness let coexist as separate rows even though
  -- normalize_company_name() already treats them as the same company
  -- (e.g. "Acme" / "Acme Inc"). Survivor = earliest-created row, so existing
  -- FK references have the best chance of already pointing at it.
  FOR v_group IN
    SELECT normalized_key, array_agg(id ORDER BY created_at, id) AS ids
    FROM companies
    WHERE normalized_key IS NOT NULL AND normalized_key <> ''
    GROUP BY normalized_key
    HAVING count(*) > 1
  LOOP
    v_survivor_id := v_group.ids[1];

    FOREACH v_dup_id IN ARRAY v_group.ids[2:array_length(v_group.ids, 1)]
    LOOP
      -- Repoint every job referencing the duplicate to the survivor —
      -- non-destructive (global_jobs.company_id is nullable / ON DELETE SET
      -- NULL; this is a plain repoint, no job data is touched).
      UPDATE global_jobs SET company_id = v_survivor_id WHERE company_id = v_dup_id;

      -- Merge non-destructive fields onto the survivor, first-known-wins.
      UPDATE companies AS survivor
      SET
        website = COALESCE(survivor.website, dup.website),
        logo_url = COALESCE(survivor.logo_url, dup.logo_url),
        domain = COALESCE(survivor.domain, dup.domain),
        industry = COALESCE(survivor.industry, dup.industry),
        size = COALESCE(survivor.size, dup.size),
        headquarters = COALESCE(survivor.headquarters, dup.headquarters),
        aliases = (
          SELECT array_agg(DISTINCT a) FROM unnest(survivor.aliases || dup.aliases || ARRAY[dup.name]) AS a
        )
      FROM companies AS dup
      WHERE survivor.id = v_survivor_id AND dup.id = v_dup_id;

      DELETE FROM companies WHERE id = v_dup_id;
    END LOOP;
  END LOOP;
END $$;

-- ── 3. normalized_key as the real identity key ──
--
-- A plain (non-partial) unique index, deliberately — `admin_upsert_global_job`
-- below targets it with a bare `ON CONFLICT (normalized_key)`, which can only
-- use a partial index as its arbiter if the INSERT repeats the exact same
-- WHERE predicate. The backfill above + the trigger below guarantee every
-- row always has a non-empty normalized_key, so there is nothing a partial
-- predicate would usefully exclude — same shape as the `companies_name_unique
-- ON companies (lower(name))` index this augments.

CREATE UNIQUE INDEX IF NOT EXISTS companies_normalized_key_unique
  ON companies (normalized_key);

CREATE OR REPLACE FUNCTION companies_set_normalized_key()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.normalized_key IS NULL OR NEW.normalized_key = '' THEN
    NEW.normalized_key := normalize_company_name(NEW.name);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS companies_set_normalized_key_trigger ON companies;
CREATE TRIGGER companies_set_normalized_key_trigger
  BEFORE INSERT OR UPDATE OF name, normalized_key ON companies
  FOR EACH ROW EXECUTE FUNCTION companies_set_normalized_key();

-- ── 4. Canonical logo propagation ──
--
-- Fires whenever a company's logo becomes known or changes (from the RPC
-- below, or from the operator-run scripts/resolveCompanyLogos.ts domain
-- fallback) and fans it out to every job already linked via company_id.
-- Unconditional overwrite is intentional: once a canonical logo exists it is
-- authoritative — the whole point is that all of a company's postings show
-- the SAME logo, not whichever one their own scrape happened to capture.

CREATE OR REPLACE FUNCTION companies_propagate_logo()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.logo_url IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.logo_url IS DISTINCT FROM OLD.logo_url) THEN
    UPDATE global_jobs SET company_logo_url = NEW.logo_url WHERE company_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS companies_propagate_logo_trigger ON companies;
CREATE TRIGGER companies_propagate_logo_trigger
  AFTER INSERT OR UPDATE OF logo_url ON companies
  FOR EACH ROW EXECUTE FUNCTION companies_propagate_logo();

-- ── 5. admin_upsert_global_job: identity-aware companies upsert ──
--
-- Full CREATE OR REPLACE (plpgsql functions are replaced whole) — the ONLY
-- changes from the version in 20260819000001 are: three new DECLAREd
-- variables, the companies INSERT/ON CONFLICT block, and the two
-- `company_logo_url` assignments (INSERT branch's VALUES list, UPDATE
-- branch's SET clause). Every other line, including the dedup/matching logic
-- above the companies block and the job_sources bookkeeping below it, is
-- copied verbatim.

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
  -- ── Module 11A additions ──
  v_company_key text := NULLIF(btrim(coalesce(payload->>'company_normalized_key', '')), '');
  v_company_display_name text := NULLIF(btrim(coalesce(payload->>'company_canonical_name', '')), '');
  v_company_domain text := NULLIF(btrim(coalesce(payload->>'company_domain', '')), '');
  v_company_logo_url text;
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

  -- Resolve/create the companies row, keyed on the caller-resolved canonical
  -- identity (src/server/company/identity.ts) when given, falling back to
  -- the plain SQL normalize_company_name-derived key so this RPC stays
  -- correct even for a caller that omits the new fields. First-known-wins on
  -- website/logo/domain — an already-established canonical logo/domain is
  -- never overwritten by a later job's own (possibly worse) scrape.
  INSERT INTO companies (name, normalized_key, website, logo_url, domain, logo_source)
  VALUES (
    COALESCE(v_company_display_name, v_normalized_company),
    COALESCE(v_company_key, normalize_company_name(v_normalized_company)),
    payload->>'company_url',
    payload->>'company_logo_url',
    v_company_domain,
    CASE WHEN payload->>'company_logo_url' IS NOT NULL THEN 'job_scraped' ELSE NULL END
  )
  ON CONFLICT (normalized_key) DO UPDATE SET
    website = COALESCE(companies.website, EXCLUDED.website),
    logo_url = COALESCE(companies.logo_url, EXCLUDED.logo_url),
    domain = COALESCE(companies.domain, EXCLUDED.domain),
    logo_source = COALESCE(companies.logo_source, EXCLUDED.logo_source)
  RETURNING id, logo_url INTO v_company_id, v_company_logo_url;

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
      company_logo_url = COALESCE(v_company_logo_url, payload->>'company_logo_url', company_logo_url),
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
      COALESCE(v_company_logo_url, payload->>'company_logo_url'),
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
