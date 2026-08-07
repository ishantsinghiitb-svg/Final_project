-- ── Module 9B: Calendar Intelligence ──
--
-- Extends Module 9A's Gmail Intelligence to Google Calendar: one Google
-- OAuth connection per user now carries TWO independently-grantable scopes
-- (gmail.readonly, calendar.events.readonly) via incremental authorization,
-- and calendar events flow into the SAME reviewable-suggestion queue and the
-- SAME `interviews` table as Gmail — so an interview's email and its
-- calendar invite never produce two cards.
--
-- Every rename below is free: neither this migration's Module 8 predecessor
-- nor any of Module 9A's three migrations have ever been applied to a live
-- database, so nothing in production depends on today's names.
--
-- ── gmail_connections → google_connections ──
-- One connection row, two products. The old single `status`/`auto_sync_enabled`/
-- etc. columns implicitly meant "Gmail only" — split into gmail_*/calendar_*
-- pairs so the row is honestly shaped for what it now holds. identity/token
-- columns (google_email, scope, refresh_token_ciphertext/nonce, connected_at)
-- stay shared: one refresh token, incrementally scoped, covers both.
ALTER TABLE gmail_connections RENAME TO google_connections;

ALTER TABLE google_connections RENAME COLUMN status TO gmail_status;
ALTER TABLE google_connections RENAME COLUMN auto_sync_enabled TO gmail_auto_sync_enabled;
ALTER TABLE google_connections RENAME COLUMN last_synced_at TO gmail_last_synced_at;
ALTER TABLE google_connections RENAME COLUMN last_sync_error TO gmail_last_sync_error;
ALTER TABLE google_connections RENAME COLUMN next_sync_at TO gmail_next_sync_at;
ALTER TABLE google_connections RENAME COLUMN sync_lock_acquired_at TO gmail_sync_lock_acquired_at;
ALTER TABLE google_connections RENAME COLUMN history_id TO gmail_history_id;
ALTER TABLE google_connections RENAME COLUMN backfill_complete TO gmail_backfill_complete;
ALTER TABLE google_connections RENAME COLUMN backfill_page_token TO gmail_backfill_page_token;

ALTER TABLE google_connections
  ADD COLUMN IF NOT EXISTS calendar_status text NOT NULL DEFAULT 'disconnected',
  ADD COLUMN IF NOT EXISTS calendar_auto_sync_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS calendar_last_synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS calendar_last_sync_error text,
  ADD COLUMN IF NOT EXISTS calendar_next_sync_at timestamptz,
  ADD COLUMN IF NOT EXISTS calendar_sync_lock_acquired_at timestamptz;

ALTER TABLE google_connections DROP CONSTRAINT IF EXISTS gmail_connections_status_check;
ALTER TABLE google_connections DROP CONSTRAINT IF EXISTS google_connections_gmail_status_check;
ALTER TABLE google_connections
  ADD CONSTRAINT google_connections_gmail_status_check
  CHECK (gmail_status IN ('connected', 'syncing', 'disconnected', 'error', 'needs_reauth'));

ALTER TABLE google_connections DROP CONSTRAINT IF EXISTS google_connections_calendar_status_check;
ALTER TABLE google_connections
  ADD CONSTRAINT google_connections_calendar_status_check
  CHECK (calendar_status IN ('connected', 'syncing', 'disconnected', 'error', 'needs_reauth'));

-- Renamed policies/trigger follow the table rename automatically in Postgres
-- (they stay attached, just still named with the old table's naming — cosmetic
-- only). Re-declare them under the new naming for clarity and so future
-- `DROP POLICY IF EXISTS` guards in this repo's convention match this table.
DROP POLICY IF EXISTS "gmail_connections_select_own" ON google_connections;
DROP POLICY IF EXISTS "google_connections_select_own" ON google_connections;
CREATE POLICY "google_connections_select_own" ON google_connections FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "gmail_connections_update_own" ON google_connections;
DROP POLICY IF EXISTS "google_connections_update_own" ON google_connections;
CREATE POLICY "google_connections_update_own" ON google_connections FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP TRIGGER IF EXISTS gmail_connections_set_updated_at ON google_connections;
DROP TRIGGER IF EXISTS google_connections_set_updated_at ON google_connections;
CREATE TRIGGER google_connections_set_updated_at BEFORE UPDATE ON google_connections
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── calendar_sync_state ──
-- Per-Google-calendar sync checkpoint, kept off the connection row so a
-- future multi-calendar picker is a UI-only change, not a migration. V1
-- syncs exactly one row per user: google_calendar_id = 'primary'.
CREATE TABLE IF NOT EXISTS calendar_sync_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  google_calendar_id text NOT NULL DEFAULT 'primary',
  sync_token text,
  page_token text,
  window_start timestamptz,
  window_end timestamptz,
  backfill_complete boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, google_calendar_id)
);

