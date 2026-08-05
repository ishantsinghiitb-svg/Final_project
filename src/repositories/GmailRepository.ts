import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase as ambientSupabase } from "@/lib/supabase";
import type {
  Database,
  Json,
  GmailConnectionRow,
  GmailMessageInsert,
  GmailSuggestionInsert,
} from "@/types/database";
import type {
  GmailConnection,
  GmailMessage,
  GmailMessageCategory,
  GmailSuggestion,
  GmailSuggestionFilter,
} from "@/features/gmail/types";
import { readSuggestionSummary } from "@/features/gmail/summary";

// ── GmailRepository (Module 9A) ──
//
// Unlike every other repository in this codebase, Gmail data is written from
// two genuinely different contexts: a live authenticated user session
// (Settings toggles, disconnect, and every sync run — GmailSyncService is
// always triggered from an authenticated request: connect, app-open, or
// manual "Sync Now", never a detached background job) AND the ONE
// session-less privileged context, the OAuth callback (a bare GET redirect
// from Google with no ambient session at all). Repositories normally import
// the single ambient `supabase` client directly — that pattern can't cover
// the second case, so this one takes an optional client, defaulting to the
// ambient client to match every other repository's zero-arg-constructor call
// sites. The OAuth callback route constructs its own `createServiceSupabase()`
// client and passes it in; every other caller either uses the default
// ambient client (client-side reads/writes) or passes the request's own
// `requireUser(accessToken)`-derived client (server-side, e.g.
// GmailSyncService). This file itself must never import from src/server/** —
// it lives outside that import-protected path specifically so client code
// can still use it.

const CONNECTION_COLUMNS =
  "id, user_id, google_email, scope, status, auto_sync_enabled, last_synced_at, last_sync_error, next_sync_at, connected_at, created_at, updated_at";

// Includes the encrypted token + sync-engine-only fields — only ever
// requested by findConnectionForSync, called exclusively by the sync engine.
const CONNECTION_COLUMNS_FULL =
  CONNECTION_COLUMNS +
  ", refresh_token_ciphertext, refresh_token_nonce, history_id, backfill_complete, backfill_page_token, sync_lock_acquired_at";

const MESSAGE_COLUMNS =
  "id, user_id, gmail_message_id, gmail_thread_id, from_address, from_domain, subject, snippet, company_name, internal_date, category, confidence, classified_by, matched_application_id, processed_at, created_at";

const SUGGESTION_COLUMNS =
  "id, user_id, gmail_message_id, type, status, confidence, explanation, target_application_id, suggested_payload, resolved_at, resolved_action, created_at, updated_at";

/** A suggestion enriched with its linked message's display fields — what the Recruiter Inbox list renders. */
export type GmailSuggestionListItem = GmailSuggestion & {
  company_name: string | null;
  subject: string | null;
  category: GmailMessageCategory;
  /** Gmail's own external message id (NOT this row's `gmail_message_id`, which is our internal FK) — for "Open Original Email". */
  externalMessageId: string;
  /** Gmail's thread id — the grouping key behind "one application, one card". */
  threadId: string;
  /** When the source email arrived — orders the timeline inside a group. */
  receivedAt: string | null;
  /** The sender, for search-by-recruiter/email. */
  fromAddress: string | null;
  /** Gmail read state at sync time — drives the All/Unread/Read view filter. */
  isUnread: boolean;
};

/**
 * Free-text match across everything the user might search by: company, role,
 * recruiter, sender address, subject and classification. Role/recruiter live
 * in the suggestion payload's `summary` block rather than their own columns,
 * so this runs in-app instead of as a SQL filter — at per-user suggestion
 * volumes that's cheaper than the joins/indexes the alternative would need.
 */
function matchesSearch(item: GmailSuggestionListItem, term: string): boolean {
  const summary = readSuggestionSummary(item);
  const haystack = [
    item.company_name,
    item.subject,
    item.category.replace(/_/g, " "),
    item.fromAddress,
    summary?.role,
    summary?.recruiter,
    summary?.headline,
  ];
  return haystack.some((value) => value?.toLowerCase().includes(term));
}

