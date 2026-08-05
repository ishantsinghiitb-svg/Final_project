import type { Json } from "@/types/database";

// ── Module 9A: Gmail Intelligence — client-facing domain types ──
// Server-only concerns (encrypted token columns, the sync-engine's history_id
// checkpoint, sync_lock_acquired_at) intentionally do NOT appear here — they
// stay on the DB Row types in src/types/database.ts and are only ever read by
// src/server/gmail/*, never sent to the client.

export type GmailConnectionStatus =
  "connected" | "syncing" | "disconnected" | "error" | "needs_reauth";

/** Client/UI-facing connection status — never includes token material. */
export type GmailConnection = {
  id: string;
  user_id: string;
  google_email: string;
  status: GmailConnectionStatus;
  auto_sync_enabled: boolean;
  last_synced_at: string | null;
  last_sync_error: string | null;
  connected_at: string;
};

/**
 * Email classification vocabulary. Mirrors the CHECK constraint on
 * `gmail_messages.category` (see migration 20260809000001) — adding a value
 * here without adding it there will fail at insert time.
 *
 * Two catch-alls, deliberately distinct:
 *   - `unknown` — classification wasn't confident. Produces NO suggestion.
 *   - `general_recruiter_communication` — confidently recruiter mail that
 *     fits no more specific category. Can produce a suggestion.
 */
export type GmailMessageCategory =
  // Application lifecycle
  | "application_submitted"
  | "application_confirmation"
  | "recruiter_viewed"
  | "recruiter_reply"
  | "application_update"
  // Assessment
  | "oa_invitation"
  | "online_assessment"
  | "assignment"
  // Interview lifecycle
  | "interview_invitation"
  | "interview_scheduled"
  | "interview_rescheduled"
  | "interview_reminder"
  // Outcome
  | "offer"
  | "offer_accepted"
  | "offer_declined"
  | "waitlist"
  | "rejection"
  // Post-offer formalities
  | "background_verification"
  | "reference_check"
  | "joining_formalities"
  // Catch-alls
  | "follow_up_required"
  | "general_recruiter_communication"
  | "unknown";

export type GmailMessage = {
  id: string;
  user_id: string;
  gmail_message_id: string;
  gmail_thread_id: string;
  from_address: string;
  from_domain: string;
  subject: string | null;
  /** Gmail's own pre-truncated snippet — the full email body is never persisted. */
  snippet: string | null;
  company_name: string | null;
  internal_date: string;
  category: GmailMessageCategory;
  confidence: number;
  classified_by: "rule" | "ai";
  matched_application_id: string | null;
  processed_at: string;
  created_at: string;
};

/**
 * Five action-oriented suggestion types (not many internal ones — see the
 * Module 9A plan). Each covers more than one internal scenario:
 *   - update_application: any status move (offer, rejection, assessment
 *     detected, generic update) — the specific narrative lives in
 *     `explanation`, not the type.
 *   - create_interview: both a brand-new interview and a reschedule/update
 *     of one Gmail already linked — `suggested_payload.existingInterviewId`
 *     set means update, absent means create.
 *   - add_reminder: follow-up / OA deadline / offer-expiry — the specific
 *     application_reminders.type travels in `suggested_payload`.
 */
export type GmailSuggestionType =
  | "create_application"
  | "update_application"
  | "create_interview"
  | "add_reminder"
  | "import_attachment";

export type GmailSuggestionStatus = "pending" | "accepted" | "dismissed" | "expired" | "superseded";

export type GmailSuggestion = {
  id: string;
  user_id: string;
  gmail_message_id: string;
  type: GmailSuggestionType;
  status: GmailSuggestionStatus;
  confidence: number;
  /** Human-readable "why this was detected" — always shown in the UI, never hidden behind a click. */
  explanation: string;
  target_application_id: string | null;
  /** Shape depends on `type` — see the per-type payload builders in src/server/gmail/. */
  suggested_payload: Json;
  resolved_at: string | null;
  resolved_action: "accepted" | "dismissed" | null;
  created_at: string;
  updated_at: string;
};

/** The 4 filters the Recruiter Inbox exposes — "expired"/"superseded" are
 *  internal bookkeeping states, not user-facing filter options. */
export type GmailSuggestionFilter = "all" | "pending" | "accepted" | "dismissed";