ALTER TABLE calendar_sync_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "calendar_sync_state_select_own" ON calendar_sync_state;
CREATE POLICY "calendar_sync_state_select_own" ON calendar_sync_state FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "calendar_sync_state_insert_own" ON calendar_sync_state;
CREATE POLICY "calendar_sync_state_insert_own" ON calendar_sync_state FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "calendar_sync_state_update_own" ON calendar_sync_state;
CREATE POLICY "calendar_sync_state_update_own" ON calendar_sync_state FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "calendar_sync_state_delete_own" ON calendar_sync_state;
CREATE POLICY "calendar_sync_state_delete_own" ON calendar_sync_state FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS calendar_sync_state_set_updated_at ON calendar_sync_state;
CREATE TRIGGER calendar_sync_state_set_updated_at BEFORE UPDATE ON calendar_sync_state
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── calendar_events ──
-- Candidate ledger, mirrors gmail_messages: dedup + audit trail. Only events
-- that pass the relevance gate (Tier 1-3) are ever written here — an
-- irrelevant event on the user's calendar never touches this table at all.
CREATE TABLE IF NOT EXISTS calendar_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  google_calendar_id text NOT NULL DEFAULT 'primary',
  google_event_id text NOT NULL,
  ical_uid text,
  recurring_event_id text,
  title text,
  description_snippet text,
  location text,
  meeting_link text,
  organizer_email text,
  organizer_name text,
  attendee_emails jsonb NOT NULL DEFAULT '[]'::jsonb,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz,
  is_all_day boolean NOT NULL DEFAULT false,
  event_timezone text,
  google_status text NOT NULL DEFAULT 'confirmed'
    CHECK (google_status IN ('confirmed', 'tentative', 'cancelled')),
  self_response_status text
    CHECK (self_response_status IS NULL OR self_response_status IN ('needsAction', 'declined', 'tentative', 'accepted')),
  etag text,
  google_updated_at timestamptz,
  relevance_tier text NOT NULL CHECK (relevance_tier IN ('tier_1', 'tier_2', 'tier_3')),
  confidence real NOT NULL DEFAULT 0,
  classified_by text NOT NULL CHECK (classified_by IN ('rule', 'ai')),
  matched_application_id uuid REFERENCES applications(id) ON DELETE SET NULL,
  matched_interview_id uuid REFERENCES interviews(id) ON DELETE SET NULL,
  -- Dismiss/delete tombstone (mirrors the re-suggestion guard) — set when the
  -- user dismisses the resulting suggestion, or deletes the interview it
  -- produced. Survives a post-410 full resync since only the sync TOKEN
  -- resets, never this row.
  ignored_at timestamptz,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, google_calendar_id, google_event_id)
);

