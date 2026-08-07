import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase as ambientSupabase } from "@/lib/supabase";
import type { Database, GoogleConnectionRow, GoogleConnectionInsert } from "@/types/database";
import type { GoogleConnection } from "@/features/gmail/types";

// ── GoogleConnectionRepository (Module 9A/9B) ──
//
// One Google OAuth connection per user (google_connections, née
// gmail_connections), now covering two independently-grantable, incrementally
// authorized scopes — Gmail and Calendar. Identity/token columns
// (google_email, scope, refresh_token_ciphertext/nonce, connected_at) are
// shared; every engine-state column is split gmail_*/calendar_* so each
// product's sync status/checkpoint is tracked independently.
//
// Unlike every other repository in this codebase, this data is written from
// two genuinely different contexts: a live authenticated user session
// (Settings toggles, disconnect, and every sync run) AND the ONE
// session-less privileged context, the OAuth callback (a bare GET redirect
// from Google with no ambient session at all). This repository takes an
// optional client, defaulting to the ambient client to match every other
// repository's zero-arg-constructor call sites — the OAuth callback route
// constructs its own `createServiceSupabase()` client and passes it in.
// This file must never import from src/server/** — it lives outside that
// import-protected path specifically so client code can still use it.

const CONNECTION_COLUMNS =
  "id, user_id, google_email, scope, connected_at, " +
  "gmail_status, gmail_auto_sync_enabled, gmail_last_synced_at, gmail_last_sync_error, " +
  "calendar_status, calendar_auto_sync_enabled, calendar_last_synced_at, calendar_last_sync_error";

// Includes the encrypted token + both products' sync-engine-only fields —
// only ever requested by findConnectionForSync, called exclusively by the
// sync engines.
const CONNECTION_COLUMNS_FULL =
  CONNECTION_COLUMNS +
  ", refresh_token_ciphertext, refresh_token_nonce" +
  ", gmail_history_id, gmail_backfill_complete, gmail_backfill_page_token, gmail_next_sync_at, gmail_sync_lock_acquired_at" +
  ", calendar_next_sync_at, calendar_sync_lock_acquired_at";

export type GoogleProduct = "gmail" | "calendar";

export class GoogleConnectionRepository {
  constructor(private readonly client: SupabaseClient<Database> = ambientSupabase) {}

  /** Client/UI-facing status — never selects the encrypted token columns. */
  async findConnectionByUser(userId: string): Promise<GoogleConnection | null> {
    const { data, error } = await this.client
      .from("google_connections")
      .select(CONNECTION_COLUMNS)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw error;
    return data as GoogleConnection | null;
  }

  /** Full row incl. encrypted token — only for a sync engine, never a client-facing query. */
  async findConnectionForSync(userId: string): Promise<GoogleConnectionRow | null> {
    const { data, error } = await this.client
      .from("google_connections")
      .select(CONNECTION_COLUMNS_FULL)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw error;
    return data as GoogleConnectionRow | null;
  }

  /**
   * Connect/reconnect — upserts on the UNIQUE(user_id) constraint. Called
   * exclusively from the OAuth callback route (service-role client — the
   * callback has no ambient session to authenticate an RLS-scoped write
   * with in the first place).
   *
   * `grantedScope` is what Google actually returned (space-separated) —
   * which product(s) this particular consent covered is derived from it,
   * not trusted from client-declared intent, so `gmailGranted`/
   * `calendarGranted` here are booleans the CALLER already computed by
   * checking `grantedScope` against each product's scope string.
   */
  async upsertConnection(input: {
    user_id: string;
    google_email: string;
    scope: string;
    refresh_token_ciphertext: string;
    refresh_token_nonce: string;
    gmailGranted: boolean;
    calendarGranted: boolean;
    /** Preserve across a reconnect of the SAME Google account (avoids a full historical re-backfill); reset for a first-time/different-account connect. */
    gmailHistoryId?: string | null;
    gmailBackfillComplete?: boolean;
    gmailBackfillPageToken?: string | null;
  }): Promise<GoogleConnection> {
    const patch: GoogleConnectionInsert = {
      user_id: input.user_id,
      google_email: input.google_email,
      scope: input.scope,
      refresh_token_ciphertext: input.refresh_token_ciphertext,
      refresh_token_nonce: input.refresh_token_nonce,
      connected_at: new Date().toISOString(),
      ...(input.gmailGranted
        ? {
            gmail_status: "connected",
            gmail_last_sync_error: null,
            gmail_sync_lock_acquired_at: null,
            gmail_history_id: input.gmailHistoryId ?? null,
            gmail_backfill_complete: input.gmailBackfillComplete ?? false,
            gmail_backfill_page_token: input.gmailBackfillPageToken ?? null,
          }
        : {}),
      ...(input.calendarGranted
        ? {
            calendar_status: "connected",
            calendar_last_sync_error: null,
            calendar_sync_lock_acquired_at: null,
          }
        : {}),
    };

    const { data, error } = await this.client
      .from("google_connections")
      .upsert(patch, { onConflict: "user_id" })
      .select(CONNECTION_COLUMNS)
      .single();
    if (error) throw error;
    return data as unknown as GoogleConnection;
  }

