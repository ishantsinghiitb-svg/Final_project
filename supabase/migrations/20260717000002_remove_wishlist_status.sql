-- ── Remove the "wishlist" application status ──
-- The app-level ApplicationStatus enum no longer includes "wishlist" (the
-- tracked workflow now starts at "applied"). Any existing rows still carrying
-- the old value are migrated forward so STATUS_META lookups (which no longer
-- have a "wishlist" entry) don't break for pre-existing data.

UPDATE applications SET status = 'applied' WHERE status = 'wishlist';
