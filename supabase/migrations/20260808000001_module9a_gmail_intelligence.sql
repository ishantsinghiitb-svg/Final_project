-- ── Module 9A: Gmail Intelligence ──
--
-- Three new tables, each owning a distinct concern:
--   - gmail_connections : one row per user, the OAuth/sync connection state.
--     Holds the ENCRYPTED refresh token (see src/server/gmail/TokenCrypto.ts —
--     application-layer AES-256-GCM; this Supabase project has no pgsodium/
--     pgcrypto/Vault extension enabled). Client code must never select
--     refresh_token_ciphertext/refresh_token_nonce — enforced by repository
--     column allow-listing, not column-level RLS (this schema doesn't use
--     column-level security anywhere).
--   - gmail_messages    : append-only dedup ledger of processed Gmail
--     messages. UNIQUE(user_id, gmail_message_id) is the hard duplicate-
--     prevention guarantee — a message is ever processed exactly once.
--     Deliberately no full-body column, only Gmail's own pre-truncated
--     snippet, to minimize stored PII.
--   - gmail_suggestions : the reviewable action queue, 1:N off of
--     gmail_messages (one email can justify more than one suggestion).
--     Five action-oriented types only — nothing here is ever silently
--     applied; accepting a suggestion always goes through the *existing*
--     ApplicationService/InterviewService/ReminderService/AttachmentService.
--
-- GmailSyncService runs inside an authenticated request (triggered on
-- connect/app-open/manual sync — see the plan's Sync Triggers section) and
-- writes gmail_messages/gmail_suggestions through the caller's own
-- RLS-scoped client, same as every other write path in this app — hence the
-- owner insert-own policies below on both tables. The ONE genuine exception
-- is the OAuth callback (src/routes/auth.gmail.callback.ts), which has no
-- ambient session at all (a bare GET redirect from Google) and so upserts
-- gmail_connections via the service-role client instead.

-- ── gmail_connections ──
CREATE TABLE IF NOT EXISTS gmail_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  google_email text NOT NULL,
  scope text NOT NULL,
  refresh_token_ciphertext text NOT NULL,
  refresh_token_nonce text NOT NULL,
  -- history_id is the target checkpoint captured at connect time. Until the
  -- bounded initial backfill (buildSyncQuery, paginated) fully completes,
  -- backfill_complete stays false and backfill_page_token tracks where
  -- pagination left off across separate sync-triggered runs; only once
  -- backfill_complete flips true does GmailSyncService switch from
  -- messages.list (query-bounded) to history.list(startHistoryId=history_id)
  -- (cheap, incremental) for every later sync.
  history_id text,
  backfill_complete boolean NOT NULL DEFAULT false,
  backfill_page_token text,
  status text NOT NULL DEFAULT 'connected'
    CHECK (status IN ('connected', 'syncing', 'disconnected', 'error', 'needs_reauth')),
  auto_sync_enabled boolean NOT NULL DEFAULT true,
  last_synced_at timestamptz,
  last_sync_error text,
  next_sync_at timestamptz,
  sync_lock_acquired_at timestamptz,
  connected_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE gmail_connections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "gmail_connections_select_own" ON gmail_connections;
CREATE POLICY "gmail_connections_select_own" ON gmail_connections FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

-- Settings toggles, disconnect, and every sync run's status/checkpoint
-- updates all go through this policy via the caller's normal RLS-scoped
-- client. Only the initial connect (upsert, via service-role) bypasses it —
-- see the header comment above.
DROP POLICY IF EXISTS "gmail_connections_update_own" ON gmail_connections;
CREATE POLICY "gmail_connections_update_own" ON gmail_connections FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP TRIGGER IF EXISTS gmail_connections_set_updated_at ON gmail_connections;
CREATE TRIGGER gmail_connections_set_updated_at BEFORE UPDATE ON gmail_connections
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── gmail_messages ──
CREATE TABLE IF NOT EXISTS gmail_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  gmail_message_id text NOT NULL,
  gmail_thread_id text NOT NULL,
  from_address text NOT NULL,
  from_domain text NOT NULL,
  subject text,
  snippet text,
  company_name text,
  internal_date timestamptz NOT NULL,
  category text NOT NULL DEFAULT 'unknown'
    CHECK (category IN (
      'application_confirmation', 'recruiter_reply', 'interview_invitation',
      'online_assessment', 'assignment', 'follow_up_required', 'offer',
      'rejection', 'application_update', 'unknown'
    )),
  confidence real NOT NULL DEFAULT 0,
  classified_by text NOT NULL CHECK (classified_by IN ('rule', 'ai')),
  matched_application_id uuid REFERENCES applications(id) ON DELETE SET NULL,
  processed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, gmail_message_id)
);

ALTER TABLE gmail_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "gmail_messages_select_own" ON gmail_messages;
CREATE POLICY "gmail_messages_select_own" ON gmail_messages FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

