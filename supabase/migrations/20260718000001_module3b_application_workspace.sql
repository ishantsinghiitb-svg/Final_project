-- ── Module 3B: Complete Application Workspace ──
--
-- Extends `applications` with a handful of nullable columns (notes timestamp,
-- priority, resume/cover-letter association) and adds four small, normalized
-- child tables (contacts, reminders, attachments) plus a minimal
-- `cover_letters` entity — there was no existing cover-letter data to reuse,
-- so this mirrors `resumes` at the smallest useful size. Nothing here
-- duplicates job data or touches the existing applications/application_activity
-- shape from Module 3A beyond additive columns.

-- ── applications: notes timestamp, priority, resume/cover-letter association ──
ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS notes_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS priority          text,
  ADD COLUMN IF NOT EXISTS resume_id         uuid REFERENCES resumes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cover_letter_id   uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'applications_priority_check'
  ) THEN
    ALTER TABLE applications
      ADD CONSTRAINT applications_priority_check
      CHECK (priority IS NULL OR priority IN ('low', 'medium', 'high', 'urgent'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_applications_resume_id ON applications (resume_id);

-- ── cover_letters ──
-- Deliberately minimal (one row per version — no separate versions table like
-- resumes has) since nothing in the app produces cover-letter content today;
-- this is the smallest shape that satisfies "Name, Version, Last Updated".
CREATE TABLE IF NOT EXISTS cover_letters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  version_number integer NOT NULL DEFAULT 1,
  file_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE cover_letters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cover_letters_select_own" ON cover_letters;
CREATE POLICY "cover_letters_select_own" ON cover_letters FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "cover_letters_insert_own" ON cover_letters;
CREATE POLICY "cover_letters_insert_own" ON cover_letters FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "cover_letters_update_own" ON cover_letters;
CREATE POLICY "cover_letters_update_own" ON cover_letters FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "cover_letters_delete_own" ON cover_letters;
CREATE POLICY "cover_letters_delete_own" ON cover_letters FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS cover_letters_set_updated_at ON cover_letters;
CREATE TRIGGER cover_letters_set_updated_at BEFORE UPDATE ON cover_letters
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Now that cover_letters exists, wire up the FK deferred above.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'applications_cover_letter_id_fkey'
  ) THEN
    ALTER TABLE applications
      ADD CONSTRAINT applications_cover_letter_id_fkey
      FOREIGN KEY (cover_letter_id) REFERENCES cover_letters(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_applications_cover_letter_id ON applications (cover_letter_id);

-- ── application_contacts ──
CREATE TABLE IF NOT EXISTS application_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('recruiter', 'hiring_manager', 'referral')),
  name text NOT NULL,
  email text,
  linkedin_url text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE application_contacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "application_contacts_select_own" ON application_contacts;
CREATE POLICY "application_contacts_select_own" ON application_contacts FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "application_contacts_insert_own" ON application_contacts;
CREATE POLICY "application_contacts_insert_own" ON application_contacts FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "application_contacts_update_own" ON application_contacts;
CREATE POLICY "application_contacts_update_own" ON application_contacts FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "application_contacts_delete_own" ON application_contacts;
CREATE POLICY "application_contacts_delete_own" ON application_contacts FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS application_contacts_set_updated_at ON application_contacts;
CREATE TRIGGER application_contacts_set_updated_at BEFORE UPDATE ON application_contacts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS idx_application_contacts_application_id ON application_contacts (application_id);

-- ── application_reminders ──
CREATE TABLE IF NOT EXISTS application_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('follow_up', 'interview', 'oa_deadline', 'offer_expiry', 'custom')),
  title text NOT NULL,
  remind_at timestamptz NOT NULL,
  note text,
  completed boolean NOT NULL DEFAULT false,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE application_reminders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "application_reminders_select_own" ON application_reminders;
CREATE POLICY "application_reminders_select_own" ON application_reminders FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "application_reminders_insert_own" ON application_reminders;
CREATE POLICY "application_reminders_insert_own" ON application_reminders FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "application_reminders_update_own" ON application_reminders;
CREATE POLICY "application_reminders_update_own" ON application_reminders FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "application_reminders_delete_own" ON application_reminders;
CREATE POLICY "application_reminders_delete_own" ON application_reminders FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS application_reminders_set_updated_at ON application_reminders;
CREATE TRIGGER application_reminders_set_updated_at BEFORE UPDATE ON application_reminders
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS idx_application_reminders_application_id ON application_reminders (application_id);
CREATE INDEX IF NOT EXISTS idx_application_reminders_user_remind_at ON application_reminders (user_id, remind_at);

