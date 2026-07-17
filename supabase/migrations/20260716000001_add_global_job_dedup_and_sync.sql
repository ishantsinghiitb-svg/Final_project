-- ── Global Job dedup + extension sync support ──
--
-- Adds a deterministic dedup key to global_jobs (source_job_id, fingerprint)
-- and a SECURITY DEFINER RPC that is the ONLY write path for creating/updating
-- global_jobs rows from a client (e.g. the Chrome extension). global_jobs has
-- no direct INSERT/UPDATE RLS policy — all writes must go through
-- upsert_global_job() so job-identity resolution and required-field checks
-- happen in one place instead of being re-implemented by every client.

ALTER TABLE global_jobs
  ADD COLUMN IF NOT EXISTS source_job_id text,
  ADD COLUMN IF NOT EXISTS fingerprint text,
  ADD COLUMN IF NOT EXISTS company_logo_url text,
  ADD COLUMN IF NOT EXISTS is_closed boolean NOT NULL DEFAULT false;

-- One row per (source, source_job_id) when the source exposes a stable ID.
CREATE UNIQUE INDEX IF NOT EXISTS global_jobs_source_job_id_key
  ON global_jobs (source, source_job_id)
  WHERE source_job_id IS NOT NULL;

-- Fallback dedup key when no external ID is available.
CREATE UNIQUE INDEX IF NOT EXISTS global_jobs_fingerprint_key
  ON global_jobs (fingerprint)
  WHERE fingerprint IS NOT NULL;

-- ── upsert_global_job ──
-- Resolves an existing global_jobs row by (source, source_job_id) first,
-- then by fingerprint, and either updates it in place or inserts a new row.
-- Never creates a duplicate for a job identity that already exists.
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
  v_row global_jobs;
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
      url = COALESCE(payload->>'url', url),
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
      salary_min, salary_max, salary_currency, description, url, source, posted_at,
      company_logo_url, source_job_id, fingerprint, is_closed
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
      payload->>'url',
      v_source,
      (payload->>'posted_at')::timestamptz,
      payload->>'company_logo_url',
      v_source_job_id,
      v_fingerprint,
      COALESCE((payload->>'is_closed')::boolean, false)
    )
    RETURNING * INTO v_row;
  END IF;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION upsert_global_job(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION upsert_global_job(jsonb) TO authenticated;
