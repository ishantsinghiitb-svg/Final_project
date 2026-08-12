-- ── Module 10B.3 (part 2): scope fingerprint uniqueness to source_job_id-less rows ──
--
-- The 20260819000001 migration added a guard to admin_upsert_global_job so a
-- tier-2/3 (fingerprint / cross-platform) match is discarded when it would
-- merge two postings from the SAME source that carry their OWN distinct,
-- verified source_job_id — e.g. HighRadius's three separate Greenhouse reqs
-- (7701545003 / 7701540003 / 7697979003), each a genuinely different opening
-- that happens to share the "Implementation Consultant, Hyderabad" title.
--
-- The guard correctly stops the WRONG merge, which sends the posting down
-- the INSERT branch instead. But that branch still writes
-- `fingerprint = v_fingerprint` — the SAME hash of title|company|location as
-- the row it declined to merge into, because two genuinely different
-- concurrent openings for the same role/location necessarily hash to the
-- same fingerprint (fingerprint has never encoded anything else). The INSERT
-- was then rejected by a legacy constraint that predates the guard, the
-- dedup-tier system, and Module 10 entirely:
--
--   CREATE UNIQUE INDEX global_jobs_fingerprint_key
--     ON global_jobs (fingerprint) WHERE fingerprint IS NOT NULL;
--     (see 20260716000001_add_global_job_dedup_and_sync.sql)
--
-- That index assumed fingerprint was the ONLY identity a row could have, so
-- "one row per fingerprint" was a safe, simple backstop. It no longer is:
-- rows carrying a verified source_job_id already have a STRONGER, more
-- specific identity key (global_jobs_source_job_id_key, UNIQUE (source,
-- source_job_id)), so they no longer need the blunt fingerprint backstop —
-- and for those rows specifically, the backstop is now actively wrong: it
-- blocks the exact multi-row-per-fingerprint state the guard exists to
-- create.
--
-- The fix: narrow the WHERE clause so the fingerprint-uniqueness backstop
-- applies ONLY to rows with no source_job_id — the true "no better identity
-- available" fallback case the index was built for (an extension capture
-- from a source with no stable id, a WWR posting whose only identifier is
-- its slug-derived fingerprint, etc). This is a pure narrowing:
--   - It does not change what `fingerprint` means or how it is computed
--     anywhere (generateFingerprint / fingerprint.ts is untouched).
--   - It does not touch `global_jobs_source_job_id_key`, `upsert_global_job`
--     (the extension's separate write path — untouched), `find_cross_platform_match`
--     (Module 4A, untouched), or admin_upsert_global_job's function body
--     (the 20260819000001 guard already does everything the RPC needs; only
--     the constraint that was rejecting its INSERT changes here).
--   - It cannot regress any row that has no source_job_id: for those rows
--     the new predicate (`fingerprint IS NOT NULL AND source_job_id IS NULL`)
--     is identical in effect to the old one (`fingerprint IS NOT NULL`).
--   - It cannot make any previously-succeeding write start failing: this
--     only ever WIDENS what is insertable, never narrows it.
--   - It does not disable dedup: tier-1 (source, source_job_id) and tier-2/3
--     (fingerprint / cross-platform SELECT-based matching, unchanged) still
--     run first and still find/merge an existing row whenever one genuinely
--     matches; this index only governs what happens when nothing does.

DROP INDEX IF EXISTS global_jobs_fingerprint_key;

CREATE UNIQUE INDEX IF NOT EXISTS global_jobs_fingerprint_key
  ON global_jobs (fingerprint)
  WHERE fingerprint IS NOT NULL AND source_job_id IS NULL;
