import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { AuthedContext } from "@/server/supabase";

// deleteAccount() calls createServiceSupabase() internally for the
// auth.admin.deleteUser step — mocked here so tests never need real
// SUPABASE_SECRET_KEY/SUPABASE_URL env vars, and so the admin call itself
// can be observed/failed independently of the RLS-scoped storage sweep.
const adminDeleteUserCalls: string[] = [];
let adminDeleteUserError: { message: string } | null = null;

vi.mock("@/server/supabase", async () => {
  const actual = await vi.importActual<typeof import("@/server/supabase")>("@/server/supabase");
  return {
    ...actual,
    createServiceSupabase: () => ({
      auth: {
        admin: {
          deleteUser: async (userId: string) => {
            adminDeleteUserCalls.push(userId);
            return { data: null, error: adminDeleteUserError };
          },
        },
      },
    }),
  };
});

const { deleteAccount } = await import("./AccountDeletionService");

type StorageFile = { name: string };

/**
 * Fakes ONLY the `client.storage` surface `sweepBucket` touches. Each bucket
 * gets its own mutable file list so tests can assert exactly which bucket
 * lost which files, and that a bucket the fixture never seeded is never
 * queried outside its own userId folder — `list`/`remove` calls are logged
 * per bucket so tests can assert scoping and pagination directly, not just
 * the end result.
 */
function fakeAuthedSupabase(
  filesByBucketAndUser: Record<string, Record<string, StorageFile[]>>,
  calls: { list: { bucket: string; path: string }[]; remove: { bucket: string; paths: string[] }[] },
): SupabaseClient<Database> {
  return {
    storage: {
      from(bucket: string) {
        return {
          async list(path: string, options?: { limit?: number }) {
            calls.list.push({ bucket, path });
            const all = filesByBucketAndUser[bucket]?.[path] ?? [];
            const limit = options?.limit ?? all.length;
            return { data: all.slice(0, limit), error: null };
          },
          async remove(paths: string[]) {
            calls.remove.push({ bucket, paths });
            for (const fullPath of paths) {
              const [userId, ...rest] = fullPath.split("/");
              const name = rest.join("/");
              const list = filesByBucketAndUser[bucket]?.[userId];
              if (list) {
                const idx = list.findIndex((f) => f.name === name);
                if (idx !== -1) list.splice(idx, 1);
              }
            }
            return { data: null, error: null };
          },
        };
      },
    },
  } as unknown as SupabaseClient<Database>;
}

function authedFor(
  userId: string,
  filesByBucketAndUser: Record<string, Record<string, StorageFile[]>>,
  calls: { list: { bucket: string; path: string }[]; remove: { bucket: string; paths: string[] }[] },
): AuthedContext {
  return {
    supabase: fakeAuthedSupabase(filesByBucketAndUser, calls),
    user: { id: userId } as AuthedContext["user"],
    accessToken: "test-token",
  };
}

const USER_A = "user-a";
const USER_B = "user-b";
const ALL_BUCKETS = ["avatars", "resumes", "documents", "exports"];

function emptyCallLog() {
  return { list: [] as { bucket: string; path: string }[], remove: [] as { bucket: string; paths: string[] }[] };
}

