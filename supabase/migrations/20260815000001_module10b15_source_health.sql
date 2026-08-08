-- ── Module 10B.1.5: Company Registry expansion + Source Health ──
--
-- Purely additive to Module 10B.1's `crawl_company_registry`. No existing
-- column changes type or meaning, no other table is touched, and the crawl
-- pipeline (Module 10A) is untouched.
--
-- Two things are added:
--
--   1. IDENTITY — `parent_company` and `aliases`. The curated company list
--      mixes three different relationships under one "A / B" notation: pure
--      aliases (Groww Invest Tech = Groww), legal renames (Zomato = Eternal)
--      and parent/subsidiary pairs (Blinkit is Zomato-owned but hires
--      separately). Aliases and renames collapse into ONE row; a subsidiary
--      that runs its own board stays its OWN row and records its parent here.
--      Collapsing those would silently drop a real hiring entity.
--      See src/server/jobIntelligence/crawl/registry/companyIdentity.ts.
--
--   2. HEALTH — whether the registered URL is actually a working jobs source,
--      tracked separately from whether the last CRAWL succeeded. These are
--      genuinely different facts: a board can be perfectly healthy while the
--      most recent crawl failed on a transient error, and a URL can be
--      silently BROKEN for weeks while `last_status` still reads 'success'
--      from before it broke. Module 10B.1's `last_*` columns keep their
--      crawl-outcome meaning and are not reused for this.
--      See src/server/jobIntelligence/crawl/verify/SourceVerifier.ts.

-- ── 1. Identity columns ──

ALTER TABLE crawl_company_registry
  -- Owning group when this entry is a subsidiary that still hires separately
  -- (Blinkit → Zomato, Naukri → Info Edge). NULL for independent companies.
  -- Deliberately a text label, not a self-referencing FK: the parent is often
  -- a holding company that is not itself a crawl target (Tata Sons), and a FK
  -- would force fake registry rows into existence just to satisfy it.
  ADD COLUMN IF NOT EXISTS parent_company text,
  -- Other names this same entity is known by, so an operator searching
  -- "Mamaearth" finds the "Honasa Consumer" row.
  ADD COLUMN IF NOT EXISTS aliases text[];

-- ── 2. Source-health columns ──

ALTER TABLE crawl_company_registry
  ADD COLUMN IF NOT EXISTS health_status text
    CHECK (health_status IN ('HEALTHY','REDIRECTED','BLOCKED','BROKEN','UNAVAILABLE','UNKNOWN')),
  ADD COLUMN IF NOT EXISTS last_checked_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_failure_at timestamptz,
  -- HTTP status from the most recent verification. NULL when the check never
  -- reached a response (DNS failure, timeout).
  ADD COLUMN IF NOT EXISTS http_status integer,
  -- What the source turned out to BE: an ATS id, or 'custom_careers' for a
  -- company-hosted page that is a real jobs board but not on a known ATS.
  -- Deliberately not CHECK-constrained to the current ATS list — registering a
  -- new ATS provider must not require a migration, the same reasoning that
  -- left `platform` unconstrained in Module 10B.1.
  ADD COLUMN IF NOT EXISTS detected_platform text,
  -- Operator-readable explanation for any non-HEALTHY status. Never raw stack
  -- traces: this is the text the admin panel shows.
  ADD COLUMN IF NOT EXISTS error_reason text,
  -- Where the URL actually resolved to, when it moved. Lets an operator fix a
  -- stale registry URL without re-deriving it by hand.
  ADD COLUMN IF NOT EXISTS resolved_url text,
  -- Postings visible at verification time. Evidence for the verdict, NOT a
  -- crawl result — `last_jobs_imported` remains the crawl's number.
  ADD COLUMN IF NOT EXISTS postings_seen integer;

-- `last_success_at` already exists from Module 10B.1 (crawl success). Health
-- success is a different event, so it gets its own column rather than
-- overloading that one.
ALTER TABLE crawl_company_registry
  ADD COLUMN IF NOT EXISTS last_health_success_at timestamptz;

-- Drives the admin panel's health rollup and "show me what needs attention".
CREATE INDEX IF NOT EXISTS idx_crawl_company_registry_health
  ON crawl_company_registry (health_status, platform);

-- ── 3. Verification runs ──
--
-- A verification sweep is not a crawl: it imports nothing, so recording it in
-- `crawl_runs` would corrupt that table's job counters (every sweep would look
-- like a crawl that imported 0 jobs). It gets its own small table.

CREATE TABLE IF NOT EXISTS source_verification_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  duration_ms integer,
  triggered_by text,
  status text NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'completed', 'failed')),

  sources_checked integer NOT NULL DEFAULT 0,
  healthy integer NOT NULL DEFAULT 0,
  redirected integer NOT NULL DEFAULT 0,
  blocked integer NOT NULL DEFAULT 0,
  broken integer NOT NULL DEFAULT 0,
  unavailable integer NOT NULL DEFAULT 0,
  unknown integer NOT NULL DEFAULT 0,

  report jsonb NOT NULL DEFAULT '{}'::jsonb,
  error text
);

CREATE INDEX IF NOT EXISTS idx_source_verification_runs_started_at
  ON source_verification_runs (started_at DESC);

ALTER TABLE source_verification_runs ENABLE ROW LEVEL SECURITY;
-- Operator-only, same posture as crawl_company_registry / crawl_runs: RLS on,
-- no policy for anon/authenticated, service_role only (it bypasses RLS).

-- ── 4. Registry expansion ──
--
-- The full curated company list, with the verdict each URL actually earned.
-- Every row below was generated from a live probe (scripts/probeCompanySources.ts
-- → scripts/deriveRegistrySeed.ts → scripts/emitRegistrySql.ts): no URL here
-- was assumed and none was invented. `health_status`, `http_status`,
-- `postings_seen` and `error_reason` record what happened when it was fetched.
--
--   enabled = true   A jobs board was VERIFIED at this URL — either an ATS
--                    public API that returned real postings, or a careers page
--                    demonstrably listing jobs.
--   enabled = false  The URL was reached but nothing proved it is a jobs board
--                    (almost always a JavaScript-rendered portal), or it is
--                    blocked/broken. Recorded so an operator can see and fix
--                    it, but NOT crawled: importing from an unverified source
--                    is exactly how bad data gets in.
--
-- INVARIANT: health_status IN ('HEALTHY','REDIRECTED') ⟺ enabled. A page that
-- merely loaded is stored as UNKNOWN, not HEALTHY — see `effectiveHealth` in
-- src/server/jobIntelligence/crawl/verify/seedRules.ts. Without that, rows
-- would read "HEALTHY" while sitting disabled, and the first thing an operator
-- would ask is why they are not running.
--
-- ⚠️ Every ATS board found by trying a candidate slug was additionally
-- CROSS-CHECKED (scripts/crossCheckBoards.ts): one posting was parsed and the
-- employer the board itself reports was compared against the company we meant.
-- This matters because some ATS APIs answer 200 with an EMPTY board for ANY
-- slug — verified live on SmartRecruiters, where
-- `/v1/companies/<nonsense>/postings` returns `{"totalFound":0,"content":[]}`.
-- A board that merely responded is not a board that exists, and a board that
-- exists is not necessarily the right company's.
--
-- ON CONFLICT DO NOTHING, same as the Module 10B.1 seed: re-running must never
-- clobber an operator's own edits to enabled/frequency/notes.

