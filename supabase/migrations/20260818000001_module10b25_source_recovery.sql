-- ── Module 10B.2.5: recover 3 sources to their verified real board ──
--
-- The Module 10B.2 Dry Run Audit's 20 "unsupported career page" failures were
-- investigated using only public information. Three turned out to have a real,
-- already-supported ATS board reachable from their registered page — the
-- registered URL was just pointing at a marketing/landing page instead of the
-- board itself:
--
--   Razorpay    — its careers page links out to a real Greenhouse board
--                 (razorpaysoftwareprivatelimited), live-verified with 20
--                 postings via the public Greenhouse API.
--   Innovaccer  — its "apply now" links go to apply.workable.com/j/..., i.e.
--                 a real Workable account (token "innovaccer"), confirmed via
--                 the public Workable widget API (0 open postings right now —
--                 a real, currently-empty board, not a broken one).
--   MoEngage    — its careers page links out to moengage.hire.trakstar.com.
--                 That listing page itself carries no schema.org markup, but
--                 its own job detail pages do (confirmed live), which is
--                 exactly the two-stage index→detail pattern the EXISTING
--                 generic `jsonld` fallback provider already implements.
--
-- No new adapter code is required for any of these three — Greenhouse,
-- Workable and the jsonld fallback are all already-supported providers. This
-- is a pure registry data correction.
--
-- Deliberately NOT touched by this migration (see the accompanying report):
-- the other 25 "moved" sources with a resolved_url are the expected
-- API-vs-marketing-URL split every Greenhouse/Lever/Ashby/SmartRecruiters
-- entry shows — not a real move, and for Lever/Ashby entries specifically,
-- copying the resolved (API-shaped) URL into careers_url would BREAK board
-- token detection. Bosch's real board (SmartRecruiters "BoschGroup") was also
-- investigated and deliberately left alone: it is a global 4,740-job board
-- with no India filter available, which does not fit the registry's
-- Indian-company-priority strategy.
--
-- Guarded by both id and the OLD careers_url, so this is idempotent and will
-- never silently overwrite an operator's own later edit to these rows.

UPDATE crawl_company_registry
SET
  careers_url = 'https://job-boards.greenhouse.io/razorpaysoftwareprivatelimited',
  notes = COALESCE(notes || ' | ', '')
    || 'URL corrected to the verified Greenhouse board (Module 10B.2.5, source-coverage recovery).',
  -- The URL changed identity, so the stale verification evidence for the OLD
  -- URL no longer applies. Cleared rather than left to look re-verified.
  health_status = NULL,
  last_checked_at = NULL,
  detected_platform = NULL,
  resolved_url = NULL,
  postings_seen = NULL,
  error_reason = NULL,
  updated_at = now()
WHERE id = '2c64255b-cc79-431c-98e4-7f851e52c496'
  AND careers_url = 'https://razorpay.com/jobs/';

UPDATE crawl_company_registry
SET
  careers_url = 'https://apply.workable.com/innovaccer/',
  notes = COALESCE(notes || ' | ', '')
    || 'URL corrected to the verified Workable board (Module 10B.2.5, source-coverage recovery).',
  health_status = NULL,
  last_checked_at = NULL,
  detected_platform = NULL,
  resolved_url = NULL,
  postings_seen = NULL,
  error_reason = NULL,
  updated_at = now()
WHERE id = 'db84506d-c797-4aba-80b5-413aa2e930f2'
  AND careers_url = 'https://innovaccer.com/careers';

UPDATE crawl_company_registry
SET
  careers_url = 'https://moengage.hire.trakstar.com/',
  notes = COALESCE(notes || ' | ', '')
    || 'URL corrected to the real Trakstar Hire board, crawlable via the jsonld fallback (Module 10B.2.5, source-coverage recovery).',
  health_status = NULL,
  last_checked_at = NULL,
  detected_platform = NULL,
  resolved_url = NULL,
  postings_seen = NULL,
  error_reason = NULL,
  updated_at = now()
WHERE id = '9db69589-a856-4fd1-9178-5d498294eaad'
  AND careers_url = 'https://www.moengage.com/careers/';
