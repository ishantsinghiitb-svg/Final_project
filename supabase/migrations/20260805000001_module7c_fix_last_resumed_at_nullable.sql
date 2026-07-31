-- ── Module 7C fix: last_resumed_at must be nullable ──
--
-- The original migration (20260804000001) declared
-- mock_interview_sessions.last_resumed_at NOT NULL, but the design it
-- documents in its own comment contradicts that: "last_resumed_at is NULL
-- while paused/ended, so elapsed is always derivable as
-- elapsed_ms + (now - last_resumed_at) when active." Both
-- MockInterviewAIService.pauseMockInterview and endMockInterview explicitly
-- write `last_resumed_at: null` — a real, designed state, not an omission.
--
-- Caught live: pausing a mock interview session failed with
-- "null value in column \"last_resumed_at\" violates not-null constraint"
-- (Postgres error 23502) on every attempt, since the column's own schema
-- rejected the write the application is supposed to make.

ALTER TABLE mock_interview_sessions ALTER COLUMN last_resumed_at DROP NOT NULL;
