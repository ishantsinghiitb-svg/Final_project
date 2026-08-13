-- ── Module 11C-1: registry identity correction ──
--
-- THREE data changes to `crawl_company_registry`, all of the same kind. No
-- schema change, no function change, no adapter change, no seed insert. Module
-- 10's crawler, deduplication, WWR relevance filtering, `last_seen_at`
-- lifecycle, the extension write path and every `companies`/`global_jobs` row
-- are untouched by this file — the company-side cleanup is a separate,
-- reviewable, dry-run-first data pass (scripts/module11c1Cleanup.ts), exactly
-- as Module 11A split its own migration from
-- scripts/backfillCompanyIdentity.ts.
--
-- ── What was wrong ──
--
-- Three registry rows point at real, live, HEALTHY boards that belong to a
-- DIFFERENT employer than the row is registered for. All three are the Module
-- 11B failure mode reaching production: an ATS slug was guessed from the
-- company name, `verifySource` correctly answered "yes, a board is here with
-- live postings", and nothing ever asked whether the board belonged to the
-- company that was asked about. 11B built `evaluateBoardIdentity` precisely for
-- this and measured a ~40% false-positive rate for slug guessing; all three
-- rows predate the guard.
--
--   1. ('Porter', 'https://jobs.lever.co/porter') — seeded in 20260815000001
--      for the Bengaluru intra-city logistics company (porter.in). The board
--      serves a US healthcare staffing company: 28 clinical postings ("Nurse
--      Practitioner (Sandusky, OH)", "Travel Nurse Practitioner (New Jersey)")
--      across Pompano Beach FL, New Jersey, Michigan, Massachusetts and
--      Maryland. Not one is the Indian company's.
--
--   2. ('Zomato', 'https://jobs.lever.co/eternal') — the slug was guessed from
--      Zomato's REAL legal rename to Eternal Ltd, and landed on an unrelated US
--      athletic-performance company that is also named Eternal. Its 4 postings
--      are "Performance Technician / Performance Team - Open Interest" in San
--      Francisco and New York, describing "the athletes we serve". The stored
--      posting text contains ZERO occurrences of "zomato", "eternal" or
--      "zomato.com" — measured, not assumed.
--
--   3. ('Fi Money', 'https://jobs.lever.co/epifi') — `epifi` is Fi Money's real
--      legal name, so this slug was not even a bad guess; the TENANT is stale.
--      All 11 postings are TETRIZ, an AI engineering-intelligence platform,
--      each carrying an explicit "About Tetriz" self-description and no mention
--      of Fi, Epifi or fi.money anywhere.
--
-- Rows 2 and 3 were found while verifying the Module 11C-1 curated-alias fix:
-- the alias work was correct, but it revealed that these two boards fail
-- identity for a reason no alias can repair — they are other companies.
--
-- ── Why disabled rather than re-pointed or deleted ──
--
--   • Re-pointing is not possible: no board for the Indian Porter, for Zomato
--     or for Fi Money was ever found, and inventing a URL is the exact
--     behaviour that caused this.
--   • Deleting the rows would lose the record that these companies were
--     evaluated, and a future discovery sweep would re-guess the same slugs and
--     re-register the same wrong boards.
--   • Disabling stops the wrong companies being crawled while preserving the
--     finding, and `error_reason` now states the real problem so no operator
--     re-enables one without reading why.
--
-- Every already-captured posting (28 + 4 + 11 = 43) is PRESERVED. They are
-- genuine postings by real employers; the accompanying data pass re-attributes
-- them to their own `companies` rows (see server/company/homonyms.ts) and
-- corrects the employer name carried on the posting itself, so they stop being
-- presented as Porter/Zomato/Fi Money. Nothing is deleted: `source_job_id`,
-- `url`, `source_url`, `last_seen_at` and every `job_sources` row are left
-- exactly as they are. Once these sources stop being crawled the postings age
-- out through the ordinary 30-day `last_seen_at` lifecycle — no special
-- handling, and no failed crawl can wipe them early.
--
-- ── health_status ──
--
-- The registry's standing invariant is health_status IN ('HEALTHY','REDIRECTED')
-- ⟺ enabled (see 20260815000001), so disabling requires moving off 'HEALTHY'.
-- 'UNKNOWN' is used rather than 'BROKEN'/'UNAVAILABLE': the board is neither
-- broken nor unavailable — it is perfectly healthy and simply belongs to
-- someone else. No new status value is introduced, because adding one would be
-- a schema change and the invariant only needs a non-enabled state here.

UPDATE crawl_company_registry
SET
  enabled = false,
  health_status = 'UNKNOWN',
  error_reason =
    'Board identity failure: jobs.lever.co/porter belongs to a US healthcare staffing company, not the Bengaluru logistics company (porter.in) this row was registered for.',
  notes =
    'Module 11C-1: DISABLED — wrong company. The lever slug was guessed from the name and the board verified as reachable, but its postings are US clinical roles (Nurse Practitioner; Pompano Beach FL, New Jersey, Michigan). No board for porter.in has been found. Do NOT re-enable without confirming board identity per crawl/verify/boardIdentity.ts.'
WHERE careers_url = 'https://jobs.lever.co/porter';

UPDATE crawl_company_registry
SET
  enabled = false,
  health_status = 'UNKNOWN',
  error_reason =
    'Board identity failure: jobs.lever.co/eternal belongs to a US athletic-performance company also named Eternal, not Zomato (whose legal rename to Eternal Ltd is what caused this slug to be guessed).',
  notes =
    'Module 11C-1: DISABLED — wrong company. Postings are "Performance Technician / Performance Team - Open Interest" in San Francisco and New York ("the athletes we serve"). The stored posting text contains zero occurrences of zomato, eternal or zomato.com. No board for zomato.com has been found. Do NOT re-enable without confirming board identity per crawl/verify/boardIdentity.ts.'
WHERE careers_url = 'https://jobs.lever.co/eternal';

UPDATE crawl_company_registry
SET
  enabled = false,
  health_status = 'UNKNOWN',
  error_reason =
    'Board identity failure: jobs.lever.co/epifi now serves Tetriz, an AI engineering-intelligence platform. The slug matches Fi Money''s real legal name (Epifi) but the tenant is stale.',
  notes =
    'Module 11C-1: DISABLED — wrong company. All 11 postings carry an explicit "About Tetriz" self-description and never mention Fi, Epifi or fi.money. The slug is correct for Fi Money''s legal entity, which is why this was not caught by name checks; the ATS tenant itself has changed hands. No current board for fi.money has been found. Do NOT re-enable without confirming board identity per crawl/verify/boardIdentity.ts.'
WHERE careers_url = 'https://jobs.lever.co/epifi';

-- Slice's row is deliberately LEFT ENABLED and unchanged in behaviour.
-- boards.greenhouse.io/slice is a correctly-registered, genuinely healthy board
-- for the US pizza-technology company that runs it. Nothing about the SOURCE
-- was wrong — the defect was on the company side, where that employer shared a
-- single `companies` row with the unrelated Bengaluru fintech of the same name.
-- The note records the collision so an operator reading this row knows the
-- name is ambiguous and which employer this board actually is.
UPDATE crawl_company_registry
SET
  notes = COALESCE(notes, '') ||
    ' Module 11C-1: name collision — this board is the US pizza-technology company (slice.careers). The Bengaluru fintech (sliceit.com) is a different employer and is not crawled from here; the two are kept apart by server/company/homonyms.ts.'
WHERE careers_url = 'https://boards.greenhouse.io/slice'
  AND COALESCE(notes, '') NOT LIKE '%Module 11C-1%';