ALTER TABLE calendar_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "calendar_events_select_own" ON calendar_events;
CREATE POLICY "calendar_events_select_own" ON calendar_events FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "calendar_events_insert_own" ON calendar_events;
CREATE POLICY "calendar_events_insert_own" ON calendar_events FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "calendar_events_update_own" ON calendar_events;
CREATE POLICY "calendar_events_update_own" ON calendar_events FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Needed by the Calendar disconnect flow (Module 9B plan §6), which deletes
-- this user's own calendar_events rows through their normal RLS-scoped
-- client — unlike Gmail, Calendar disconnect really does remove data.
DROP POLICY IF EXISTS "calendar_events_delete_own" ON calendar_events;
CREATE POLICY "calendar_events_delete_own" ON calendar_events FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS calendar_events_set_updated_at ON calendar_events;
CREATE TRIGGER calendar_events_set_updated_at BEFORE UPDATE ON calendar_events
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS idx_calendar_events_user_starts_at ON calendar_events (user_id, starts_at);
CREATE INDEX IF NOT EXISTS idx_calendar_events_user_ical_uid ON calendar_events (user_id, ical_uid);
CREATE INDEX IF NOT EXISTS idx_calendar_events_user_status ON calendar_events (user_id, google_status);
CREATE INDEX IF NOT EXISTS idx_calendar_events_matched_application ON calendar_events (matched_application_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_matched_interview ON calendar_events (matched_interview_id);

-- ── gmail_suggestions → suggestions ──
-- Generalized to carry either a Gmail message or a calendar event (or both,
-- when the two sources corroborate the same interview — see
-- attachCorroboration in SuggestionRepository). No stored `source` column:
-- it's derived at read time from which FK is present, so it can never drift
-- from the data it describes.
ALTER TABLE gmail_suggestions RENAME TO suggestions;

ALTER TABLE suggestions ALTER COLUMN gmail_message_id DROP NOT NULL;
ALTER TABLE suggestions ADD COLUMN IF NOT EXISTS calendar_event_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'suggestions_calendar_event_id_fkey'
  ) THEN
    ALTER TABLE suggestions
      ADD CONSTRAINT suggestions_calendar_event_id_fkey
      FOREIGN KEY (calendar_event_id) REFERENCES calendar_events(id) ON DELETE SET NULL;
  END IF;
END $$;

ALTER TABLE suggestions DROP CONSTRAINT IF EXISTS suggestions_has_source_check;
ALTER TABLE suggestions
  ADD CONSTRAINT suggestions_has_source_check
  CHECK (gmail_message_id IS NOT NULL OR calendar_event_id IS NOT NULL);

DROP POLICY IF EXISTS "gmail_suggestions_select_own" ON suggestions;
DROP POLICY IF EXISTS "suggestions_select_own" ON suggestions;
CREATE POLICY "suggestions_select_own" ON suggestions FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "gmail_suggestions_update_own" ON suggestions;
DROP POLICY IF EXISTS "suggestions_update_own" ON suggestions;
CREATE POLICY "suggestions_update_own" ON suggestions FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "gmail_suggestions_insert_own" ON suggestions;
DROP POLICY IF EXISTS "suggestions_insert_own" ON suggestions;
CREATE POLICY "suggestions_insert_own" ON suggestions FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

-- New: needed so Calendar disconnect can delete this user's own PENDING
-- calendar-sourced suggestions (only) through the normal RLS-scoped client,
-- without a second service-role usage site. Every other table in this app
-- already has full CRUDL owner policies; this table simply never needed
-- delete until now (accept/dismiss are status updates, not deletes).
DROP POLICY IF EXISTS "suggestions_delete_own" ON suggestions;
CREATE POLICY "suggestions_delete_own" ON suggestions FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS gmail_suggestions_set_updated_at ON suggestions;
DROP TRIGGER IF EXISTS suggestions_set_updated_at ON suggestions;
CREATE TRIGGER suggestions_set_updated_at BEFORE UPDATE ON suggestions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS idx_suggestions_calendar_event ON suggestions (calendar_event_id);
-- idx_gmail_suggestions_user_status / _message / _target_application already
-- exist from 20260808000001 and follow the table rename automatically.

-- ── interviews: calendar linkage, source, lock, sync timestamp ──
ALTER TABLE interviews
  ADD COLUMN IF NOT EXISTS calendar_event_id uuid,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS calendar_fields_locked boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_calendar_sync_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'interviews_calendar_event_id_fkey'
  ) THEN
    ALTER TABLE interviews
      ADD CONSTRAINT interviews_calendar_event_id_fkey
      FOREIGN KEY (calendar_event_id) REFERENCES calendar_events(id) ON DELETE SET NULL;
  END IF;
END $$;

