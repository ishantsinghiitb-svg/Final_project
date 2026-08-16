-- ── Module 13 · Phase 2 (A2): Server-side resume upload protection ──
--
-- PROBLEM: the `resumes` storage bucket was created with no
-- `file_size_limit`/`allowed_mime_types` (see
-- 20260713131439_create_shared_trigger_and_storage_buckets.sql). RLS on
-- storage.objects only constrains the upload PATH (auth.uid()'s own folder),
-- not size or content type — those checks existed only in client-side JS
-- (`FILE_LIMITS.RESUME_MAX_BYTES`, `ACCEPTED_RESUME_TYPES` in
-- src/constants/index.ts), so an authenticated user could call the Storage
-- API directly and upload an arbitrarily large file, which the parse
-- pipeline would then download and run `unpdf` against with no bound.
--
-- FIX: enforce the SAME limits the app already declares as its contract at
-- the bucket level, so they hold regardless of which client calls Storage.
-- 10 MB matches FILE_LIMITS.RESUME_MAX_BYTES (10 * 1024 * 1024); the two
-- MIME types match ACCEPTED_RESUME_TYPES exactly — this is not a new,
-- invented limit, just the existing one enforced server-side too.
--
-- Only the `resumes` bucket is touched — `avatars`/`documents`/`exports`
-- are out of scope for this fix and are left exactly as they were.

UPDATE storage.buckets
SET file_size_limit = 10485760, -- 10 MiB
    allowed_mime_types = ARRAY[
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ]
WHERE id = 'resumes';
