-- ── Module 8A: Analytics Dashboard — Goal Targets ──
--
-- Extends the existing `profiles` table with three optional integer goal
-- targets rather than a new table, per the "no unnecessary settings surface"
-- mandate. NULL means "use the recommended default" — computed client-side
-- (see src/features/analytics/constants) so a future "reset to recommended"
-- action never has to know what the DB default was.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS goal_applications integer,
  ADD COLUMN IF NOT EXISTS goal_interviews   integer,
  ADD COLUMN IF NOT EXISTS goal_offers       integer;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_goal_applications_check') THEN
    ALTER TABLE profiles
      ADD CONSTRAINT profiles_goal_applications_check CHECK (goal_applications IS NULL OR goal_applications >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_goal_interviews_check') THEN
    ALTER TABLE profiles
      ADD CONSTRAINT profiles_goal_interviews_check CHECK (goal_interviews IS NULL OR goal_interviews >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_goal_offers_check') THEN
    ALTER TABLE profiles
      ADD CONSTRAINT profiles_goal_offers_check CHECK (goal_offers IS NULL OR goal_offers >= 0);
  END IF;
END $$;
