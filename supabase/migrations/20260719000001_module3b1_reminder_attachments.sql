-- ── Module 3B.1: Reminder attachments ──
-- Reuses the existing `application_attachments` table + private `documents`
-- storage bucket (no new table, no new bucket) — a reminder attachment is
-- just an application_attachments row with an optional reminder_id link.
-- NULL reminder_id (the existing default) means a general application
-- attachment, unchanged from Module 3B.

ALTER TABLE application_attachments
  ADD COLUMN IF NOT EXISTS reminder_id uuid REFERENCES application_reminders(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_application_attachments_reminder_id
  ON application_attachments (reminder_id);