-- Written only by GmailSyncService, but through the caller's own RLS-scoped
-- client (see the header comment) — hence a real insert-own policy, not a
-- service-role-only path. No update/delete policy: messages are an
-- append-only ledger once processed.
DROP POLICY IF EXISTS "gmail_messages_insert_own" ON gmail_messages;
CREATE POLICY "gmail_messages_insert_own" ON gmail_messages FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_gmail_messages_user_thread ON gmail_messages (user_id, gmail_thread_id);
CREATE INDEX IF NOT EXISTS idx_gmail_messages_user_domain ON gmail_messages (user_id, from_domain);
CREATE INDEX IF NOT EXISTS idx_gmail_messages_user_company ON gmail_messages (user_id, company_name);
CREATE INDEX IF NOT EXISTS idx_gmail_messages_matched_application ON gmail_messages (matched_application_id);

-- ── gmail_suggestions ──
CREATE TABLE IF NOT EXISTS gmail_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  gmail_message_id uuid NOT NULL REFERENCES gmail_messages(id) ON DELETE CASCADE,
  type text NOT NULL
    CHECK (type IN (
      'create_application', 'update_application', 'create_interview',
      'add_reminder', 'import_attachment'
    )),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'dismissed', 'expired', 'superseded')),
  confidence real NOT NULL DEFAULT 0,
  explanation text NOT NULL,
  target_application_id uuid REFERENCES applications(id) ON DELETE CASCADE,
  suggested_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  resolved_at timestamptz,
  resolved_action text CHECK (resolved_action IS NULL OR resolved_action IN ('accepted', 'dismissed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE gmail_suggestions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "gmail_suggestions_select_own" ON gmail_suggestions;
CREATE POLICY "gmail_suggestions_select_own" ON gmail_suggestions FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

-- Accept/dismiss/bulk-resolve are live user actions — the repository only
-- ever updates status/resolved_at/resolved_action (mirrors
-- ReminderRepository.setCompleted's narrow-field-update convention), the
-- table technically allows more under RLS but no call site does.
DROP POLICY IF EXISTS "gmail_suggestions_update_own" ON gmail_suggestions;
CREATE POLICY "gmail_suggestions_update_own" ON gmail_suggestions FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Written only by GmailSyncService (suggestion generation), through the
-- caller's own RLS-scoped client — see the header comment.
DROP POLICY IF EXISTS "gmail_suggestions_insert_own" ON gmail_suggestions;
CREATE POLICY "gmail_suggestions_insert_own" ON gmail_suggestions FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP TRIGGER IF EXISTS gmail_suggestions_set_updated_at ON gmail_suggestions;
CREATE TRIGGER gmail_suggestions_set_updated_at BEFORE UPDATE ON gmail_suggestions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS idx_gmail_suggestions_user_status
  ON gmail_suggestions (user_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_gmail_suggestions_message ON gmail_suggestions (gmail_message_id);
CREATE INDEX IF NOT EXISTS idx_gmail_suggestions_target_application ON gmail_suggestions (target_application_id);

-- ── applications.created_via: allow 'gmail' as a creation source ──
-- Redefines (not guard-adds) the existing constraint from
-- 20260717000001_module3a_application_management.sql, so this is safe to
-- re-run: DROP IF EXISTS is idempotent, and ADD always recreates the same
-- (now gmail-inclusive) definition.
ALTER TABLE applications DROP CONSTRAINT IF EXISTS applications_created_via_check;
ALTER TABLE applications
  ADD CONSTRAINT applications_created_via_check
  CHECK (created_via IN ('apply_flow', 'manual', 'gmail'));

-- ── Gmail provenance tracking (data collection only — no analytics UI in
-- this module) ──
-- A nullable FK back to the specific suggestion that created/updated each
-- record, on every entity a Gmail suggestion can produce. Richer than a
-- boolean flag: it lets a future analytics feature trace not just "this came
-- from Gmail" but which email/suggestion, without a new join table.
-- applications already has created_via='gmail' (above) as a coarser marker;
-- this adds the same precision it has to the three tables that had none.
ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS source_gmail_suggestion_id uuid REFERENCES gmail_suggestions(id) ON DELETE SET NULL;
ALTER TABLE interviews
  ADD COLUMN IF NOT EXISTS source_gmail_suggestion_id uuid REFERENCES gmail_suggestions(id) ON DELETE SET NULL;
ALTER TABLE application_reminders
  ADD COLUMN IF NOT EXISTS source_gmail_suggestion_id uuid REFERENCES gmail_suggestions(id) ON DELETE SET NULL;
ALTER TABLE application_attachments
  ADD COLUMN IF NOT EXISTS source_gmail_suggestion_id uuid REFERENCES gmail_suggestions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_applications_source_gmail_suggestion ON applications (source_gmail_suggestion_id);
CREATE INDEX IF NOT EXISTS idx_interviews_source_gmail_suggestion ON interviews (source_gmail_suggestion_id);
CREATE INDEX IF NOT EXISTS idx_application_reminders_source_gmail_suggestion ON application_reminders (source_gmail_suggestion_id);
CREATE INDEX IF NOT EXISTS idx_application_attachments_source_gmail_suggestion ON application_attachments (source_gmail_suggestion_id);
