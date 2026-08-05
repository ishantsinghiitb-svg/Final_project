-- ── Module 9A: store Gmail read/unread state ──
--
-- Supports the Inbox's All / Unread / Read view filter. Gmail exposes read
-- state as an `UNREAD` entry in a message's labelIds, which the sync already
-- receives on every messages.get call at no extra request cost — it simply
-- wasn't persisted.
--
-- This is a VIEW filter, never a sync filter: every relevant recruiter email
-- continues to be fetched, classified and stored exactly as before regardless
-- of its read state. Nothing is skipped or lost because it happened to be
-- opened in Gmail first; the column only decides which chip it appears under.
--
-- SEMANTICS — read this before relying on the value. `is_unread` is a
-- SNAPSHOT taken when the message was first synced, not a live mirror of
-- Gmail. A message already processed is never re-fetched (the dedup precheck
-- skips it), so opening it in Gmail afterwards does NOT flip this column.
-- Keeping it live would mean re-fetching known messages on every sync, which
-- is a sync-architecture change and deliberately out of scope. In practice
-- the snapshot is the more useful signal anyway: it answers "was this new to
-- me when it arrived", which is what the Unread chip is for.
--
-- NULL means "synced before this column existed" — those rows are treated as
-- read by the UI, so old backfilled mail doesn't flood the default view.

ALTER TABLE gmail_messages
  ADD COLUMN IF NOT EXISTS is_unread boolean;

COMMENT ON COLUMN gmail_messages.is_unread IS
  'Gmail UNREAD label state captured at first sync. Snapshot, not live — see migration 20260810000001. NULL = synced before this column existed, treated as read.';