ALTER TABLE interviews DROP CONSTRAINT IF EXISTS interviews_source_check;
ALTER TABLE interviews
  ADD CONSTRAINT interviews_source_check
  CHECK (source IN ('manual', 'gmail', 'calendar', 'both'));

CREATE INDEX IF NOT EXISTS idx_interviews_calendar_event_id ON interviews (calendar_event_id);

-- Backfill: rows created via Module 9A's create_interview suggestions already
-- carry source_gmail_suggestion_id — mark them 'gmail' now that 'manual' is
-- the new blanket default (this migration ships alongside 9A on the same
-- never-yet-live DB, so this UPDATE is a no-op today; kept for correctness
-- if a future non-production environment applies both together).
UPDATE interviews SET source = 'gmail'
  WHERE source_gmail_suggestion_id IS NOT NULL AND source = 'manual';

-- ── source_gmail_suggestion_id → source_suggestion_id ──
-- Same FK target (suggestions, née gmail_suggestions), now source-agnostic:
-- a suggestion it points to may equally be Gmail- or Calendar-derived.
ALTER TABLE applications RENAME COLUMN source_gmail_suggestion_id TO source_suggestion_id;
ALTER TABLE interviews RENAME COLUMN source_gmail_suggestion_id TO source_suggestion_id;
ALTER TABLE application_reminders RENAME COLUMN source_gmail_suggestion_id TO source_suggestion_id;
ALTER TABLE application_attachments RENAME COLUMN source_gmail_suggestion_id TO source_suggestion_id;
-- Indexes on these columns (idx_applications_source_gmail_suggestion, etc.
-- from 20260808000001) stay attached across a column rename; re-declared
-- under the new name for clarity and future guard-consistency.
DROP INDEX IF EXISTS idx_applications_source_gmail_suggestion;
CREATE INDEX IF NOT EXISTS idx_applications_source_suggestion ON applications (source_suggestion_id);
DROP INDEX IF EXISTS idx_interviews_source_gmail_suggestion;
CREATE INDEX IF NOT EXISTS idx_interviews_source_suggestion ON interviews (source_suggestion_id);
DROP INDEX IF EXISTS idx_application_reminders_source_gmail_suggestion;
CREATE INDEX IF NOT EXISTS idx_application_reminders_source_suggestion ON application_reminders (source_suggestion_id);
DROP INDEX IF EXISTS idx_application_attachments_source_gmail_suggestion;
CREATE INDEX IF NOT EXISTS idx_application_attachments_source_suggestion ON application_attachments (source_suggestion_id);

-- ── gmail_messages.ical_uid ──
-- The strongest merge key between an interview email and its calendar event:
-- the same UID appears in both. Module 9A's sync starts extracting this from
-- a message's .ics attachment (when present) for interview-category
-- messages only — see src/server/gmail/IcsParser.ts.
ALTER TABLE gmail_messages ADD COLUMN IF NOT EXISTS ical_uid text;
CREATE INDEX IF NOT EXISTS idx_gmail_messages_user_ical_uid ON gmail_messages (user_id, ical_uid);

-- ── application_reminders: allow a reminder to hang off an interview directly ──
-- Unlocks reminders for standalone (non-application-linked) calendar
-- interviews, which application_reminders' original NOT NULL application_id
-- made impossible. type='interview' is already a valid value in the
-- existing CHECK — no change needed there.
ALTER TABLE application_reminders ALTER COLUMN application_id DROP NOT NULL;
ALTER TABLE application_reminders ADD COLUMN IF NOT EXISTS interview_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'application_reminders_interview_id_fkey'
  ) THEN
    ALTER TABLE application_reminders
      ADD CONSTRAINT application_reminders_interview_id_fkey
      FOREIGN KEY (interview_id) REFERENCES interviews(id) ON DELETE CASCADE;
  END IF;
END $$;

ALTER TABLE application_reminders DROP CONSTRAINT IF EXISTS application_reminders_has_target_check;
ALTER TABLE application_reminders
  ADD CONSTRAINT application_reminders_has_target_check
  CHECK (application_id IS NOT NULL OR interview_id IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_application_reminders_interview_id ON application_reminders (interview_id);
