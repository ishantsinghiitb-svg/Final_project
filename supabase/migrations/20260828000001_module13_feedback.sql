-- ── Module 13 · Phase 3: Feedback ──
--
-- PROBLEM: there is no way for a user to submit product feedback, report a
-- problem, or suggest an improvement from inside the app. The only existing
-- "contact" mechanism (src/content/contact.ts) opens a prefilled Gmail
-- compose draft — deliberately kept mailto-based rather than a fake form
-- with no backend (see that file's own comment history) — but it requires
-- leaving the app, assumes the user has/uses Gmail, and nothing is ever
-- recorded anywhere the founder can review later.
--
-- FIX: the smallest real, persisted feedback path — a single table the
-- founder reads directly via the Supabase dashboard (no admin UI is being
-- built here; Module 13's Admin phase is explicitly out of scope for this
-- task). Mirrors the existing RLS convention exactly: a user can insert and
-- read their own rows, nothing else — this is a write-mostly mailbox, not a
-- feature with an update/delete flow.

CREATE TABLE IF NOT EXISTS feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category text NOT NULL DEFAULT 'other',
  message text NOT NULL,
  -- Which dashboard page the user was on when they opened the form — helps
  -- triage without asking a follow-up question. Client-supplied, informational
  -- only; never used for access control.
  page_path text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT feedback_category_check CHECK (category IN ('bug', 'idea', 'other')),
  CONSTRAINT feedback_message_length CHECK (char_length(message) BETWEEN 1 AND 4000)
);

ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "feedback_select_own" ON feedback;
CREATE POLICY "feedback_select_own" ON feedback FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "feedback_insert_own" ON feedback;
CREATE POLICY "feedback_insert_own" ON feedback FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_feedback_user_id ON feedback (user_id);
CREATE INDEX IF NOT EXISTS idx_feedback_created_at ON feedback (created_at DESC);
