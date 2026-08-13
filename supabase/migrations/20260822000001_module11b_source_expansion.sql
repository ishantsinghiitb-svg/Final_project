-- ── Module 11B: verified source expansion + registry state correction ──
--
-- Two independent, purely-data changes to `crawl_company_registry`. No schema
-- change, no function change, no adapter change. Module 10's crawler,
-- deduplication, WWR relevance filtering, `last_seen_at` lifecycle and the
-- extension write path are all untouched.
--
--   PART A — register 14 new sources, every one of them identity-confirmed.
--   PART B — correct 18 rows whose stored state contradicted itself.
--
-- ── PART A: why these 14, and only these 14 ──
--
-- The Module 11B investigation probed 155 candidate Indian companies against
-- the six SUPPORTED ATS providers and got 22 board hits. It then fetched each
-- board and read its actual contents. Nine of the 22 turned out to belong to a
-- completely different company — a ~40% false-positive rate from slug guessing
-- alone (boards.greenhouse.io/pine is a Canadian real-estate agency; a
-- Recruitee DEMO tenant answers on google.recruitee.com; and so on).
--
-- The 14 below are the survivors: each board was read and confirmed to be the
-- intended employer, with the posting counts and India evidence recorded in
-- `notes`. Their URLs are the EXACT board URLs that were verified — no slug
-- was re-guessed while writing this migration, because re-guessing is the
-- thing that produced the false positives in the first place.
--
-- All 14 run on already-supported providers (Greenhouse / Lever / Ashby /
-- SmartRecruiters / Workable). No new adapter is introduced, and none is
-- needed. `platform` is 'career-pages' for every row — that is the adapter
-- tag; the specific ATS is recorded in `detected_platform`.
--
-- health_status is seeded to 'HEALTHY' with the observed `postings_seen`
-- because each board WAS live-verified through the production `verifySource`
-- during the investigation. The operator's "Check all sources" sweep will
-- re-derive this independently, exactly as it does for every other row.
--
-- ── PART B: the 18 enabled-but-uncrawlable rows ──
--
-- These are custom careers pages that once verified HEALTHY and have since
-- degraded to UNKNOWN: the page still loads and still shows job LINKS, but no
-- sampled posting carries parseable JobPosting data any more, so the crawler
-- cannot extract anything. `crawlEligibility()` already refuses them — they
-- are not, and never were, silently crawled.
--
-- What was wrong is the STORED EXPLANATION, not the behaviour. Each row still
-- carried its original success note ("Custom careers page. Verified: N
-- posting(s) visible.") from when it last worked, directly contradicting its
-- own current `error_reason`. An operator reading the panel saw an enabled
-- source with a reassuring note and no indication that nothing could crawl it.
--
-- These rows are deliberately LEFT ENABLED and NOT deleted:
--   • `enabled` records operator intent ("we want this company"), which is
--     still true and worth preserving.
--   • The health gate is what governs crawling, and it is already correct.
--   • Flipping them to disabled would discard that intent and make a future
--     re-verification sweep skip them entirely.
-- Instead the note is corrected to state the real situation, and the admin
-- summary now reports `enabledNotReady` separately so "enabled" can never
-- again be misread as "crawl-ready" (see registrySummary.ts).
--
-- No new adapter is built for them, no URL is re-pointed, and no attempt is
-- made to make them crawlable — all explicitly out of scope for this phase.

-- ── PART A: the 14 verified sources ──
--
-- ON CONFLICT DO NOTHING against the existing (lower(company_name), platform)
-- unique index makes this idempotent and non-destructive: re-running changes
-- nothing, and an operator's own later edit to one of these rows is never
-- overwritten.

INSERT INTO crawl_company_registry (
  company_name, careers_url, platform, enabled, crawl_frequency_hours,
  parent_company, aliases,
  health_status, detected_platform, http_status, postings_seen, error_reason, notes
) VALUES
  ('Apna', 'https://apply.workable.com/apna/', 'career-pages', true, 24, NULL, NULL,
   'HEALTHY', 'workable', 200, 135, NULL,
   'Workable board. Module 11B: identity-confirmed (apna.co, Bengaluru). Verified: 135 posting(s).'),

  ('DeepSource', 'https://apply.workable.com/deepsource/', 'career-pages', true, 24, NULL, NULL,
   'HEALTHY', 'workable', 200, 108, NULL,
   'Workable board. Module 11B: identity-confirmed (Indian-origin, Bengaluru). Verified: 108 posting(s).'),

  ('Tekion', 'https://jobs.ashbyhq.com/tekion', 'career-pages', true, 24, NULL, NULL,
   'HEALTHY', 'ashby', 200, 78, NULL,
   'Ashby board. Module 11B: identity-confirmed — board names "Bangalore HQ" and "Chennai Regional Office". Verified: 78 posting(s).'),

  ('Hevo Data', 'https://jobs.lever.co/hevodata', 'career-pages', true, 24, NULL, NULL,
   'HEALTHY', 'lever', 200, 39, NULL,
   'Lever board. Module 11B: identity-confirmed — Bengaluru/India locations throughout. Verified: 39 posting(s).'),

  ('Zenoti', 'https://boards.greenhouse.io/zenoti', 'career-pages', true, 24, NULL, NULL,
   'HEALTHY', 'greenhouse', 200, 37, NULL,
   'Greenhouse board. Module 11B: identity-confirmed — 61 Hyderabad references. Verified: 37 posting(s).'),

  ('Turing', 'https://boards.greenhouse.io/turing', 'career-pages', true, 24, NULL, NULL,
   'HEALTHY', 'greenhouse', 200, 23, NULL,
   'Greenhouse board. Module 11B: identity-confirmed — Bengaluru/Gurugram/Hyderabad roles. US-headquartered with genuine India hiring; included per the Module 11B product decision that the target is high-quality jobs available to Indian job seekers, not only India-headquartered employers. Verified: 23 posting(s).'),

  ('SigNoz', 'https://jobs.ashbyhq.com/signoz', 'career-pages', true, 24, NULL, NULL,
   'HEALTHY', 'ashby', 200, 16, NULL,
   'Ashby board. Module 11B: identity-confirmed — India-located roles. Verified: 16 posting(s).'),

  ('Bureau', 'https://jobs.ashbyhq.com/bureau', 'career-pages', true, 24, NULL, NULL,
   'HEALTHY', 'ashby', 200, 12, NULL,
   'Ashby board. Module 11B: identity-confirmed — Bangalore, fraud/risk product roles. Verified: 12 posting(s).'),

  ('ixigo', 'https://careers.smartrecruiters.com/ixigo', 'career-pages', true, 24, NULL, NULL,
   'HEALTHY', 'smartrecruiters', 200, 9, NULL,
   'SmartRecruiters board. Module 11B: identity-confirmed — Gurugram, company name present on postings. Verified: 9 posting(s).'),

  ('Atlan', 'https://jobs.ashbyhq.com/atlan', 'career-pages', true, 24, NULL, NULL,
   'HEALTHY', 'ashby', 200, 6, NULL,
   'Ashby board. Module 11B: identity-confirmed — India-located roles. Verified: 6 posting(s).'),

  ('Captain Fresh', 'https://careers.smartrecruiters.com/captainfresh', 'career-pages', true, 24, NULL, NULL,
   'HEALTHY', 'smartrecruiters', 200, 4, NULL,
   'SmartRecruiters board. Module 11B: identity-confirmed — Bengaluru, company name present on postings. Verified: 4 posting(s).'),

  -- The next three are genuine, identity-confirmed boards that simply had very
  -- few openings at verification time. Recorded honestly rather than inflated:
  -- a real board with one posting is a working source, not a broken one.
  ('Upstox', 'https://careers.smartrecruiters.com/upstox', 'career-pages', true, 24, NULL, NULL,
   'HEALTHY', 'smartrecruiters', 200, 1, NULL,
   'SmartRecruiters board. Module 11B: identity-confirmed — India (demat/broking roles). Verified: 1 posting at check time.'),

  ('Lendingkart', 'https://careers.smartrecruiters.com/lendingkart', 'career-pages', true, 24, NULL, NULL,
   'HEALTHY', 'smartrecruiters', 200, 1, NULL,
   'SmartRecruiters board. Module 11B: identity-confirmed — Bengaluru. Verified: 1 posting at check time.'),

  ('Turtlemint', 'https://careers.smartrecruiters.com/turtlemint', 'career-pages', true, 24, NULL, NULL,
   'HEALTHY', 'smartrecruiters', 200, 1, NULL,
   'SmartRecruiters board. Module 11B: identity-confirmed — Nellore/India. Verified: 1 posting at check time.')
ON CONFLICT (lower(company_name), platform) DO NOTHING;

-- ── PART B: correct the contradictory state on the 18 rows ──
--
-- Matched by CONDITION, not by hard-coded id: every row that is enabled, not
-- currently crawlable, and still carrying the stale "Verified: N posting(s)
-- visible." success note. Safe by construction — it cannot touch a healthy
-- source, a disabled source, or a row an operator has already re-noted by hand.
--
-- ⚠️ The `notes NOT LIKE 'Module 11B:%'` guard is what makes this IDEMPOTENT,
-- and it is load-bearing. The rewritten note deliberately keeps the old text
-- ("Previous note (kept for history): …"), so the stale "Verified: N
-- posting(s) visible." string SURVIVES inside it — without this guard a second
-- run would match the very rows it just fixed and prefix them again. Verified
-- against a throwaway Postgres: with the guard, the second run updates 0 rows.
--
-- Only `notes` and `updated_at` change. `enabled`, `health_status`,
-- `error_reason`, `careers_url` and every crawl-behaviour column are left
-- exactly as they are — the goal is an accurate explanation, not a behaviour
-- change.

UPDATE crawl_company_registry
SET
  notes =
    'Module 11B: ENABLED BUT NOT CRAWL-READY. The careers page still loads and still lists job links, '
    || 'but no sampled posting carries parseable JobPosting data, so the crawler cannot extract postings '
    || 'from it (see error_reason). Left enabled deliberately to preserve operator intent and keep the row '
    || 'in future re-verification sweeps; the health gate already prevents it from being crawled. '
    || 'No adapter work was attempted for this source in Module 11B. '
    || 'Previous note (kept for history): ' || COALESCE(notes, '(none)'),
  updated_at = now()
WHERE enabled = true
  AND (health_status IS NULL OR health_status NOT IN ('HEALTHY', 'REDIRECTED'))
  AND notes LIKE '%Verified:%posting(s) visible.%'
  AND notes NOT LIKE 'Module 11B:%';

-- The 4 aggregator sources (Internshala ×2, We Work Remotely ×2) are HEALTHY
-- and therefore excluded by the WHERE clause above — untouched, as required.
