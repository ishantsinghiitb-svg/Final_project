-- ── Module 3A: Application Management Foundation ──
--
-- Extends the existing `applications` / `application_activity` tables rather
-- than introducing new ones, per the "avoid unnecessary migrations" mandate:
--   - `applications` gains archive state, a creation-source marker, and a
--     generic `metadata` column so future fields (recruiter, hiring manager,
--     referral, resume version, cover letter, reminder) can be added later
--     as plain nullable columns/tables without touching this migration.
--   - `application_activity` gains the structured (previous/new/metadata)
--     shape needed to drive a Timeline UI in Module 3B, and is populated
--     automatically by a trigger so no call site has to remember to log.

-- ── applications: archive + provenance + extension point ──
ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS archived     boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS archived_at  timestamptz,
  ADD COLUMN IF NOT EXISTS created_via  text NOT NULL DEFAULT 'apply_flow',
  ADD COLUMN IF NOT EXISTS metadata     jsonb NOT NULL DEFAULT '{}'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'applications_created_via_check'
  ) THEN
    ALTER TABLE applications
      ADD CONSTRAINT applications_created_via_check
      CHECK (created_via IN ('apply_flow', 'manual'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_applications_user_archived
  ON applications (user_id, archived);

-- ── application_activity: structured timeline fields ──
-- `kind` (existing) doubles as the event type, `text` as the rendered
-- human-readable summary — both already present and already used by the
-- trigger below, so no rename is needed.
ALTER TABLE application_activity
  ADD COLUMN IF NOT EXISTS previous_value text,
  ADD COLUMN IF NOT EXISTS new_value      text,
  ADD COLUMN IF NOT EXISTS metadata       jsonb NOT NULL DEFAULT '{}'::jsonb;

-- ── Automatic timeline logging ──
-- Runs as the invoking role (no SECURITY DEFINER) so the nested INSERT into
-- application_activity is still subject to its normal RLS policies — it
-- passes because NEW.user_id always equals auth.uid() (enforced by the
-- applications RLS policies on the very row being inserted/updated).
CREATE OR REPLACE FUNCTION log_application_timeline_event()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO application_activity
      (application_id, user_id, kind, text, previous_value, new_value, metadata)
    VALUES (
      NEW.id,
      NEW.user_id,
      CASE WHEN NEW.created_via = 'manual' THEN 'manual_application_created' ELSE 'application_created' END,
      CASE WHEN NEW.created_via = 'manual' THEN 'Application created manually' ELSE 'Application created' END,
      NULL,
      NEW.status,
      jsonb_build_object('company_name', NEW.company_name, 'role', NEW.role)
    );

  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      INSERT INTO application_activity
        (application_id, user_id, kind, text, previous_value, new_value, metadata)
      VALUES (
        NEW.id, NEW.user_id, 'status_changed', 'Status changed',
        OLD.status, NEW.status, '{}'::jsonb
      );
    END IF;

    IF NEW.archived IS DISTINCT FROM OLD.archived THEN
      INSERT INTO application_activity
        (application_id, user_id, kind, text, previous_value, new_value, metadata)
      VALUES (
        NEW.id, NEW.user_id,
        CASE WHEN NEW.archived THEN 'archived' ELSE 'restored' END,
        CASE WHEN NEW.archived THEN 'Application archived' ELSE 'Application restored' END,
        OLD.archived::text, NEW.archived::text, '{}'::jsonb
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS applications_log_timeline_event ON applications;
CREATE TRIGGER applications_log_timeline_event
  AFTER INSERT OR UPDATE ON applications
  FOR EACH ROW EXECUTE FUNCTION log_application_timeline_event();
