-- ── Module 9A: expanded email classification vocabulary ──
--
-- The original 10 categories collapsed distinctions the user actually acts
-- on differently: an "Interview Invitation" you must respond to, an
-- "Interview Scheduled" confirmation that needs nothing, and an "Interview
-- Reminder" the day before were all one category, so the Inbox couldn't
-- tell you which of them needed you. Same for offer accepted/declined vs a
-- live offer, and for the post-offer paperwork stages (background
-- verification, reference check, joining formalities) that previously fell
-- into the catch-all 'application_update' or 'unknown'.
--
-- Additive only: every pre-existing value stays valid, so already-classified
-- gmail_messages rows keep satisfying the constraint and no backfill or data
-- migration is required. The new values are simply now also permitted.
--
-- Idiom follows this repo's existing guarded-constraint pattern (see
-- applications_created_via_check in 20260717000001 / 20260808000001):
-- drop-if-exists then re-add, rather than an unguarded ADD CONSTRAINT that
-- would fail on re-run.

ALTER TABLE gmail_messages DROP CONSTRAINT IF EXISTS gmail_messages_category_check;

ALTER TABLE gmail_messages
  ADD CONSTRAINT gmail_messages_category_check
  CHECK (category IN (
    -- ── Original 10, unchanged ──
    'application_confirmation',
    'recruiter_reply',
    'interview_invitation',
    'online_assessment',
    'assignment',
    'follow_up_required',
    'offer',
    'rejection',
    'application_update',
    'unknown',

    -- ── Added ──
    -- Application lifecycle
    'application_submitted',
    'recruiter_viewed',
    -- Assessment split: an invitation to take one is actionable; a generic
    -- assessment-related message is not necessarily.
    'oa_invitation',
    -- Interview lifecycle: invitation (respond) vs scheduled (confirmed) vs
    -- rescheduled (details changed) vs reminder (no action, just timing).
    'interview_scheduled',
    'interview_rescheduled',
    'interview_reminder',
    -- Offer lifecycle
    'offer_accepted',
    'offer_declined',
    'waitlist',
    -- Post-offer / pre-joining formalities
    'background_verification',
    'reference_check',
    'joining_formalities',
    -- Explicit catch-all for genuine recruiter mail that fits nothing above.
    -- Distinct from 'unknown', which means "couldn't classify confidently"
    -- and never produces a suggestion.
    'general_recruiter_communication'
  ));

COMMENT ON COLUMN gmail_messages.category IS
  'Deterministic (or AI-fallback) classification. ''unknown'' specifically means low confidence and produces NO suggestion; ''general_recruiter_communication'' means confidently recruiter mail that fits no more specific category.';
