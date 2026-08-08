-- ── Module 10B.1: Job Crawlers (Phase 1) ──
--
-- Adds the two operator-facing tables the Module 10A crawl pipeline was built
-- to be driven by, and nothing else. The pipeline itself
-- (Crawler → Parser → Validator → Normalizer → Deduplicator → Database) is
-- unchanged: writes still go through `admin_upsert_global_job`, source
-- attribution still lands in `job_sources`, and `global_jobs` is untouched by
-- this migration.
--
--   1. `crawl_company_registry` — the Company Registry. Crawl targets are
--      DATA, not code: adding a company is an INSERT here, never a code
--      change. See src/server/jobIntelligence/crawl/registry/.
--   2. `crawl_runs` — one row per crawl (live or dry run) holding the run
--      report, so "View Last Crawl Report" survives a page reload and a
--      server restart. See src/server/jobIntelligence/crawl/report/.
--
-- Both tables are operator-only: RLS is enabled and NO policy is granted to
-- `anon`/`authenticated`, so client roles cannot read or write them at all.
-- The only access path is the service-role client used by the admin server
-- functions (service_role bypasses RLS), which sit behind `requireAdmin`
-- (src/server/jobIntelligence/adminAuth.ts). This is the same "no client
-- policy = read-only/invisible by construction" posture Module 10A used for
-- `job_sources`, tightened one notch: a crawl registry exposes which
-- companies an operator is watching and a run report can carry error text,
-- neither of which is public information the way source attribution is.

-- ── 1. crawl_company_registry ──

CREATE TABLE IF NOT EXISTS crawl_company_registry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  company_name text NOT NULL,
  careers_url text NOT NULL,
  -- Which adapter handles this entry — matches `PlatformAdapter.platform`
  -- (see src/server/jobIntelligence/adapters/AdapterRegistry.ts). Deliberately
  -- NOT a CHECK-constrained enum: registering a new adapter must not require
  -- a migration, exactly as `global_jobs.source` is left unconstrained.
  platform text NOT NULL,

  enabled boolean NOT NULL DEFAULT true,
  -- How often this entry is due, in hours. `CrawlOrchestrator` skips entries
  -- crawled more recently than this unless the operator forces a run.
  crawl_frequency_hours integer NOT NULL DEFAULT 24
    CHECK (crawl_frequency_hours > 0),

  last_crawl_at timestamptz,
  last_success_at timestamptz,
  -- Outcome of the most recent attempt, for the admin list view. 'skipped'
  -- means "not due yet" — recorded so an operator can tell a skip from a
  -- never-attempted entry.
  last_status text CHECK (last_status IN ('success', 'partial', 'failed', 'skipped')),
  last_error text,
  last_jobs_imported integer,

  notes text,

  -- Adapter-specific overrides (e.g. an ATS board token that can't be derived
  -- from careers_url, or a We Work Remotely category slug). Kept as jsonb so a
  -- new adapter's options never require a schema change — the "future
  -- companies must be added by configuration only" requirement applies to
  -- adapter options too. Adapters that need nothing here read `{}`.
  config jsonb NOT NULL DEFAULT '{}'::jsonb,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- One entry per company per platform: the same company legitimately appears
-- twice if an operator tracks both its Greenhouse board and its We Work
-- Remotely postings, but registering the identical pair twice is always a
-- mistake (it would double-crawl and double-count in every report).
CREATE UNIQUE INDEX IF NOT EXISTS crawl_company_registry_company_platform_unique
  ON crawl_company_registry (lower(company_name), platform);

CREATE INDEX IF NOT EXISTS idx_crawl_company_registry_platform_enabled
  ON crawl_company_registry (platform, enabled);

ALTER TABLE crawl_company_registry ENABLE ROW LEVEL SECURITY;

-- ── 2. crawl_runs ──

