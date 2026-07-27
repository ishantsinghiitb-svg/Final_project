-- ── Module 6E: AI Quality Pass ──
--
-- Purely additive. Two changes, both idempotent / safe to re-run.
--
--   1. Backfill the free AI credit allowance from the old 3 to the new 5 for
--      EXISTING users. New users already receive 5 (the app config default +
--      VITE_AI_FREE_CREDITS=5 seed the usage row on first use). Existing rows,
--      seeded when the free allowance was 3, would otherwise keep 3 forever
--      because ensure_ai_usage only sets credits_total on INSERT.
--
--   2. `resume_versions.optimization` (jsonb) — the full, permanent record of
--      what the optimizer proposed for a saved version: every accepted AND
--      rejected change (original text, suggested text, reason, type, benefit),
--      the career category, and a timestamp. This is what lets a user reopen an
--      optimized version months later and review exactly what the AI changed.
--      Nullable, so every existing version row (and any non-optimizer version)
--      stays valid untouched.

-- ════════════════════════════════════════════════════════════════════════
-- 1. Credit backfill (idempotent: SET to an absolute 5, gated to free plan
--    rows still below the new baseline — re-running is a no-op)
-- ════════════════════════════════════════════════════════════════════════
UPDATE user_ai_usage
  SET credits_total = 5
  WHERE plan = 'free'
    AND credits_total < 5;

-- ════════════════════════════════════════════════════════════════════════
-- 2. resume_versions.optimization — durable optimizer change history
-- ════════════════════════════════════════════════════════════════════════
ALTER TABLE resume_versions
  ADD COLUMN IF NOT EXISTS optimization jsonb;