INSERT INTO crawl_company_registry (
  company_name, careers_url, platform, enabled, crawl_frequency_hours,
  parent_company, aliases,
  health_status, detected_platform, http_status, postings_seen, error_reason, notes
) VALUES
  ('Tata Consultancy Services (TCS)', 'https://www.tcs.com/careers', 'career-pages', false, 24, NULL, NULL, 'BLOCKED', NULL, 403, NULL, 'Blocked by the platform (HTTP 403).', 'Careers page reached but no jobs board confirmed. Disabled until verified.'),
  ('Infosys', 'https://www.infosys.com/careers', 'career-pages', false, 24, NULL, NULL, 'BLOCKED', NULL, 403, NULL, 'Blocked by the platform (HTTP 403).', 'Careers page reached but no jobs board confirmed. Disabled until verified.'),
  ('Wipro', 'https://www.wipro.com/careers', 'career-pages', false, 24, NULL, NULL, 'UNKNOWN', NULL, 200, NULL, 'Page loads but carries no job postings, job links or structured job data — it is most likely rendered with JavaScript. Register the underlying ATS board URL instead.', 'Careers page reached but no jobs board confirmed. Disabled until verified.'),
  ('HCLTech', 'https://www.hcltech.com/careers', 'career-pages', false, 24, NULL, NULL, 'UNAVAILABLE', NULL, NULL, NULL, 'Request timed out after 20000ms.', 'Careers page reached but no jobs board confirmed. Disabled until verified.'),
  ('Tech Mahindra', 'https://careers.techmahindra.com/', 'career-pages', false, 24, NULL, NULL, 'UNKNOWN', NULL, 200, NULL, 'Page loads but carries no job postings, job links or structured job data — it is most likely rendered with JavaScript. Register the underlying ATS board URL instead.', 'Careers page reached but no jobs board confirmed. Disabled until verified.'),
  ('LTIMindtree', 'https://www.ltimindtree.com/careers', 'career-pages', false, 24, 'Larsen & Toubro', NULL, 'UNKNOWN', NULL, 200, NULL, 'Page loads but carries no job postings, job links or structured job data — it is most likely rendered with JavaScript. Register the underlying ATS board URL instead.', 'Careers page reached but no jobs board confirmed. Disabled until verified.'),
  ('Cognizant India', 'https://careers.cognizant.com/global/en', 'career-pages', false, 24, NULL, NULL, 'BLOCKED', NULL, 403, NULL, 'Blocked by the platform (HTTP 403).', 'Careers page reached but no jobs board confirmed. Disabled until verified.'),
  ('Capgemini India', 'https://www.capgemini.com/in-en/careers/', 'career-pages', true, 24, NULL, NULL, 'HEALTHY', 'custom_careers', 200, 22, NULL, 'Custom careers page. Verified: 22 posting(s) visible.'),
  ('Accenture India', 'https://www.accenture.com/in-en/careers', 'career-pages', true, 24, NULL, NULL, 'HEALTHY', 'custom_careers', 200, 22, NULL, 'Custom careers page. Verified: 22 posting(s) visible.'),
  ('IBM India', 'https://www.ibm.com/in-en/careers', 'career-pages', true, 24, NULL, NULL, 'HEALTHY', 'custom_careers', 200, 5, NULL, 'Custom careers page. Verified: 5 posting(s) visible.'),
  ('Reliance Industries', 'https://careers.ril.com/', 'career-pages', false, 24, NULL, ARRAY['Jio Platforms', 'Reliance Industries / Jio Platforms']::text[], 'UNKNOWN', NULL, 200, NULL, 'Page loads but carries no job postings, job links or structured job data — it is most likely rendered with JavaScript. Register the underlying ATS board URL instead.', 'Careers page reached but no jobs board confirmed. Disabled until verified.'),
  ('Reliance Retail', 'https://careers.relianceretail.com/', 'career-pages', false, 24, 'Reliance Industries', NULL, 'UNAVAILABLE', NULL, NULL, NULL, 'fetch failed', 'Careers page reached but no jobs board confirmed. Disabled until verified.'),
  ('Tata Sons', 'https://www.tata.com/careers', 'career-pages', true, 24, NULL, ARRAY['Tata Digital', 'Tata Sons / Tata Digital']::text[], 'HEALTHY', 'custom_careers', 200, 26, NULL, 'Custom careers page. Verified: 26 posting(s) visible.'),
  ('Tata Motors', 'https://www.tatamotors.com/careers', 'career-pages', false, 24, 'Tata Sons', NULL, 'BLOCKED', NULL, 403, NULL, 'Blocked by the platform (HTTP 403).', 'Careers page reached but no jobs board confirmed. Disabled until verified.'),
  ('Tata Elxsi', 'https://www.tataelxsi.com/careers', 'career-pages', false, 24, 'Tata Sons', NULL, 'UNKNOWN', NULL, 200, 2, 'Reached, but no jobs board confirmed here — too few postings to be sure, or the page redirected somewhere that is not a careers page.', 'Careers page reached but no jobs board confirmed. Disabled until verified.'),
  ('Mahindra & Mahindra', 'https://www.mahindra.com/careers', 'career-pages', false, 24, NULL, NULL, 'UNKNOWN', NULL, 200, 1, 'Reached, but no jobs board confirmed here — too few postings to be sure, or the page redirected somewhere that is not a careers page.', 'Careers page reached but no jobs board confirmed. Disabled until verified.'),
  ('Bajaj Auto', 'https://www.bajajauto.com/careers/why-us', 'career-pages', true, 24, 'Bajaj Group', ARRAY['Bajaj Finserv', 'Bajaj Auto / Bajaj Finserv']::text[], 'HEALTHY', 'custom_careers', 200, 7, NULL, 'Custom careers page. Verified: 7 posting(s) visible.'),
  ('Larsen & Toubro (L&T)', 'https://www.larsentoubro.com/careers', 'career-pages', true, 24, NULL, NULL, 'HEALTHY', 'custom_careers', 200, 10, NULL, 'Custom careers page. Verified: 10 posting(s) visible.'),
  ('Adani Group', 'https://www.adani.com/careers', 'career-pages', false, 24, NULL, NULL, 'UNKNOWN', NULL, 200, 1, 'Reached, but no jobs board confirmed here — too few postings to be sure, or the page redirected somewhere that is not a careers page.', 'Careers page reached but no jobs board confirmed. Disabled until verified.'),
  ('Airtel', 'https://www.airtel.in/careers', 'career-pages', false, 24, NULL, ARRAY['Bharti Airtel', 'Airtel / Bharti Airtel']::text[], 'UNKNOWN', NULL, 200, NULL, 'Page loads but carries no job postings, job links or structured job data — it is most likely rendered with JavaScript. Register the underlying ATS board URL instead.', 'Careers page reached but no jobs board confirmed. Disabled until verified.'),
  ('Vodafone Idea', 'https://www.myvi.in/careers', 'career-pages', false, 24, NULL, NULL, 'UNKNOWN', NULL, 200, NULL, 'Page loads but carries no job postings, job links or structured job data — it is most likely rendered with JavaScript. Register the underlying ATS board URL instead.', 'Careers page reached but no jobs board confirmed. Disabled until verified.'),
  ('ITC', 'https://itcportal.com/careers.html', 'career-pages', true, 24, NULL, NULL, 'HEALTHY', 'custom_careers', 200, 12, NULL, 'Custom careers page. Verified: 12 posting(s) visible.'),
  ('Hindustan Unilever', 'https://www.hul.co.in/careers', 'career-pages', false, 24, NULL, NULL, 'BLOCKED', NULL, 403, NULL, 'Blocked by the platform (HTTP 403).', 'Careers page reached but no jobs board confirmed. Disabled until verified.'),
  ('Asian Paints', 'https://www.asianpaints.com/careers', 'career-pages', false, 24, NULL, NULL, 'BROKEN', NULL, 404, NULL, 'HTTP 404 Not Found', 'Careers page reached but no jobs board confirmed. Disabled until verified.'),
  ('Godrej Group', 'https://www.godrej.com/careers', 'career-pages', false, 24, NULL, NULL, 'UNKNOWN', NULL, 200, NULL, 'Page loads but carries no job postings, job links or structured job data — it is most likely rendered with JavaScript. Register the underlying ATS board URL instead.', 'Careers page reached but no jobs board confirmed. Disabled until verified.'),
  ('Titan Company', 'https://www.titancompany.in/careers', 'career-pages', true, 24, 'Tata Sons', NULL, 'HEALTHY', 'custom_careers', 200, 4, NULL, 'Custom careers page. Verified: 4 posting(s) visible.'),
  ('Bosch India', 'https://www.bosch.in/careers/', 'career-pages', true, 24, NULL, NULL, 'HEALTHY', 'custom_careers', 200, 7, NULL, 'Custom careers page. Verified: 7 posting(s) visible.'),
  ('Siemens India', 'https://www.siemens.com/in/en/company/jobs.html', 'career-pages', false, 24, NULL, NULL, 'UNKNOWN', NULL, 200, 1, 'Reached, but no jobs board confirmed here — too few postings to be sure, or the page redirected somewhere that is not a careers page.', 'Careers page reached but no jobs board confirmed. Disabled until verified.'),
  ('HDFC Bank', 'https://www.hdfcbank.com/personal/about-us/careers', 'career-pages', false, 24, 'HDFC Group', ARRAY['HDFC Life', 'HDFC Bank / HDFC Life']::text[], 'BLOCKED', NULL, 403, NULL, 'Blocked by the platform (HTTP 403).', 'Careers page reached but no jobs board confirmed. Disabled until verified.'),
  ('ICICI Bank', 'https://www.icicicareers.com/', 'career-pages', false, 24, 'ICICI Group', ARRAY['ICICI Lombard', 'ICICI Bank / ICICI Lombard']::text[], 'UNKNOWN', NULL, 200, NULL, 'Page loads but carries no job postings, job links or structured job data — it is most likely rendered with JavaScript. Register the underlying ATS board URL instead.', 'Careers page reached but no jobs board confirmed. Disabled until verified.'),
  ('Axis Bank', 'https://www.axis.bank.in/careers', 'career-pages', true, 24, NULL, NULL, 'HEALTHY', 'custom_careers', 200, 5, NULL, 'Custom careers page. Verified: 5 posting(s) visible.'),
  ('Kotak Mahindra Bank', 'https://www.kotak.com/en/careers.html', 'career-pages', false, 24, NULL, NULL, 'BROKEN', NULL, 404, NULL, 'HTTP 404 Not Found', 'Careers page reached but no jobs board confirmed. Disabled until verified.'),
  ('State Bank of India', 'https://sbi.bank.in/web/careers', 'career-pages', true, 24, NULL, NULL, 'HEALTHY', 'custom_careers', 200, 15, NULL, 'Custom careers page. Verified: 15 posting(s) visible.'),
  ('Yes Bank', 'https://www.yesbank.in/careers', 'career-pages', false, 24, NULL, NULL, 'UNAVAILABLE', NULL, NULL, NULL, 'Request timed out after 20000ms.', 'Careers page reached but no jobs board confirmed. Disabled until verified.'),
  ('IndusInd Bank', 'https://www.indusind.com/in/en/personal/careers.html', 'career-pages', false, 24, NULL, NULL, 'UNKNOWN', NULL, 200, NULL, 'Page loads but carries no job postings, job links or structured job data — it is most likely rendered with JavaScript. Register the underlying ATS board URL instead.', 'Careers page reached but no jobs board confirmed. Disabled until verified.'),
  ('Mphasis', 'https://careers.mphasis.com/', 'career-pages', false, 24, NULL, NULL, 'UNKNOWN', NULL, 200, NULL, 'Page loads but carries no job postings, job links or structured job data — it is most likely rendered with JavaScript. Register the underlying ATS board URL instead.', 'Careers page reached but no jobs board confirmed. Disabled until verified.'),
  ('Persistent Systems', 'https://www.persistent.com/careers', 'career-pages', false, 24, NULL, NULL, 'UNAVAILABLE', NULL, NULL, NULL, 'Request timed out after 20000ms.', 'Careers page reached but no jobs board confirmed. Disabled until verified.'),
  ('Coforge', 'https://www.coforge.com/careers', 'career-pages', false, 24, NULL, NULL, 'UNAVAILABLE', NULL, NULL, NULL, 'Request timed out after 20000ms.', 'Careers page reached but no jobs board confirmed. Disabled until verified.'),
  ('Zensar Technologies', 'https://www.zensar.com/careers', 'career-pages', false, 24, NULL, NULL, 'UNKNOWN', NULL, 200, 1, 'Reached, but no jobs board confirmed here — too few postings to be sure, or the page redirected somewhere that is not a careers page.', 'Careers page reached but no jobs board confirmed. Disabled until verified.'),
  ('Hexaware Technologies', 'https://hexaware.com/careers', 'career-pages', false, 24, NULL, NULL, 'UNKNOWN', NULL, 200, NULL, 'Page loads but carries no job postings, job links or structured job data — it is most likely rendered with JavaScript. Register the underlying ATS board URL instead.', 'Careers page reached but no jobs board confirmed. Disabled until verified.'),
  ('Cyient', 'https://www.cyient.com/careers', 'career-pages', false, 24, NULL, NULL, 'UNAVAILABLE', NULL, NULL, NULL, 'fetch failed', 'Careers page reached but no jobs board confirmed. Disabled until verified.'),
  ('L&T Technology Services', 'https://www.ltts.com/careers', 'career-pages', false, 24, NULL, NULL, 'UNKNOWN', NULL, 200, 2, 'Reached, but no jobs board confirmed here — too few postings to be sure, or the page redirected somewhere that is not a careers page.', 'Careers page reached but no jobs board confirmed. Disabled until verified.'),
  ('Tata Communications', 'https://www.tatacommunications.com/careers', 'career-pages', false, 24, 'Tata Sons', NULL, 'BROKEN', NULL, 404, NULL, 'HTTP 404 Not Found', 'Careers page reached but no jobs board confirmed. Disabled until verified.'),
  ('Samsung R&D India', 'https://www.samsung.com/in/about-us/careers/', 'career-pages', false, 24, NULL, NULL, 'UNKNOWN', NULL, 200, 2, 'Reached, but no jobs board confirmed here — too few postings to be sure, or the page redirected somewhere that is not a careers page.', 'Careers page reached but no jobs board confirmed. Disabled until verified.'),
  ('Google India', 'https://www.google.com/about/careers/applications/', 'career-pages', false, 24, NULL, NULL, 'UNKNOWN', NULL, 200, NULL, 'Page loads but carries no job postings, job links or structured job data — it is most likely rendered with JavaScript. Register the underlying ATS board URL instead.', 'Careers page reached but no jobs board confirmed. Disabled until verified.'),
  ('Microsoft India', 'https://careers.microsoft.com/', 'career-pages', false, 24, NULL, NULL, 'UNKNOWN', NULL, 200, NULL, 'Page loads but carries no job postings, job links or structured job data — it is most likely rendered with JavaScript. Register the underlying ATS board URL instead.', 'Careers page reached but no jobs board confirmed. Disabled until verified.'),
  ('Amazon India', 'https://www.amazon.jobs/en/locations/india', 'career-pages', false, 24, NULL, NULL, 'BROKEN', NULL, 404, NULL, 'HTTP 404 Not Found', 'Careers page reached but no jobs board confirmed. Disabled until verified.'),
  ('Adobe India', 'https://careers.adobe.com/us/en', 'career-pages', false, 24, NULL, NULL, 'UNKNOWN', NULL, 200, NULL, 'Page loads but carries no job postings, job links or structured job data — it is most likely rendered with JavaScript. Register the underlying ATS board URL instead.', 'Careers page reached but no jobs board confirmed. Disabled until verified.'),
  ('SAP Labs India', 'https://jobs.sap.com/', 'career-pages', false, 24, NULL, NULL, 'UNKNOWN', NULL, 200, NULL, 'Page loads but carries no job postings, job links or structured job data — it is most likely rendered with JavaScript. Register the underlying ATS board URL instead.', 'Careers page reached but no jobs board confirmed. Disabled until verified.'),
  ('Oracle India', 'https://www.oracle.com/in/careers/', 'career-pages', false, 24, NULL, NULL, 'BLOCKED', NULL, 403, NULL, 'Blocked by the platform (HTTP 403).', 'Careers page reached but no jobs board confirmed. Disabled until verified.'),
  ('Cisco India', 'https://jobs.cisco.com/', 'career-pages', false, 24, NULL, NULL, 'UNKNOWN', NULL, 200, NULL, 'Page loads but carries no job postings, job links or structured job data — it is most likely rendered with JavaScript. Register the underlying ATS board URL instead.', 'Careers page reached but no jobs board confirmed. Disabled until verified.'),
  ('Intuit India', 'https://www.intuit.com/careers/', 'career-pages', false, 24, NULL, NULL, 'BLOCKED', NULL, 429, NULL, 'Rate limited by the platform (HTTP 429).', 'Careers page reached but no jobs board confirmed. Disabled until verified.'),
  ('Salesforce India', 'https://careers.salesforce.com/en/jobs/', 'career-pages', false, 24, NULL, NULL, 'UNKNOWN', NULL, 200, NULL, 'Page loads but carries no job postings, job links or structured job data — it is most likely rendered with JavaScript. Register the underlying ATS board URL instead.', 'Careers page reached but no jobs board confirmed. Disabled until verified.'),
  ('Walmart Global Tech India', 'https://careers.walmart.com/us/en/home/careers-areas/technology', 'career-pages', true, 24, NULL, NULL, 'HEALTHY', 'custom_careers', 200, 23, NULL, 'Custom careers page. Verified: 23 posting(s) visible.'),
  ('Goldman Sachs India', 'https://www.goldmansachs.com/careers', 'career-pages', true, 24, NULL, NULL, 'HEALTHY', 'custom_careers', 200, 12, NULL, 'Custom careers page. Verified: 12 posting(s) visible.'),
  ('JPMorgan Chase India', 'https://www.jpmorganchase.com/careers', 'career-pages', true, 24, NULL, NULL, 'HEALTHY', 'custom_careers', 200, 8, NULL, 'Custom careers page. Verified: 8 posting(s) visible.'),
  ('Morgan Stanley India', 'https://www.morganstanley.com/careers', 'career-pages', false, 24, NULL, NULL, 'UNAVAILABLE', NULL, NULL, NULL, 'Request timed out after 20000ms.', 'Careers page reached but no jobs board confirmed. Disabled until verified.'),
  ('Deutsche Bank India', 'https://careers.db.com/', 'career-pages', false, 24, NULL, NULL, 'UNKNOWN', NULL, 200, NULL, 'Page loads but carries no job postings, job links or structured job data — it is most likely rendered with JavaScript. Register the underlying ATS board URL instead.', 'Careers page reached but no jobs board confirmed. Disabled until verified.'),
  ('American Express India', 'https://www.americanexpress.com/en-us/careers/', 'career-pages', false, 24, NULL, NULL, 'UNKNOWN', NULL, 200, 1, 'Reached, but no jobs board confirmed here — too few postings to be sure, or the page redirected somewhere that is not a careers page.', 'Careers page reached but no jobs board confirmed. Disabled until verified.'),
  ('Flipkart', 'https://www.flipkartcareers.com/', 'career-pages', false, 24, NULL, NULL, 'UNKNOWN', NULL, 200, NULL, 'Page loads but carries no job postings, job links or structured job data — it is most likely rendered with JavaScript. Register the underlying ATS board URL instead.', 'Careers page reached but no jobs board confirmed. Disabled until verified.'),
  ('Zomato', 'https://jobs.lever.co/eternal', 'career-pages', true, 24, NULL, ARRAY['Eternal', 'Zomato / Eternal']::text[], 'HEALTHY', 'lever', 200, 4, NULL, 'lever board. Verified: 4 posting(s).'),
  ('Swiggy', 'https://careers.smartrecruiters.com/swiggy', 'career-pages', true, 24, NULL, NULL, 'HEALTHY', 'smartrecruiters', 200, 18, NULL, 'smartrecruiters board. Verified: 18 posting(s).'),
  ('Paytm', 'https://jobs.lever.co/paytm', 'career-pages', true, 24, NULL, ARRAY['One97 Communications', 'Paytm / One97 Communications']::text[], 'HEALTHY', 'lever', 200, 248, NULL, 'lever board. Verified: 248 posting(s).'),
  ('PhonePe', 'https://boards.greenhouse.io/phonepe', 'career-pages', true, 24, NULL, NULL, 'HEALTHY', 'greenhouse', 200, 75, NULL, 'greenhouse board. Verified: 75 posting(s).'),
  ('Razorpay', 'https://razorpay.com/jobs/', 'career-pages', true, 24, NULL, NULL, 'HEALTHY', 'greenhouse', 200, 23, NULL, 'greenhouse board. Verified: 23 posting(s).'),
  ('Zerodha', 'https://zerodha.com/careers/', 'career-pages', false, 24, NULL, NULL, 'UNKNOWN', NULL, 200, NULL, 'Page loads but carries no job postings, job links or structured job data — it is most likely rendered with JavaScript. Register the underlying ATS board URL instead.', 'Careers page reached but no jobs board confirmed. Disabled until verified.'),
  ('Groww', 'https://boards.greenhouse.io/groww', 'career-pages', true, 24, NULL, NULL, 'HEALTHY', 'greenhouse', 200, 8, NULL, 'greenhouse board. Verified: 8 posting(s).'),
  ('Meesho', 'https://jobs.lever.co/meesho', 'career-pages', true, 24, NULL, NULL, 'HEALTHY', 'lever', 200, 49, NULL, 'lever board. Verified: 49 posting(s).'),
  ('Byju''s', 'https://byjus.com/careers-at-byjus/', 'career-pages', true, 24, NULL, NULL, 'HEALTHY', 'custom_careers', 200, 13, NULL, 'Custom careers page. Verified: 13 posting(s) visible.'),
  ('Unacademy', 'https://careers.smartrecruiters.com/unacademy', 'career-pages', true, 24, NULL, NULL, 'HEALTHY', 'smartrecruiters', 200, 3, NULL, 'smartrecruiters board. Verified: 3 posting(s).'),
  ('upGrad', 'https://www.upgrad.com/careers/', 'career-pages', false, 24, NULL, NULL, 'UNKNOWN', NULL, 200, NULL, 'Page loads but carries no job postings, job links or structured job data — it is most likely rendered with JavaScript. Register the underlying ATS board URL instead.', 'Careers page reached but no jobs board confirmed. Disabled until verified.'),
  ('Ola', 'https://olaelectric.com/careers', 'career-pages', false, 24, NULL, ARRAY['Ola Electric', 'Ola / Ola Electric']::text[], 'UNKNOWN', NULL, 200, NULL, 'Page loads but carries no job postings, job links or structured job data — it is most likely rendered with JavaScript. Register the underlying ATS board URL instead.', 'Careers page reached but no jobs board confirmed. Disabled until verified.'),
  ('Nykaa', 'https://www.nykaa.com/careers', 'career-pages', false, 24, NULL, NULL, 'UNKNOWN', NULL, 200, NULL, 'Page loads but carries no job postings, job links or structured job data — it is most likely rendered with JavaScript. Register the underlying ATS board URL instead.', 'Careers page reached but no jobs board confirmed. Disabled until verified.'),
  ('Lenskart', 'https://www.lenskart.com/careers', 'career-pages', false, 24, NULL, NULL, 'UNKNOWN', NULL, 200, NULL, 'Page loads but carries no job postings, job links or structured job data — it is most likely rendered with JavaScript. Register the underlying ATS board URL instead.', 'Careers page reached but no jobs board confirmed. Disabled until verified.'),
  ('CRED', 'https://jobs.lever.co/cred', 'career-pages', true, 24, NULL, NULL, 'HEALTHY', 'lever', 200, 6, NULL, 'lever board. Verified: 6 posting(s).'),
  ('Dream Sports', 'https://www.dreamsports.group/careers', 'career-pages', false, 24, NULL, ARRAY['Dream11', 'Dream11 / Dream Sports']::text[], 'BROKEN', 'lever', 404, NULL, 'HTTP 404 Not Found', 'Careers page reached but no jobs board confirmed. Disabled until verified.'),
  ('PB Fintech', 'https://www.policybazaar.com/careers/', 'career-pages', false, 24, NULL, ARRAY['PolicyBazaar', 'PolicyBazaar / PB Fintech']::text[], 'UNAVAILABLE', NULL, NULL, NULL, 'Request timed out after 20000ms.', 'Careers page reached but no jobs board confirmed. Disabled until verified.'),
  ('Freshworks', 'https://careers.smartrecruiters.com/freshworks', 'career-pages', true, 24, NULL, ARRAY['Freshdesk', 'Freshdesk / Freshworks']::text[], 'HEALTHY', 'smartrecruiters', 200, 100, NULL, 'smartrecruiters board. Verified: 100 posting(s).'),
  ('Zoho', 'https://www.zoho.com/careers/', 'career-pages', false, 24, NULL, NULL, 'UNKNOWN', NULL, 200, NULL, 'Page loads but carries no job postings, job links or structured job data — it is most likely rendered with JavaScript. Register the underlying ATS board URL instead.', 'Careers page reached but no jobs board confirmed. Disabled until verified.'),
  ('Postman', 'https://boards.greenhouse.io/postman', 'career-pages', true, 24, NULL, NULL, 'HEALTHY', 'greenhouse', 200, 106, NULL, 'greenhouse board. Verified: 106 posting(s).'),
  ('BrowserStack', 'https://www.browserstack.com/careers', 'career-pages', false, 24, NULL, NULL, 'UNKNOWN', NULL, 200, NULL, 'Page loads but carries no job postings, job links or structured job data — it is most likely rendered with JavaScript. Register the underlying ATS board URL instead.', 'Careers page reached but no jobs board confirmed. Disabled until verified.'),
  ('InMobi', 'https://boards.greenhouse.io/inmobi', 'career-pages', true, 24, NULL, NULL, 'HEALTHY', 'greenhouse', 200, 70, NULL, 'greenhouse board. Verified: 70 posting(s).'),
  ('ShareChat', 'https://sharechat.com/careers', 'career-pages', false, 24, NULL, NULL, 'UNKNOWN', NULL, 200, NULL, 'Page loads but carries no job postings, job links or structured job data — it is most likely rendered with JavaScript. Register the underlying ATS board URL instead.', 'Careers page reached but no jobs board confirmed. Disabled until verified.'),
  ('VerSe Innovation', 'https://boards.greenhouse.io/verse', 'career-pages', true, 24, NULL, ARRAY['Dailyhunt', 'Dailyhunt / VerSe Innovation']::text[], 'HEALTHY', 'greenhouse', 200, 5, NULL, 'greenhouse board. Verified: 5 posting(s).'),
  ('Chargebee', 'https://www.chargebee.com/careers/', 'career-pages', true, 24, NULL, NULL, 'HEALTHY', 'custom_careers', 200, 4, NULL, 'Custom careers page. Verified: 4 posting(s) visible.'),
  ('Innovaccer', 'https://innovaccer.com/careers', 'career-pages', true, 24, NULL, NULL, 'HEALTHY', 'custom_careers', 200, 4, NULL, 'Custom careers page. Verified: 4 posting(s) visible.'),
  ('Darwinbox', 'https://darwinbox.com/careers', 'career-pages', false, 24, NULL, NULL, 'UNKNOWN', NULL, 200, NULL, 'Page loads but carries no job postings, job links or structured job data — it is most likely rendered with JavaScript. Register the underlying ATS board URL instead.', 'Careers page reached but no jobs board confirmed. Disabled until verified.'),
  ('Icertis', 'https://www.icertis.com/careers/', 'career-pages', false, 24, NULL, NULL, 'UNKNOWN', NULL, 301, NULL, 'HTTP 301 Moved Permanently', 'Careers page reached but no jobs board confirmed. Disabled until verified.'),
  ('HighRadius', 'https://boards.greenhouse.io/highradius', 'career-pages', true, 24, NULL, NULL, 'HEALTHY', 'greenhouse', 200, 74, NULL, 'greenhouse board. Verified: 74 posting(s).'),
  ('Druva', 'https://boards.greenhouse.io/druva', 'career-pages', true, 24, NULL, NULL, 'HEALTHY', 'greenhouse', 200, 29, NULL, 'greenhouse board. Verified: 29 posting(s).'),
  ('MoEngage', 'https://www.moengage.com/careers/', 'career-pages', true, 24, NULL, NULL, 'HEALTHY', 'custom_careers', 200, 3, NULL, 'Custom careers page. Verified: 3 posting(s) visible.'),
  ('CleverTap', 'https://apply.workable.com/clevertap/', 'career-pages', false, 24, NULL, NULL, 'UNKNOWN', NULL, 200, 0, 'Reached, but no jobs board confirmed here — too few postings to be sure, or the page redirected somewhere that is not a careers page.', 'Careers page reached but no jobs board confirmed. Disabled until verified.'),
  ('Whatfix', 'https://careers.smartrecruiters.com/whatfix', 'career-pages', true, 24, NULL, NULL, 'HEALTHY', 'smartrecruiters', 200, 1, NULL, 'smartrecruiters board. Verified: 1 posting(s).'),
  ('Hasura', 'https://hasura.io/careers/', 'career-pages', false, 24, NULL, NULL, 'UNKNOWN', NULL, 200, NULL, 'Page loads but carries no job postings, job links or structured job data — it is most likely rendered with JavaScript. Register the underlying ATS board URL instead.', 'Careers page reached but no jobs board confirmed. Disabled until verified.'),
  ('Netradyne', 'https://boards.greenhouse.io/netradyne', 'career-pages', true, 24, NULL, NULL, 'HEALTHY', 'greenhouse', 200, 31, NULL, 'greenhouse board. Verified: 31 posting(s).'),
  ('Kissflow', 'https://kissflow.com/careers/', 'career-pages', false, 24, NULL, NULL, 'UNKNOWN', NULL, 200, NULL, 'Page loads but carries no job postings, job links or structured job data — it is most likely rendered with JavaScript. Register the underlying ATS board URL instead.', 'Careers page reached but no jobs board confirmed. Disabled until verified.'),
  ('Locus.sh', 'https://locus.sh/careers', 'career-pages', false, 24, NULL, NULL, 'UNKNOWN', NULL, 200, NULL, 'Page loads but carries no job postings, job links or structured job data — it is most likely rendered with JavaScript. Register the underlying ATS board URL instead.', 'Careers page reached but no jobs board confirmed. Disabled until verified.'),
  ('Uniphore', 'https://www.uniphore.com/careers/', 'career-pages', false, 24, NULL, NULL, 'UNKNOWN', NULL, 200, NULL, 'Page loads but carries no job postings, job links or structured job data — it is most likely rendered with JavaScript. Register the underlying ATS board URL instead.', 'Careers page reached but no jobs board confirmed. Disabled until verified.'),
  ('Yellow.ai', 'https://yellow.ai/careers/', 'career-pages', false, 24, NULL, NULL, 'BROKEN', NULL, 404, NULL, 'HTTP 404 Not Found', 'Careers page reached but no jobs board confirmed. Disabled until verified.'),
  ('Observe.AI', 'https://boards.greenhouse.io/observeai', 'career-pages', true, 24, NULL, NULL, 'HEALTHY', 'greenhouse', 200, 19, NULL, 'greenhouse board. Verified: 19 posting(s).'),
  ('Sprinklr India', 'https://www.sprinklr.com/careers/', 'career-pages', true, 24, NULL, NULL, 'HEALTHY', 'custom_careers', 200, 5, NULL, 'Custom careers page. Verified: 5 posting(s) visible.'),
  ('Zeta', 'https://jobs.lever.co/zeta', 'career-pages', true, 24, NULL, NULL, 'HEALTHY', 'lever', 200, 25, NULL, 'lever board. Verified: 25 posting(s).'),
  ('Wingify', 'https://wingify.com/careers', 'career-pages', false, 24, NULL, ARRAY['VWO', 'Wingify / VWO']::text[], 'UNKNOWN', NULL, 200, 2, 'Reached, but no jobs board confirmed here — too few postings to be sure, or the page redirected somewhere that is not a careers page.', 'Careers page reached but no jobs board confirmed. Disabled until verified.'),
  ('Exotel', 'https://exotel.com/careers/', 'career-pages', false, 24, NULL, NULL, 'UNKNOWN', NULL, 200, NULL, 'Page loads but carries no job postings, job links or structured job data — it is most likely rendered with JavaScript. Register the underlying ATS board URL instead.', 'Careers page reached but no jobs board confirmed. Disabled until verified.'),
  ('Fyle', 'https://www.fylehq.com/careers', 'career-pages', false, 24, NULL, NULL, 'UNKNOWN', NULL, 200, NULL, 'Page loads but carries no job postings, job links or structured job data — it is most likely rendered with JavaScript. Register the underlying ATS board URL instead.', 'Careers page reached but no jobs board confirmed. Disabled until verified.'),
  ('Increff', 'https://www.increff.com/careers/', 'career-pages', false, 24, NULL, NULL, 'UNKNOWN', NULL, 200, NULL, 'Page loads but carries no job postings, job links or structured job data — it is most likely rendered with JavaScript. Register the underlying ATS board URL instead.', 'Careers page reached but no jobs board confirmed. Disabled until verified.'),
  ('6sense', 'https://boards.greenhouse.io/6sense', 'career-pages', true, 24, NULL, ARRAY['Slintel', 'Slintel / 6sense']::text[], 'HEALTHY', 'greenhouse', 200, 31, NULL, 'greenhouse board. Verified: 31 posting(s).'),
  ('Signzy', 'https://www.signzy.com/careers/', 'career-pages', false, 24, NULL, NULL, 'UNKNOWN', NULL, 200, NULL, 'Page loads but carries no job postings, job links or structured job data — it is most likely rendered with JavaScript. Register the underlying ATS board URL instead.', 'Careers page reached but no jobs board confirmed. Disabled until verified.'),
  ('Perfios', 'https://www.perfios.com/careers/', 'career-pages', false, 24, NULL, NULL, 'UNKNOWN', NULL, 200, 1, 'Reached, but no jobs board confirmed here — too few postings to be sure, or the page redirected somewhere that is not a careers page.', 'Careers page reached but no jobs board confirmed. Disabled until verified.'),
  ('Delhivery', 'https://www.delhivery.com/careers', 'career-pages', false, 24, NULL, NULL, 'UNKNOWN', NULL, 200, NULL, 'Page loads but carries no job postings, job links or structured job data — it is most likely rendered with JavaScript. Register the underlying ATS board URL instead.', 'Careers page reached but no jobs board confirmed. Disabled until verified.'),
  ('BigBasket', 'https://www.bigbasket.com/careers/', 'career-pages', false, 24, NULL, NULL, 'UNKNOWN', NULL, 200, NULL, 'Page loads but carries no job postings, job links or structured job data — it is most likely rendered with JavaScript. Register the underlying ATS board URL instead.', 'Careers page reached but no jobs board confirmed. Disabled until verified.'),
  ('Urban Company', 'https://www.urbancompany.com/careers', 'career-pages', false, 24, NULL, NULL, 'BROKEN', NULL, 404, NULL, 'HTTP 404 Not Found', 'Careers page reached but no jobs board confirmed. Disabled until verified.'),
  ('Cars24', 'https://careers.smartrecruiters.com/cars24', 'career-pages', true, 24, NULL, NULL, 'HEALTHY', 'smartrecruiters', 200, 1, NULL, 'smartrecruiters board. Verified: 1 posting(s).'),
  ('Cult.fit', 'https://www.cult.fit/careers', 'career-pages', false, 24, NULL, ARRAY['Curefit', 'Cult.fit / Curefit']::text[], 'UNKNOWN', NULL, 200, NULL, 'Page loads but carries no job postings, job links or structured job data — it is most likely rendered with JavaScript. Register the underlying ATS board URL instead.', 'Careers page reached but no jobs board confirmed. Disabled until verified.'),
  ('Pine Labs', 'https://www.pinelabs.com/careers', 'career-pages', false, 24, NULL, NULL, 'UNKNOWN', NULL, 200, 1, 'Reached, but no jobs board confirmed here — too few postings to be sure, or the page redirected somewhere that is not a careers page.', 'Careers page reached but no jobs board confirmed. Disabled until verified.'),
  ('Digit Insurance', 'https://www.godigit.com/careers', 'career-pages', false, 24, NULL, NULL, 'UNKNOWN', NULL, 200, NULL, 'Page loads but carries no job postings, job links or structured job data — it is most likely rendered with JavaScript. Register the underlying ATS board URL instead.', 'Careers page reached but no jobs board confirmed. Disabled until verified.'),
  ('Acko', 'https://www.acko.com/careers/', 'career-pages', false, 24, NULL, NULL, 'UNKNOWN', NULL, 200, 1, 'Reached, but no jobs board confirmed here — too few postings to be sure, or the page redirected somewhere that is not a careers page.', 'Careers page reached but no jobs board confirmed. Disabled until verified.'),
  ('Zepto', 'https://www.zeptonow.com/careers', 'career-pages', false, 24, NULL, NULL, 'UNKNOWN', NULL, 202, NULL, 'Page loads but carries no job postings, job links or structured job data — it is most likely rendered with JavaScript. Register the underlying ATS board URL instead.', 'Careers page reached but no jobs board confirmed. Disabled until verified.'),
  ('Blinkit', 'https://blinkit.com/careers', 'career-pages', false, 24, 'Zomato', NULL, 'BLOCKED', NULL, 403, NULL, 'Blocked by the platform (HTTP 403).', 'Careers page reached but no jobs board confirmed. Disabled until verified.'),
  ('Rapido', 'https://rapido.bike/careers', 'career-pages', false, 24, NULL, NULL, 'BROKEN', NULL, 404, NULL, 'HTTP 404 Not Found', 'Careers page reached but no jobs board confirmed. Disabled until verified.'),
  ('Udaan', 'https://udaan.com/careers', 'career-pages', false, 24, NULL, NULL, 'UNAVAILABLE', NULL, NULL, NULL, 'fetch failed', 'Careers page reached but no jobs board confirmed. Disabled until verified.'),
  ('Licious', 'https://www.licious.in/careers', 'career-pages', false, 24, NULL, NULL, 'UNKNOWN', NULL, 200, 1, 'Reached, but no jobs board confirmed here — too few postings to be sure, or the page redirected somewhere that is not a careers page.', 'Careers page reached but no jobs board confirmed. Disabled until verified.'),
  ('Livspace', 'https://www.livspace.com/careers', 'career-pages', false, 24, NULL, NULL, 'UNKNOWN', NULL, 200, NULL, 'Page loads but carries no job postings, job links or structured job data — it is most likely rendered with JavaScript. Register the underlying ATS board URL instead.', 'Careers page reached but no jobs board confirmed. Disabled until verified.'),
  ('BlackBuck', 'https://blackbuck.com/careers', 'career-pages', false, 24, NULL, NULL, 'UNAVAILABLE', NULL, 502, NULL, 'HTTP 502 Bad Gateway', 'Careers page reached but no jobs board confirmed. Disabled until verified.'),
  ('Porter', 'https://jobs.lever.co/porter', 'career-pages', true, 24, NULL, NULL, 'HEALTHY', 'lever', 200, 25, NULL, 'lever board. Verified: 25 posting(s).'),
  ('Shiprocket', 'https://www.shiprocket.in/careers/', 'career-pages', false, 24, NULL, NULL, 'BROKEN', NULL, 404, NULL, 'HTTP 404 Not Found', 'Careers page reached but no jobs board confirmed. Disabled until verified.'),
  ('ClickPost', 'https://www.clickpost.ai/careers', 'career-pages', false, 24, NULL, NULL, 'UNKNOWN', NULL, 200, NULL, 'Page loads but carries no job postings, job links or structured job data — it is most likely rendered with JavaScript. Register the underlying ATS board URL instead.', 'Careers page reached but no jobs board confirmed. Disabled until verified.'),
  ('Country Delight', 'https://countrydelight.in/careers', 'career-pages', false, 24, NULL, NULL, 'UNKNOWN', NULL, 200, NULL, 'Page loads but carries no job postings, job links or structured job data — it is most likely rendered with JavaScript. Register the underlying ATS board URL instead.', 'Careers page reached but no jobs board confirmed. Disabled until verified.'),
  ('Zappfresh', 'https://www.zappfresh.com/careers', 'career-pages', false, 24, NULL, NULL, 'UNKNOWN', NULL, 200, NULL, 'Page loads but carries no job postings, job links or structured job data — it is most likely rendered with JavaScript. Register the underlying ATS board URL instead.', 'Careers page reached but no jobs board confirmed. Disabled until verified.'),
  ('Wakefit', 'https://www.wakefit.co/careers', 'career-pages', false, 24, NULL, NULL, 'BLOCKED', NULL, 403, NULL, 'Blocked by the platform (HTTP 403).', 'Careers page reached but no jobs board confirmed. Disabled until verified.'),
  ('Sleepy Owl', 'https://sleepyowl.co/pages/careers', 'career-pages', false, 24, NULL, NULL, 'BROKEN', NULL, 404, NULL, 'HTTP 404 Not Found', 'Careers page reached but no jobs board confirmed. Disabled until verified.'),
  ('Mokobara', 'https://www.mokobara.com/pages/careers', 'career-pages', false, 24, NULL, NULL, 'BROKEN', NULL, 404, NULL, 'HTTP 404 Not Found', 'Careers page reached but no jobs board confirmed. Disabled until verified.'),
  ('boAt', 'https://www.boat-lifestyle.com/pages/careers', 'career-pages', false, 24, NULL, ARRAY['Imagine Marketing', 'boAt / Imagine Marketing']::text[], 'BROKEN', NULL, 404, NULL, 'HTTP 404 Not Found', 'Careers page reached but no jobs board confirmed. Disabled until verified.'),
  ('Honasa Consumer', 'https://honasa.in/careers', 'career-pages', false, 24, NULL, ARRAY['Mamaearth', 'Mamaearth / Honasa Consumer']::text[], 'BROKEN', NULL, 404, NULL, 'HTTP 404 Not Found', 'Careers page reached but no jobs board confirmed. Disabled until verified.'),
  ('Noise', 'https://www.gonoise.com/pages/careers', 'career-pages', false, 24, NULL, NULL, 'UNKNOWN', NULL, 200, NULL, 'Page loads but carries no job postings, job links or structured job data — it is most likely rendered with JavaScript. Register the underlying ATS board URL instead.', 'Careers page reached but no jobs board confirmed. Disabled until verified.'),
  ('Sugar Cosmetics', 'https://in.sugarcosmetics.com/pages/careers', 'career-pages', false, 24, NULL, NULL, 'UNKNOWN', NULL, 200, NULL, 'Page loads but carries no job postings, job links or structured job data — it is most likely rendered with JavaScript. Register the underlying ATS board URL instead.', 'Careers page reached but no jobs board confirmed. Disabled until verified.'),
  ('The Man Company', 'https://www.themancompany.com/pages/careers', 'career-pages', false, 24, NULL, NULL, 'BROKEN', NULL, 404, NULL, 'HTTP 404 Not Found', 'Careers page reached but no jobs board confirmed. Disabled until verified.'),
  ('Purplle', 'https://www.purplle.com/careers', 'career-pages', false, 24, NULL, NULL, 'UNKNOWN', NULL, 200, NULL, 'Page loads but carries no job postings, job links or structured job data — it is most likely rendered with JavaScript. Register the underlying ATS board URL instead.', 'Careers page reached but no jobs board confirmed. Disabled until verified.'),
  ('FirstCry', 'https://www.firstcry.com/careers', 'career-pages', false, 24, NULL, NULL, 'UNKNOWN', NULL, 200, 1, 'Reached, but no jobs board confirmed here — too few postings to be sure, or the page redirected somewhere that is not a careers page.', 'Careers page reached but no jobs board confirmed. Disabled until verified.'),
  ('AJIO', 'https://www.ajio.com/careers', 'career-pages', false, 24, 'Reliance Industries', ARRAY['Reliance', 'AJIO / Reliance']::text[], 'BLOCKED', NULL, 403, NULL, 'Blocked by the platform (HTTP 403).', 'Careers page reached but no jobs board confirmed. Disabled until verified.'),
  ('Snapdeal', 'https://www.snapdeal.com/careers', 'career-pages', false, 24, NULL, NULL, 'BROKEN', NULL, 404, NULL, 'HTTP 404 Not Found', 'Careers page reached but no jobs board confirmed. Disabled until verified.'),
  ('ShopClues', 'https://www.shopclues.com/careers', 'career-pages', false, 24, NULL, NULL, 'UNKNOWN', NULL, 200, NULL, 'Page loads but carries no job postings, job links or structured job data — it is most likely rendered with JavaScript. Register the underlying ATS board URL instead.', 'Careers page reached but no jobs board confirmed. Disabled until verified.'),
  ('Juspay', 'https://juspay.io/careers', 'career-pages', false, 24, NULL, NULL, 'UNKNOWN', NULL, 200, NULL, 'Page loads but carries no job postings, job links or structured job data — it is most likely rendered with JavaScript. Register the underlying ATS board URL instead.', 'Careers page reached but no jobs board confirmed. Disabled until verified.'),
  ('Dhan', 'https://dhan.co/careers/', 'career-pages', false, 24, NULL, NULL, 'BROKEN', NULL, 404, NULL, 'HTTP 404 Not Found', 'Careers page reached but no jobs board confirmed. Disabled until verified.'),
  ('Slice', 'https://boards.greenhouse.io/slice', 'career-pages', true, 24, NULL, NULL, 'HEALTHY', 'greenhouse', 200, 45, NULL, 'greenhouse board. Verified: 45 posting(s).'),
  ('Jupiter', 'https://jupiter.money/careers/', 'career-pages', false, 24, NULL, ARRAY['Amica Financial Technologies', 'Jupiter / Amica Financial Technologies']::text[], 'UNKNOWN', NULL, 200, NULL, 'Page loads but carries no job postings, job links or structured job data — it is most likely rendered with JavaScript. Register the underlying ATS board URL instead.', 'Careers page reached but no jobs board confirmed. Disabled until verified.'),
  ('Fi Money', 'https://jobs.lever.co/epifi', 'career-pages', true, 24, NULL, ARRAY['epiFi', 'Fi Money / epiFi']::text[], 'HEALTHY', 'lever', 200, 11, NULL, 'lever board. Verified: 11 posting(s).'),
  ('FPL Technologies', 'https://www.getonecard.app/careers', 'career-pages', false, 24, NULL, ARRAY['OneCard', 'OneCard / FPL Technologies']::text[], 'BLOCKED', NULL, 403, NULL, 'Blocked by the platform (HTTP 403).', 'Careers page reached but no jobs board confirmed. Disabled until verified.'),
  ('KreditBee', 'https://www.kreditbee.in/careers', 'career-pages', false, 24, NULL, NULL, 'BLOCKED', NULL, 200, NULL, 'Anti-bot challenge page returned instead of content.', 'Careers page reached but no jobs board confirmed. Disabled until verified.'),
  ('Moneyview', 'https://moneyview.in/careers', 'career-pages', false, 24, NULL, NULL, 'UNKNOWN', NULL, 200, NULL, 'Page loads but carries no job postings, job links or structured job data — it is most likely rendered with JavaScript. Register the underlying ATS board URL instead.', 'Careers page reached but no jobs board confirmed. Disabled until verified.'),
  ('Open Financial Technologies', 'https://open.money/careers', 'career-pages', false, 24, NULL, NULL, 'BLOCKED', NULL, 200, NULL, 'Anti-bot challenge page returned instead of content.', 'Careers page reached but no jobs board confirmed. Disabled until verified.'),
  ('Khatabook', 'https://khatabook.com/careers', 'career-pages', false, 24, NULL, NULL, 'UNKNOWN', NULL, 200, NULL, 'Page loads but carries no job postings, job links or structured job data — it is most likely rendered with JavaScript. Register the underlying ATS board URL instead.', 'Careers page reached but no jobs board confirmed. Disabled until verified.'),
  ('Vyapar', 'https://vyaparapp.in/careers', 'career-pages', false, 24, NULL, NULL, 'UNKNOWN', NULL, 200, NULL, 'Page loads but carries no job postings, job links or structured job data — it is most likely rendered with JavaScript. Register the underlying ATS board URL instead.', 'Careers page reached but no jobs board confirmed. Disabled until verified.'),
  ('BharatPe', 'https://bharatpe.com/careers', 'career-pages', false, 24, NULL, NULL, 'UNKNOWN', NULL, 200, NULL, 'Page loads but carries no job postings, job links or structured job data — it is most likely rendered with JavaScript. Register the underlying ATS board URL instead.', 'Careers page reached but no jobs board confirmed. Disabled until verified.'),
  ('Simpl', 'https://getsimpl.com/careers', 'career-pages', false, 24, NULL, NULL, 'BROKEN', NULL, 404, NULL, 'HTTP 404 Not Found', 'Careers page reached but no jobs board confirmed. Disabled until verified.'),
  ('Setu', 'https://setu.co/careers', 'career-pages', false, 24, 'Pine Labs', ARRAY['Pine Labs', 'Setu / Pine Labs']::text[], 'UNKNOWN', NULL, 200, NULL, 'Page loads but carries no job postings, job links or structured job data — it is most likely rendered with JavaScript. Register the underlying ATS board URL instead.', 'Careers page reached but no jobs board confirmed. Disabled until verified.'),
  ('Jodo', 'https://www.jodo.in/careers', 'career-pages', false, 24, NULL, NULL, 'UNKNOWN', NULL, 200, NULL, 'Page loads but carries no job postings, job links or structured job data — it is most likely rendered with JavaScript. Register the underlying ATS board URL instead.', 'Careers page reached but no jobs board confirmed. Disabled until verified.'),
  ('Fractal Analytics', 'https://fractal.ai/careers/', 'career-pages', false, 24, NULL, NULL, 'UNKNOWN', NULL, 200, NULL, 'Page loads but carries no job postings, job links or structured job data — it is most likely rendered with JavaScript. Register the underlying ATS board URL instead.', 'Careers page reached but no jobs board confirmed. Disabled until verified.'),
  ('Mu Sigma', 'https://www.mu-sigma.com/careers', 'career-pages', false, 24, NULL, NULL, 'UNKNOWN', NULL, 200, NULL, 'Page loads but carries no job postings, job links or structured job data — it is most likely rendered with JavaScript. Register the underlying ATS board URL instead.', 'Careers page reached but no jobs board confirmed. Disabled until verified.'),
  ('LatentView Analytics', 'https://www.latentview.com/careers/', 'career-pages', false, 24, NULL, NULL, 'BROKEN', NULL, 404, NULL, 'HTTP 404 Not Found', 'Careers page reached but no jobs board confirmed. Disabled until verified.'),
  ('Tredence', 'https://www.tredence.com/careers', 'career-pages', false, 24, NULL, NULL, 'UNAVAILABLE', NULL, 503, NULL, 'HTTP 503 Service Unavailable', 'Careers page reached but no jobs board confirmed. Disabled until verified.'),
  ('Affine Analytics', 'https://affine.ai/careers', 'career-pages', false, 24, NULL, NULL, 'UNKNOWN', NULL, 200, NULL, 'Page loads but carries no job postings, job links or structured job data — it is most likely rendered with JavaScript. Register the underlying ATS board URL instead.', 'Careers page reached but no jobs board confirmed. Disabled until verified.'),
  ('Sarvam AI', 'https://jobs.ashbyhq.com/sarvam', 'career-pages', true, 24, NULL, NULL, 'HEALTHY', 'ashby', 200, 58, NULL, 'ashby board. Verified: 58 posting(s).'),
  ('Neysa', 'https://neysa.ai/careers', 'career-pages', false, 24, NULL, NULL, 'UNKNOWN', NULL, 200, 1, 'Reached, but no jobs board confirmed here — too few postings to be sure, or the page redirected somewhere that is not a careers page.', 'Careers page reached but no jobs board confirmed. Disabled until verified.'),
  ('Haptik', 'https://www.haptik.ai/careers', 'career-pages', false, 24, 'Reliance Industries', ARRAY['Jio', 'Haptik / Jio']::text[], 'UNAVAILABLE', NULL, NULL, NULL, 'fetch failed', 'Careers page reached but no jobs board confirmed. Disabled until verified.'),
  ('Physics Wallah', 'https://www.pw.live/careers', 'career-pages', false, 24, NULL, NULL, 'BROKEN', NULL, 404, NULL, 'HTTP 404 Not Found', 'Careers page reached but no jobs board confirmed. Disabled until verified.'),
  ('Vedantu', 'https://www.vedantu.com/careers', 'career-pages', false, 24, NULL, NULL, 'UNKNOWN', NULL, 200, NULL, 'Page loads but carries no job postings, job links or structured job data — it is most likely rendered with JavaScript. Register the underlying ATS board URL instead.', 'Careers page reached but no jobs board confirmed. Disabled until verified.'),
  ('Skyroot Aerospace', 'https://skyroot.in/careers', 'career-pages', false, 24, NULL, NULL, 'UNKNOWN', NULL, 200, NULL, 'Page loads but carries no job postings, job links or structured job data — it is most likely rendered with JavaScript. Register the underlying ATS board URL instead.', 'Careers page reached but no jobs board confirmed. Disabled until verified.'),
  ('Ather Energy', 'https://www.atherenergy.com/careers', 'career-pages', false, 24, NULL, NULL, 'BLOCKED', NULL, 403, NULL, 'Blocked by the platform (HTTP 403).', 'Careers page reached but no jobs board confirmed. Disabled until verified.'),
  ('MyGate', 'https://mygate.com/careers', 'career-pages', false, 24, NULL, NULL, 'UNKNOWN', NULL, 200, NULL, 'Page loads but carries no job postings, job links or structured job data — it is most likely rendered with JavaScript. Register the underlying ATS board URL instead.', 'Careers page reached but no jobs board confirmed. Disabled until verified.'),
  ('NoBroker', 'https://careers.smartrecruiters.com/nobroker', 'career-pages', true, 24, NULL, NULL, 'HEALTHY', 'smartrecruiters', 200, 1, NULL, 'smartrecruiters board. Verified: 1 posting(s).'),
  ('REA India', 'https://housing.com/careers', 'career-pages', false, 24, NULL, ARRAY['Housing.com', 'Housing.com / REA India']::text[], 'UNKNOWN', NULL, 406, NULL, 'HTTP 406 Not Acceptable', 'Careers page reached but no jobs board confirmed. Disabled until verified.'),
  ('99acres', 'https://www.infoedge.in/careers.aspx', 'career-pages', false, 24, 'Info Edge', ARRAY['Info Edge', '99acres / Info Edge']::text[], 'BROKEN', NULL, 404, NULL, 'HTTP 404 Not Found', 'Careers page reached but no jobs board confirmed. Disabled until verified.'),
  ('Naukri.com', 'https://www.naukri.com/careers', 'career-pages', false, 24, 'Info Edge', ARRAY['Info Edge', 'Naukri.com / Info Edge']::text[], 'BLOCKED', NULL, 403, NULL, 'Blocked by the platform (HTTP 403).', 'Careers page reached but no jobs board confirmed. Disabled until verified.'),
  ('Jeevansathi', 'https://www.jeevansathi.com/careers', 'career-pages', false, 24, 'Info Edge', ARRAY['Info Edge', 'Jeevansathi / Info Edge']::text[], 'BROKEN', NULL, 404, NULL, 'HTTP 404 Not Found', 'Careers page reached but no jobs board confirmed. Disabled until verified.'),
  ('Shaadi.com', 'https://www.shaadi.com/careers', 'career-pages', false, 24, NULL, NULL, 'BROKEN', NULL, 404, NULL, 'HTTP 404 Not Found', 'Careers page reached but no jobs board confirmed. Disabled until verified.'),
  ('Knowlarity', 'https://www.knowlarity.com/careers/', 'career-pages', false, 24, NULL, NULL, 'UNAVAILABLE', NULL, NULL, NULL, 'fetch failed', 'Careers page reached but no jobs board confirmed. Disabled until verified.')
ON CONFLICT DO NOTHING;
-- 178 curated lines → 177 rows (Freshdesk collapsed into Freshworks).
