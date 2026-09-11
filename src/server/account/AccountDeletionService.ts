import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { AuthedContext } from "@/server/supabase";
import { createServiceSupabase } from "@/server/supabase";
import { STORAGE_BUCKETS } from "@/constants";

// ── Account deletion (production audit B6) ──
//
// Every user-owned DATABASE table already cascades cleanly from auth.users
// (confirmed by tracing every `user_id ... REFERENCES auth.users(id)` FK
// across every migration — all of them are ON DELETE CASCADE, several
// levels deep in places, e.g. resume_versions has no user_id column at all
// and only ever cascades via resumes). So the ONE thing this file has to get
// right by hand is Supabase STORAGE: `auth.admin.deleteUser` deletes the
// `auth.users` row and lets Postgres cascade every table, but it does NOT
// reach into the Storage backend — a bucket object's bytes are a separate
// system from the DB, only reachable through the Storage API's own
// list/remove calls, never through a foreign key. Skip this and a deleted
// user's resumes/avatars/documents survive forever with no owner left to
// ever ask for their removal again.
//
// Deliberately in this order — Storage FIRST, auth.users LAST:
//   1. Sweep every user-owned bucket via the CALLER'S OWN RLS-scoped client
//      (never service role for this part) — structurally cannot touch
//      another user's objects even if a bug passed the wrong path, since
//      every bucket's DELETE policy is scoped to
//      `(storage.foldername(name))[1] = auth.uid()::text`.
//   2. Only once Storage is fully clean, delete the auth.users row via the
//      service-role client (the one privileged call this needs — nothing
//      short of service role can call the Admin API).
// If step 1 throws, step 2 never runs — the account and every DB row are
// still fully intact, nothing reports success, and the caller can retry.
// Reversing the order would mean a Storage failure AFTER the account is
// already gone leaves orphaned files with no user left who could ever
// authenticate to retry the sweep — exactly the unrecoverable state this
// ordering avoids.

/** Every Storage bucket that stores files under a `<userId>/...` prefix — see DocumentStorage/ResumeStorage/AvatarStorage. */
const USER_OWNED_BUCKETS = [
  STORAGE_BUCKETS.AVATARS,
  STORAGE_BUCKETS.RESUMES,
  STORAGE_BUCKETS.DOCUMENTS,
  STORAGE_BUCKETS.EXPORTS,
] as const;

/** Supabase Storage's own per-call listing limit — loop rather than assume one page is everything. */
const LIST_PAGE_SIZE = 100;

/**
 * Deletes every object under `<userId>/` in one bucket. Re-lists the SAME
 * folder each iteration (never offset-paginates) — each successful remove()
 * shrinks what list() returns next, so re-listing from the top always finds
 * whatever's left, which stays correct however many files a user has and
 * needs no offset bookkeeping. A bucket the user never touched (list()
 * returns empty immediately) is a no-op, which is also what makes retrying
 * this after a partial failure safe: already-removed files just don't come
 * back on the next list() call.
 */
async function sweepBucket(
  client: SupabaseClient<Database>,
  bucket: string,
  userId: string,
): Promise<number> {
  let deleted = 0;
  for (;;) {
    const { data: files, error: listError } = await client.storage
      .from(bucket)
      .list(userId, { limit: LIST_PAGE_SIZE });
    if (listError) throw listError;
    if (!files || files.length === 0) break;

    const paths = files.map((f) => `${userId}/${f.name}`);
    const { error: removeError } = await client.storage.from(bucket).remove(paths);
    if (removeError) throw removeError;
    deleted += paths.length;

    if (files.length < LIST_PAGE_SIZE) break;
  }
  return deleted;
}

export type AccountDeletionResult = {
  storageObjectsDeleted: number;
};

/**
 * Permanently deletes the CALLING user's account and every piece of data
 * that belongs to them. `authed.user.id` is the only identity this ever
 * acts on — resolved server-side from the caller's own validated session by
 * `requireUser`, never accepted as a parameter — so there is no way to
 * target any account but your own.
 */
export async function deleteAccount(authed: AuthedContext): Promise<AccountDeletionResult> {
  const userId = authed.user.id;

  let storageObjectsDeleted = 0;
  for (const bucket of USER_OWNED_BUCKETS) {
    storageObjectsDeleted += await sweepBucket(authed.supabase, bucket, userId);
  }

  const admin = createServiceSupabase();
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) throw error;

  return { storageObjectsDeleted };
}