describe("deleteAccount", () => {
  it("deletes every object across all 4 user-owned buckets, then deletes the auth user", async () => {
    adminDeleteUserCalls.length = 0;
    adminDeleteUserError = null;
    const calls = emptyCallLog();
    const files: Record<string, Record<string, StorageFile[]>> = {
      avatars: { [USER_A]: [{ name: "avatar.png" }] },
      resumes: { [USER_A]: [{ name: "r1.pdf" }, { name: "r2.docx" }] },
      documents: { [USER_A]: [{ name: "d1.pdf" }] },
      exports: { [USER_A]: [] },
    };
    const authed = authedFor(USER_A, files, calls);

    const result = await deleteAccount(authed);

    expect(result.storageObjectsDeleted).toBe(4);
    expect(files.avatars[USER_A]).toEqual([]);
    expect(files.resumes[USER_A]).toEqual([]);
    expect(files.documents[USER_A]).toEqual([]);
    expect(adminDeleteUserCalls).toEqual([USER_A]);
  });

  it("only ever lists/removes under the calling user's own folder, never another user's", async () => {
    adminDeleteUserCalls.length = 0;
    adminDeleteUserError = null;
    const calls = emptyCallLog();
    const files: Record<string, Record<string, StorageFile[]>> = {
      avatars: { [USER_A]: [{ name: "avatar.png" }], [USER_B]: [{ name: "avatar.png" }] },
      resumes: { [USER_A]: [], [USER_B]: [{ name: "secret.pdf" }] },
      documents: { [USER_A]: [], [USER_B]: [] },
      exports: { [USER_A]: [], [USER_B]: [] },
    };
    const authed = authedFor(USER_A, files, calls);

    await deleteAccount(authed);

    // Every list() call was scoped to USER_A's own folder.
    expect(calls.list.every((c) => c.path === USER_A)).toBe(true);
    // Every remove() path was prefixed with USER_A's id.
    for (const removeCall of calls.remove) {
      expect(removeCall.paths.every((p) => p.startsWith(`${USER_A}/`))).toBe(true);
    }
    // User B's files were never touched.
    expect(files.avatars[USER_B]).toEqual([{ name: "avatar.png" }]);
    expect(files.resumes[USER_B]).toEqual([{ name: "secret.pdf" }]);
  });

  it("paginates a bucket with more files than one list() page", async () => {
    adminDeleteUserCalls.length = 0;
    adminDeleteUserError = null;
    const calls = emptyCallLog();
    const manyFiles = Array.from({ length: 150 }, (_, i) => ({ name: `v${i}.pdf` }));
    const files: Record<string, Record<string, StorageFile[]>> = {
      avatars: { [USER_A]: [] },
      resumes: { [USER_A]: manyFiles },
      documents: { [USER_A]: [] },
      exports: { [USER_A]: [] },
    };
    const authed = authedFor(USER_A, files, calls);

    const result = await deleteAccount(authed);

    expect(result.storageObjectsDeleted).toBe(150);
    expect(files.resumes[USER_A]).toEqual([]);
    // resumes needed 2 list() round-trips (100 + 50); other 3 buckets needed 1 each.
    const resumeListCalls = calls.list.filter((c) => c.bucket === "resumes");
    expect(resumeListCalls.length).toBe(2);
  });

  it("is a safe no-op for buckets the user never used", async () => {
    adminDeleteUserCalls.length = 0;
    adminDeleteUserError = null;
    const calls = emptyCallLog();
    const files: Record<string, Record<string, StorageFile[]>> = {
      avatars: {},
      resumes: {},
      documents: {},
      exports: {},
    };
    const authed = authedFor(USER_A, files, calls);

    const result = await deleteAccount(authed);

    expect(result.storageObjectsDeleted).toBe(0);
    expect(adminDeleteUserCalls).toEqual([USER_A]);
  });

  it("never calls auth.admin.deleteUser when the storage sweep fails", async () => {
    adminDeleteUserCalls.length = 0;
    adminDeleteUserError = null;
    const calls = emptyCallLog();
    const authed = {
      supabase: {
        storage: {
          from() {
            return {
              async list() {
                return { data: null, error: { message: "storage unavailable" } };
              },
              async remove() {
                return { data: null, error: null };
              },
            };
          },
        },
      } as unknown as SupabaseClient<Database>,
      user: { id: USER_A } as AuthedContext["user"],
      accessToken: "test-token",
    };

    await expect(deleteAccount(authed)).rejects.toMatchObject({ message: "storage unavailable" });
    expect(adminDeleteUserCalls).toEqual([]);
    void calls;
  });

  it("throws (never reports success) when auth.admin.deleteUser itself fails", async () => {
    adminDeleteUserCalls.length = 0;
    adminDeleteUserError = { message: "admin API unavailable" };
    const calls = emptyCallLog();
    const files: Record<string, Record<string, StorageFile[]>> = {
      avatars: { [USER_A]: [] },
      resumes: { [USER_A]: [] },
      documents: { [USER_A]: [] },
      exports: { [USER_A]: [] },
    };
    const authed = authedFor(USER_A, files, calls);

    await expect(deleteAccount(authed)).rejects.toMatchObject({ message: "admin API unavailable" });
    adminDeleteUserError = null;
  });

  it("retrying after a partial storage failure is safe — already-removed files are not double-processed", async () => {
    adminDeleteUserCalls.length = 0;
    adminDeleteUserError = null;
    const calls = emptyCallLog();
    // Simulates: avatars/resumes already cleaned by a prior partial run;
    // only documents/exports still have (or never had) anything.
    const files: Record<string, Record<string, StorageFile[]>> = {
      avatars: { [USER_A]: [] },
      resumes: { [USER_A]: [] },
      documents: { [USER_A]: [{ name: "leftover.pdf" }] },
      exports: { [USER_A]: [] },
    };
    const authed = authedFor(USER_A, files, calls);

    const result = await deleteAccount(authed);

    expect(result.storageObjectsDeleted).toBe(1);
    expect(files.documents[USER_A]).toEqual([]);
    expect(adminDeleteUserCalls).toEqual([USER_A]);
  });
});