CREATE TABLE IF NOT EXISTS crawl_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- 'live' writes to global_jobs; 'dry_run' runs the identical pipeline and
  -- discards the write (see CrawlOrchestrator + DryRunJobIntelligenceStore).
  mode text NOT NULL CHECK (mode IN ('live', 'dry_run')),
  -- What the operator asked for: one platform, or every enabled entry.
  scope text NOT NULL CHECK (scope IN ('platform', 'all')),
  -- NULL when scope = 'all'.
  platform text,
  -- The admin's verified email (from requireAdmin), for an audit trail.
  triggered_by text,

  status text NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'completed', 'failed')),

  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  duration_ms integer,

  -- ── Report counters ──
  -- Denormalized out of `report` so the admin list can be rendered, sorted and
  -- filtered without parsing jsonb. `report` remains the full record.
  companies_scanned integer NOT NULL DEFAULT 0,
  jobs_discovered integer NOT NULL DEFAULT 0,
  jobs_parsed integer NOT NULL DEFAULT 0,
  jobs_imported integer NOT NULL DEFAULT 0,
  jobs_updated integer NOT NULL DEFAULT 0,
  jobs_duplicates integer NOT NULL DEFAULT 0,
  jobs_skipped integer NOT NULL DEFAULT 0,
  jobs_failed integer NOT NULL DEFAULT 0,

  -- Full structured report: per-company results, validation/skip reasons, and
  -- any platform limitations reported by a blocked adapter. See
  -- src/server/jobIntelligence/crawl/report/CrawlReport.ts for the shape.
  report jsonb NOT NULL DEFAULT '{}'::jsonb,
  error text
);

CREATE INDEX IF NOT EXISTS idx_crawl_runs_started_at ON crawl_runs (started_at DESC);
CREATE INDEX IF NOT EXISTS idx_crawl_runs_platform_started
  ON crawl_runs (platform, started_at DESC);

ALTER TABLE crawl_runs ENABLE ROW LEVEL SECURITY;

-- ── 3. Seed registry ──
--
-- A starter set so the framework is usable the moment the migration lands,
-- rather than an empty table an operator has to guess the shape of. Every
-- entry below was verified to return real postings from its provider's PUBLIC,
-- documented job-board endpoint at the time this migration was written; the
-- ATS provider and board token are derived from `careers_url` by
-- `detectAtsBoard` (src/server/jobIntelligence/adapters/careerPages/ats/), so
-- adding a company really is one INSERT with a URL.
--
-- ON CONFLICT DO NOTHING: re-running the migration must never clobber an
-- operator's own edits (enabled/frequency/notes) to a seeded row.

INSERT INTO crawl_company_registry (company_name, careers_url, platform, crawl_frequency_hours, notes)
VALUES
  ('Stripe',     'https://boards.greenhouse.io/stripe',      'career-pages', 24, 'Greenhouse public job board API.'),
  ('Figma',      'https://boards.greenhouse.io/figma',       'career-pages', 24, 'Greenhouse public job board API.'),
  ('Databricks', 'https://boards.greenhouse.io/databricks',  'career-pages', 24, 'Greenhouse public job board API.'),
  ('Airbnb',     'https://boards.greenhouse.io/airbnb',      'career-pages', 24, 'Greenhouse public job board API.'),
  ('Spotify',    'https://jobs.lever.co/spotify',            'career-pages', 24, 'Lever public postings API.'),
  ('OpenAI',     'https://jobs.ashbyhq.com/openai',          'career-pages', 24, 'Ashby public job-board API.'),
  ('Linear',     'https://jobs.ashbyhq.com/linear',          'career-pages', 24, 'Ashby public job-board API.'),
  ('Ramp',       'https://jobs.ashbyhq.com/ramp',            'career-pages', 24, 'Ashby public job-board API.'),
  -- Board-wide feeds. These are not a single company's careers page, so
  -- company_name records the source itself; the real employer is read from
  -- each posting during parsing.
  ('We Work Remotely — All Jobs',    'https://weworkremotely.com/remote-jobs.rss',                       'weworkremotely', 12, 'Official RSS feed. robots.txt allows crawling.'),
  ('We Work Remotely — Programming', 'https://weworkremotely.com/categories/remote-programming-jobs.rss','weworkremotely', 12, 'Official category RSS feed.'),
  ('Internshala — Internships',      'https://internshala.com/internships/',                             'internshala',    12, 'Server-rendered listing. Path pagination only: robots.txt disallows query strings.'),
  ('Internshala — Jobs',             'https://internshala.com/jobs/',                                    'internshala',    12, 'Server-rendered listing (full-time roles).')
ON CONFLICT DO NOTHING;
