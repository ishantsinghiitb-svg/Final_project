-- ── Module 13 · Phase 2 (B1): Cap free AI actions within a paid session ──
--
-- PROBLEM: `cover_letters.ai_session_id` / `interview_preps.ai_session_id`
-- are the server-authoritative markers of "this document has an active,
-- paid-for session" — but they only ever proved a credit had been charged
-- ONCE (opening/rotating the session). Every "free" action performed while
-- the session is active (rewrite a section, change tone/length, explain,
-- regenerate an answer, ...) was checked ONLY for "does a session exist",
-- never counted. A session never expires, so once opened, an authenticated
-- user could script an unbounded number of real provider calls against that
-- one paid session for free.
--
-- FIX: a per-document counter, reset whenever a session opens/rotates
-- (a fresh charge resets the budget), incremented before each free
-- provider call, and checked against a fixed ceiling before that call is
-- made (see CoverLetterAIService.requireActiveSession /
-- InterviewPrepAIService.requireActiveSession). Cache hits — which cost
-- nothing — do not count against the budget.

ALTER TABLE cover_letters ADD COLUMN IF NOT EXISTS ai_action_count integer NOT NULL DEFAULT 0;
ALTER TABLE interview_preps ADD COLUMN IF NOT EXISTS ai_action_count integer NOT NULL DEFAULT 0;
