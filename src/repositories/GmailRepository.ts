import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase as ambientSupabase } from "@/lib/supabase";
import type { Database, GmailMessageInsert } from "@/types/database";
import type { GmailMessage } from "@/features/gmail/types";

// ── GmailRepository (Module 9A) ──
//
// gmail_messages only — connection state lives in GoogleConnectionRepository,
// suggestions (Gmail- or Calendar-sourced) live in SuggestionRepository.
// Split along these seams in Module 9B once suggestions started serving two
// sources; this file's own scope is unchanged from Module 9A.
//
// Written only by GmailSyncService, through the caller's own RLS-scoped
// client — this file must never import from src/server/**, since client code
// (e.g. the Inbox's "Open Original Email" flows) also constructs it directly
// against the ambient client.

const MESSAGE_COLUMNS =
  "id, user_id, gmail_message_id, gmail_thread_id, from_address, from_domain, subject, snippet, company_name, internal_date, category, confidence, classified_by, matched_application_id, is_unread, ical_uid, processed_at, created_at";

export class GmailRepository {
  constructor(private readonly client: SupabaseClient<Database> = ambientSupabase) {}

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

  /** By-UID lookup — the Tier 1 exact-identity merge signal for calendar events (Module 9B's ApplicationMatcher extension). */
  async findMessageByIcalUid(userId: string, icalUid: string): Promise<GmailMessage | null> {
    const { data, error } = await this.client
      .from("gmail_messages")
      .select(MESSAGE_COLUMNS)
      .eq("user_id", userId)
      .eq("ical_uid", icalUid)
      .maybeSingle();
    if (error) throw error;
    return data as GmailMessage | null;
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
}