export class GmailRepository {
  constructor(private readonly client: SupabaseClient<Database> = ambientSupabase) {}

  // ── Connections ──────────────────────────────────────────────────────────

  /** Client/UI-facing status — never selects the encrypted token columns. */
  async findConnectionByUser(userId: string): Promise<GmailConnection | null> {
    const { data, error } = await this.client
      .from("gmail_connections")
      .select(CONNECTION_COLUMNS)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw error;
    return data as GmailConnection | null;
  }

  /** Full row incl. encrypted token — only for the sync engine, never a client-facing query. */
  async findConnectionForSync(userId: string): Promise<GmailConnectionRow | null> {
    const { data, error } = await this.client
      .from("gmail_connections")
      .select(CONNECTION_COLUMNS_FULL)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw error;
    return data as GmailConnectionRow | null;
  }

  /**
   * Connect/reconnect — upserts on the UNIQUE(user_id) constraint. Called
   * exclusively from the OAuth callback route (service-role client — the
   * callback has no ambient session to authenticate an RLS-scoped write
   * with in the first place).
   */
  async upsertConnection(input: {
    user_id: string;
    google_email: string;
    scope: string;
    refresh_token_ciphertext: string;
    refresh_token_nonce: string;
    /** The caller decides whether to preserve these across a reconnect of the SAME Google account (avoids a full historical re-backfill) or reset them for a first-time/different-account connect. */
    history_id?: string | null;
    backfillComplete?: boolean;
    backfillPageToken?: string | null;
  }): Promise<GmailConnection> {
    const { data, error } = await this.client
      .from("gmail_connections")
      .upsert(
        {
          user_id: input.user_id,
          google_email: input.google_email,
          scope: input.scope,
          refresh_token_ciphertext: input.refresh_token_ciphertext,
          refresh_token_nonce: input.refresh_token_nonce,
          history_id: input.history_id ?? null,
          backfill_complete: input.backfillComplete ?? false,
          backfill_page_token: input.backfillPageToken ?? null,
          status: "connected",
          last_sync_error: null,
          sync_lock_acquired_at: null,
          connected_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      )
      .select(CONNECTION_COLUMNS)
      .single();
    if (error) throw error;
    return data as unknown as GmailConnection;
  }

  /** Settings toggle — narrow, owner-initiated update (ambient RLS-scoped client). */
  async updateAutoSync(userId: string, enabled: boolean): Promise<GmailConnection> {
    const { data, error } = await this.client
      .from("gmail_connections")
      .update({ auto_sync_enabled: enabled })
      .eq("user_id", userId)
      .select(CONNECTION_COLUMNS)
      .single();
    if (error) throw error;
    return data as unknown as GmailConnection;
  }

  /**
   * Best-effort local cleanup for Disconnect — clears the token material so
   * nothing sensitive remains stored, keeps google_email/connected_at for
   * display context. User-initiated (has a session), so this can run on the
   * ambient/RLS-scoped client — no service-role needed.
   */
  async disconnectConnection(userId: string): Promise<void> {
    const { error } = await this.client
      .from("gmail_connections")
      .update({
        status: "disconnected",
        refresh_token_ciphertext: "",
        refresh_token_nonce: "",
        history_id: null,
        backfill_complete: false,
        backfill_page_token: null,
        auto_sync_enabled: false,
        sync_lock_acquired_at: null,
      })
      .eq("user_id", userId);
    if (error) throw error;
  }

  /**
   * Atomic claim guard against two sync triggers racing (e.g. two open tabs).
   * Only the caller that gets a row back may proceed; a lock older than 5
   * minutes is treated as an abandoned run and reclaimed. One SQL statement,
   * not orchestration infrastructure.
   */
  async claimSyncLock(userId: string): Promise<boolean> {
    const staleBefore = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const nowIso = new Date().toISOString();
    const { data, error } = await this.client
      .from("gmail_connections")
      .update({ status: "syncing", sync_lock_acquired_at: nowIso })
      .eq("user_id", userId)
      .in("status", ["connected", "error"])
      .or(`sync_lock_acquired_at.is.null,sync_lock_acquired_at.lt.${staleBefore}`)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    return data !== null;
  }

  /** Releases the sync claim and records the outcome. */
  async releaseSyncLock(
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
      .from("gmail_connections")
      .update({ ...patch, sync_lock_acquired_at: null })
      .eq("user_id", userId);
    if (error) throw error;
  }

  // ── Messages ─────────────────────────────────────────────────────────────

  /** Dedup precheck — the DB UNIQUE(user_id, gmail_message_id) constraint is the hard guarantee; this avoids a wasted insert attempt. */
  async findMessageByGmailId(userId: string, gmailMessageId: string): Promise<GmailMessage | null> {
    const { data, error } = await this.client
      .from("gmail_messages")
      .select(MESSAGE_COLUMNS)
      .eq("user_id", userId)
      .eq("gmail_message_id", gmailMessageId)
      .maybeSingle();
    if (error) throw error;
    return data as GmailMessage | null;
  }

  /**
   * Prior messages in the same Gmail thread that are already matched to an
   * application — the thread-continuity signal for ApplicationMatcher.
   * Newest first, since only the most recent link matters when a thread was
   * re-matched after a role-conflict demotion.
   */
  async findMatchedMessagesByThread(
    userId: string,
    gmailThreadId: string,
  ): Promise<GmailMessage[]> {
    const { data, error } = await this.client
      .from("gmail_messages")
      .select(MESSAGE_COLUMNS)
      .eq("user_id", userId)
      .eq("gmail_thread_id", gmailThreadId)
      .not("matched_application_id", "is", null)
      .order("internal_date", { ascending: false });
    if (error) throw error;
    return (data ?? []) as unknown as GmailMessage[];
  }

  async createMessage(input: GmailMessageInsert): Promise<GmailMessage> {
    const { data, error } = await this.client
      .from("gmail_messages")
      .insert(input)
      .select(MESSAGE_COLUMNS)
      .single();
    if (error) throw error;
    return data as unknown as GmailMessage;
  }

  async findMessageById(id: string): Promise<GmailMessage | null> {
    const { data, error } = await this.client
      .from("gmail_messages")
      .select(MESSAGE_COLUMNS)
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return data as GmailMessage | null;
  }

  // ── Suggestions ──────────────────────────────────────────────────────────

  async createSuggestion(input: GmailSuggestionInsert): Promise<GmailSuggestion> {
    const { data, error } = await this.client
      .from("gmail_suggestions")
      .insert(input)
      .select(SUGGESTION_COLUMNS)
      .single();
    if (error) throw error;
    return data as unknown as GmailSuggestion;
  }

  /**
   * Minimal pending-suggestion rows for the sync engine's duplicate guard.
   * The DB's UNIQUE(user_id, gmail_message_id) stops the same *email* being
   * processed twice, but two different emails about the same opportunity
   * (an ATS confirmation and the recruiter's own note) would otherwise each
   * raise their own "create an application" suggestion — same action,
   * proposed twice. This is the read side of preventing that.
   */
  async findPendingSuggestionKeys(
    userId: string,
  ): Promise<{ type: string; target_application_id: string | null; suggested_payload: Json }[]> {
    const { data, error } = await this.client
      .from("gmail_suggestions")
      .select("type, target_application_id, suggested_payload")
      .eq("user_id", userId)
      .eq("status", "pending");
    if (error) throw error;
    return (data ?? []) as {
      type: string;
      target_application_id: string | null;
      suggested_payload: Json;
    }[];
  }

  async findSuggestionById(id: string): Promise<GmailSuggestion | null> {
    const { data, error } = await this.client
      .from("gmail_suggestions")
      .select(SUGGESTION_COLUMNS)
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return data as GmailSuggestion | null;
  }

  /**
   * The Recruiter Inbox list query. Mirrors ApplicationRepository.attachLogos'
   * batch-fetch-and-merge shape (fetch suggestions, then batch-fetch their
   * linked messages by id) rather than a PostgREST embedded join — this
   * codebase doesn't use embedded-join filtering anywhere else, and at
   * per-user data volumes a second IN() query is cheap and keeps the query
   * shape consistent with the rest of the app.
   */
  async findSuggestionsByUser(
    userId: string,
    filter: GmailSuggestionFilter,
    companySearch?: string,
  ): Promise<GmailSuggestionListItem[]> {
    let q = this.client
      .from("gmail_suggestions")
      .select(SUGGESTION_COLUMNS)
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (filter !== "all") q = q.eq("status", filter);

    const { data: suggestionRows, error } = await q;
    if (error) throw error;
    const suggestions = (suggestionRows ?? []) as unknown as GmailSuggestion[];
    if (suggestions.length === 0) return [];

    const messageIds = [...new Set(suggestions.map((s) => s.gmail_message_id))];
    const { data: messageRows, error: messageError } = await this.client
      .from("gmail_messages")
      .select(
        "id, gmail_message_id, gmail_thread_id, company_name, subject, category, internal_date, from_address, is_unread",
      )
      .in("id", messageIds);
    if (messageError) throw messageError;

    const messagesById = new Map((messageRows ?? []).map((m) => [m.id, m]));

    const items: GmailSuggestionListItem[] = suggestions
      .map((s) => {
        const message = messagesById.get(s.gmail_message_id);
        return {
          ...s,
          company_name: message?.company_name ?? null,
          subject: message?.subject ?? null,
          category: (message?.category ?? "unknown") as GmailMessageCategory,
          externalMessageId: message?.gmail_message_id ?? "",
          threadId: message?.gmail_thread_id ?? "",
          receivedAt: message?.internal_date ?? null,
          fromAddress: message?.from_address ?? null,
          // NULL predates the column (see migration 20260810000001) — treated
          // as read so old backfilled mail doesn't flood the default Unread
          // view with things the user has long since dealt with.
          isUnread: message?.is_unread === true,
        };
      })
      // A suggestion whose message somehow wasn't found (shouldn't happen —
      // ON DELETE CASCADE removes suggestions with their message) is dropped
      // rather than shown with blank context.
      .filter((item) => item.externalMessageId !== "");

    // Search now spans company, role, sender and classification rather than
    // company alone — the role and recruiter live in the payload's summary
    // block, so matching happens in-app rather than as a SQL ILIKE.
    const term = companySearch?.trim().toLowerCase();
    if (!term) return items;
    return items.filter((item) => matchesSearch(item, term));
  }

  /** Pending count for the sidebar nav badge — mirrors useSidebarCounts' other head-count queries. */
  async countPendingByUser(userId: string): Promise<number> {
    const { count, error } = await this.client
      .from("gmail_suggestions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("status", "pending");
    if (error) throw error;
    return count ?? 0;
  }

  /**
   * `finalPayload` (Review → Edit → Accept) overwrites the stored
   * `suggested_payload` with whatever values were actually used to create/
   * update the record — so a later look at "accepted" suggestions shows what
   * really happened, not the original best-effort guess.
   */
  async updateSuggestionResolution(
    id: string,
    status: "accepted" | "dismissed",
    finalPayload?: Json,
  ): Promise<GmailSuggestion> {
    const { data, error } = await this.client
      .from("gmail_suggestions")
      .update({
        status,
        resolved_action: status,
        resolved_at: new Date().toISOString(),
        ...(finalPayload !== undefined ? { suggested_payload: finalPayload } : {}),
      })
      .eq("id", id)
      .select(SUGGESTION_COLUMNS)
      .single();
    if (error) throw error;
    return data as unknown as GmailSuggestion;
  }
}