  /** Settings toggle — narrow, owner-initiated update (ambient RLS-scoped client). */
  async updateAutoSync(
    userId: string,
    product: GoogleProduct,
    enabled: boolean,
  ): Promise<GoogleConnection> {
    const patch: Partial<GoogleConnectionRow> =
      product === "gmail"
        ? { gmail_auto_sync_enabled: enabled }
        : { calendar_auto_sync_enabled: enabled };
    const { data, error } = await this.client
      .from("google_connections")
      .update(patch)
      .eq("user_id", userId)
      .select(CONNECTION_COLUMNS)
      .single();
    if (error) throw error;
    return data as unknown as GoogleConnection;
  }

  /**
   * Best-effort local cleanup for Disconnect — clears per-product sync
   * state; only clears the shared token material once BOTH products are
   * disconnected (each product disconnects independently — see the Module
   * 9B plan §6). User-initiated (has a session), so this runs on the
   * ambient/RLS-scoped client — no service-role needed.
   */
  async disconnectProduct(userId: string, product: GoogleProduct): Promise<void> {
    const connection = await this.findConnectionForSync(userId);
    if (!connection) return;

    const otherStillConnected =
      product === "gmail"
        ? connection.calendar_status !== "disconnected"
        : connection.gmail_status !== "disconnected";

    const tokenClear: Partial<GoogleConnectionRow> = otherStillConnected
      ? {}
      : { refresh_token_ciphertext: "", refresh_token_nonce: "" };

    const patch: Partial<GoogleConnectionRow> =
      product === "gmail"
        ? {
            gmail_status: "disconnected",
            gmail_history_id: null,
            gmail_backfill_complete: false,
            gmail_backfill_page_token: null,
            gmail_auto_sync_enabled: false,
            gmail_sync_lock_acquired_at: null,
            ...tokenClear,
          }
        : {
            calendar_status: "disconnected",
            calendar_auto_sync_enabled: false,
            calendar_sync_lock_acquired_at: null,
            ...tokenClear,
          };

    const { error } = await this.client
      .from("google_connections")
      .update(patch)
      .eq("user_id", userId);
    if (error) throw error;
  }

  /**
   * Atomic claim guard against two sync triggers racing (e.g. two open
   * tabs), per product. Only the caller that gets a row back may proceed; a
   * lock older than 5 minutes is treated as an abandoned run and reclaimed.
   */
  async claimSyncLock(userId: string, product: GoogleProduct): Promise<boolean> {
    const staleBefore = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const nowIso = new Date().toISOString();
    const statusColumn = product === "gmail" ? "gmail_status" : "calendar_status";
    const lockColumn =
      product === "gmail" ? "gmail_sync_lock_acquired_at" : "calendar_sync_lock_acquired_at";
    const patch: Partial<GoogleConnectionRow> =
      product === "gmail"
        ? { gmail_status: "syncing", gmail_sync_lock_acquired_at: nowIso }
        : { calendar_status: "syncing", calendar_sync_lock_acquired_at: nowIso };
    const { data, error } = await this.client
      .from("google_connections")
      .update(patch)
      .eq("user_id", userId)
      .in(statusColumn, ["connected", "error"])
      .or(`${lockColumn}.is.null,${lockColumn}.lt.${staleBefore}`)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    return data !== null;
  }

  /** Releases a product's sync claim and records the outcome. */
  async releaseGmailSyncLock(
    userId: string,
    patch: {
      status: "connected" | "error" | "needs_reauth";
      history_id?: string;
      backfill_complete?: boolean;
      backfill_page_token?: string | null;
      last_synced_at?: string;
      last_sync_error?: string | null;
      next_sync_at?: string | null;
    },
  ): Promise<void> {
    const { error } = await this.client
      .from("google_connections")
      .update({
        gmail_status: patch.status,
        ...(patch.history_id !== undefined ? { gmail_history_id: patch.history_id } : {}),
        ...(patch.backfill_complete !== undefined
          ? { gmail_backfill_complete: patch.backfill_complete }
          : {}),
        ...(patch.backfill_page_token !== undefined
          ? { gmail_backfill_page_token: patch.backfill_page_token }
          : {}),
        ...(patch.last_synced_at !== undefined
          ? { gmail_last_synced_at: patch.last_synced_at }
          : {}),
        ...(patch.last_sync_error !== undefined
          ? { gmail_last_sync_error: patch.last_sync_error }
          : {}),
        ...(patch.next_sync_at !== undefined ? { gmail_next_sync_at: patch.next_sync_at } : {}),
        gmail_sync_lock_acquired_at: null,
      })
      .eq("user_id", userId);
    if (error) throw error;
  }

  async releaseCalendarSyncLock(
    userId: string,
    patch: {
      status: "connected" | "error" | "needs_reauth";
      last_synced_at?: string;
      last_sync_error?: string | null;
      next_sync_at?: string | null;
    },
  ): Promise<void> {
    const { error } = await this.client
      .from("google_connections")
      .update({
        calendar_status: patch.status,
        ...(patch.last_synced_at !== undefined
          ? { calendar_last_synced_at: patch.last_synced_at }
          : {}),
        ...(patch.last_sync_error !== undefined
          ? { calendar_last_sync_error: patch.last_sync_error }
          : {}),
        ...(patch.next_sync_at !== undefined ? { calendar_next_sync_at: patch.next_sync_at } : {}),
        calendar_sync_lock_acquired_at: null,
      })
      .eq("user_id", userId);
    if (error) throw error;
  }
}
