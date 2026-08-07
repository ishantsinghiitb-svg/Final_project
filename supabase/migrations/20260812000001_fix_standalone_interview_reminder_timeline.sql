-- ── Fix: reminder timeline trigger vs. standalone-interview reminders (Module 9B follow-up) ──
--
-- Module 9B (20260811000001) made application_reminders.application_id
-- NULLABLE and added interview_id, so a reminder can hang off a STANDALONE
-- interview — one with no application behind it, which is exactly what a
-- calendar-detected interview at an untracked company produces.
--
-- log_reminder_timeline_event() (20260718000001) was never updated to match:
-- it inserts NEW.application_id straight into application_activity, whose
-- application_id is NOT NULL. So inserting a reminder for a standalone
-- interview raised 23502 and the whole reminder insert rolled back.
--
-- Live symptom this fixes: accepting a calendar interview suggestion for an
-- untracked company created the interview, then silently failed to create
-- its T-24h / T-1h reminders ("Failed to create interview reminders: null
-- value in column application_id ... violates not-null constraint" — caught
-- and logged by GmailService, so the accept still reported success while the
-- reminders were quietly missing).
--
-- The application timeline is inherently application-scoped: a standalone
-- interview has no application whose timeline this could belong on, so the
-- correct behavior is to skip the timeline entry rather than invent one.
-- The reminder itself is still created, and still drives the Interviews
-- page's "next reminder" indicator, which reads application_reminders
-- directly rather than the timeline.

CREATE OR REPLACE FUNCTION log_reminder_timeline_event()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Standalone-interview reminder: nothing to attach a timeline entry to.
  IF NEW.application_id IS NULL THEN
    RETURN NEW;
  END IF;

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