-- ── application_attachments ──
-- Metadata only — files live in the existing private `documents` storage
-- bucket (see supabase/migrations/20260713131439_*, src/services/storage/DocumentStorage.ts).
CREATE TABLE IF NOT EXISTS application_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'other' CHECK (kind IN ('offer_letter', 'assignment', 'pdf', 'other')),
  name text NOT NULL,
  file_path text NOT NULL,
  size_bytes bigint,
  mime_type text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE application_attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "application_attachments_select_own" ON application_attachments;
CREATE POLICY "application_attachments_select_own" ON application_attachments FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "application_attachments_insert_own" ON application_attachments;
CREATE POLICY "application_attachments_insert_own" ON application_attachments FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "application_attachments_delete_own" ON application_attachments;
CREATE POLICY "application_attachments_delete_own" ON application_attachments FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_application_attachments_application_id ON application_attachments (application_id);

-- ── Timeline: extend the Module 3A trigger with new event types ──
-- notes_updated / priority_changed / resume_changed all live on `applications`
-- itself, so they're added to the existing AFTER UPDATE branch. resume_changed
-- resolves resume names inline so the timeline stays human-readable without a
-- client-side join.
CREATE OR REPLACE FUNCTION log_application_timeline_event()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_old_resume_name text;
  v_new_resume_name text;
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

    IF NEW.notes IS DISTINCT FROM OLD.notes THEN
      INSERT INTO application_activity
        (application_id, user_id, kind, text, previous_value, new_value, metadata)
      VALUES (
        NEW.id, NEW.user_id, 'notes_updated', 'Notes updated', NULL, NULL, '{}'::jsonb
      );
    END IF;

    IF NEW.priority IS DISTINCT FROM OLD.priority THEN
      INSERT INTO application_activity
        (application_id, user_id, kind, text, previous_value, new_value, metadata)
      VALUES (
        NEW.id, NEW.user_id, 'priority_changed', 'Priority changed',
        OLD.priority, NEW.priority, '{}'::jsonb
      );
    END IF;

    IF NEW.resume_id IS DISTINCT FROM OLD.resume_id THEN
      IF OLD.resume_id IS NOT NULL THEN
        SELECT name INTO v_old_resume_name FROM resumes WHERE id = OLD.resume_id;
      END IF;
      IF NEW.resume_id IS NOT NULL THEN
        SELECT name INTO v_new_resume_name FROM resumes WHERE id = NEW.resume_id;
      END IF;
      INSERT INTO application_activity
        (application_id, user_id, kind, text, previous_value, new_value, metadata)
      VALUES (
        NEW.id, NEW.user_id, 'resume_changed', 'Resume changed',
        v_old_resume_name, v_new_resume_name, '{}'::jsonb
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

-- ── Timeline: contact_added (application_contacts) ──
CREATE OR REPLACE FUNCTION log_contact_timeline_event()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO application_activity
    (application_id, user_id, kind, text, previous_value, new_value, metadata)
  VALUES (
    NEW.application_id, NEW.user_id, 'contact_added',
    'Added ' || NEW.type || ': ' || NEW.name,
    NULL, NEW.name,
    jsonb_build_object('contact_type', NEW.type)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS application_contacts_log_timeline_event ON application_contacts;
CREATE TRIGGER application_contacts_log_timeline_event
  AFTER INSERT ON application_contacts
  FOR EACH ROW EXECUTE FUNCTION log_contact_timeline_event();

-- ── Timeline: reminder_created / reminder_completed (application_reminders) ──
CREATE OR REPLACE FUNCTION log_reminder_timeline_event()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO application_activity
      (application_id, user_id, kind, text, previous_value, new_value, metadata)
    VALUES (
      NEW.application_id, NEW.user_id, 'reminder_created',
      'Reminder created: ' || NEW.title,
      NULL, NEW.title,
      jsonb_build_object('reminder_type', NEW.type)
    );
  ELSIF TG_OP = 'UPDATE' AND NEW.completed IS DISTINCT FROM OLD.completed AND NEW.completed THEN
    INSERT INTO application_activity
      (application_id, user_id, kind, text, previous_value, new_value, metadata)
    VALUES (
      NEW.application_id, NEW.user_id, 'reminder_completed',
      'Reminder completed: ' || NEW.title,
      NULL, NEW.title,
      jsonb_build_object('reminder_type', NEW.type)
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS application_reminders_log_timeline_event ON application_reminders;
CREATE TRIGGER application_reminders_log_timeline_event
  AFTER INSERT OR UPDATE ON application_reminders
  FOR EACH ROW EXECUTE FUNCTION log_reminder_timeline_event();
