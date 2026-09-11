-- ── Module 13: Gmail disconnect cleanup (production audit B5) ──
--
-- Gmail disconnect never deleted gmail_messages — a user disconnecting
-- Gmail kept every synced email's metadata (subject, snippet, from address,
-- company name, thread id) in the DB indefinitely. Calendar's disconnect
-- flow has always cleared its own equivalent table
-- (CalendarRepository.deleteAllEventsForUser); Gmail's was the odd one out.
-- Fixed in GmailRepository.deleteAllMessagesForUser /
-- SuggestionRepository.detachGmailFromCorroboratedSuggestions, called from
-- src/server-functions/gmail.ts's disconnectGoogleProduct.
--
-- This migration is the RLS half of that fix: disconnectGoogleProduct runs
-- on the caller's own ambient/RLS-scoped client (a live user session, no
-- service-role needed), and gmail_messages had SELECT + INSERT policies but
-- no DELETE policy at all — a `.delete()` from that client would silently
-- affect zero rows. Mirrors calendar_events_delete_own / suggestions_delete_own
-- exactly: scoped to the caller's own rows only.
DROP POLICY IF EXISTS "gmail_messages_delete_own" ON gmail_messages;
CREATE POLICY "gmail_messages_delete_own" ON gmail_messages FOR DELETE
  TO authenticated USING (auth.uid() = user_id);
