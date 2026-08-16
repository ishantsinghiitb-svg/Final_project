import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireUser, createServiceSupabase } from "@/server/supabase";
import { rebuildSuggestions, type RebuildOutcome } from "@/server/gmail/SuggestionRebuilder";
import { serverEnv, requireEnv } from "@/server/env";
import { createSignedState } from "@/server/gmail/OAuthState";
import {
  buildConsentUrl,
  revokeToken,
  GMAIL_SCOPE,
  CALENDAR_SCOPE,
} from "@/server/gmail/GoogleOAuthClient";
import { decryptToken } from "@/server/gmail/TokenCrypto";
import { GmailRepository } from "@/repositories/GmailRepository";
import {
  GoogleConnectionRepository,
  type GoogleProduct,
} from "@/repositories/GoogleConnectionRepository";
import { CalendarRepository } from "@/repositories/CalendarRepository";
import { SuggestionRepository } from "@/repositories/SuggestionRepository";
import { syncUser, isSyncDue, type SyncOutcome } from "@/server/gmail/GmailSyncService";
import { refreshAccessToken } from "@/server/gmail/GoogleOAuthClient";
import { getAttachment, getFullMessage } from "@/server/gmail/GmailApiClient";
import { base64Encode } from "@/server/gmail/base64";
import { parseFromHeader } from "@/server/gmail/emailParsing";
import { cleanEmailBody } from "@/server/gmail/EmailCleaner";
// Aliased: several handlers below destructure Google's own OAuth access
// token into a local `accessToken` (a different concept from the caller's
// Supabase access token this schema validates), so the plain name would
// shadow confusingly.
import { accessToken as accessTokenSchema, uuid, validate } from "./validation";

const GoogleProductSchema = z.enum(["gmail", "calendar"]);

// ── Google (Gmail + Calendar) server functions (Module 9A/9B) ──
//
// Lives OUTSIDE src/server/** on purpose (same rationale as
// src/server-functions/resume.ts): Vite's import-protection blocks client
// imports of any "server" path, so createServerFn entry points the client
// calls directly must be defined here — the handler closures below (and
// everything they import from src/server/gmail/** and src/server/calendar/**)
// still get compiled into the server-only bundle.
//
// Every operation here needs a server-only secret (GOOGLE_CLIENT_SECRET /
// GOOGLE_TOKEN_ENCRYPTION_KEY) or the Gmail/Calendar API itself — reading
// connection status and toggling auto-sync don't, and are called directly
// via GoogleService/GmailService from the client instead, exactly like
// ApplicationService.
//
// checkAndSyncGmail / syncGmailNow are the "app open" / "Sync Now" Gmail
// triggers from the plan's Sync Triggers section — both just call
// GmailSyncService.syncUser inside this same authenticated request; there is
// no background-execution mechanism (see GmailSyncService's header comment).
// Calendar's equivalent triggers land alongside CalendarSyncService.

const GetConnectUrlSchema = z.object({
  accessToken: accessTokenSchema,
  product: GoogleProductSchema,
});

const SCOPE_FOR: Record<GoogleProduct, string> = {
  gmail: GMAIL_SCOPE,
  calendar: CALENDAR_SCOPE,
};

/** Builds the Google consent URL for "Connect"/"Reconnect" a single product, bound to the caller via a signed state param. `include_granted_scopes` (see GoogleOAuthClient) means this never narrows whatever the other product already has. */
export const getGoogleConnectUrl = createServerFn({ method: "POST" })
  .validator((data: unknown) => validate(GetConnectUrlSchema, data))
  .handler(async ({ data }): Promise<{ url: string }> => {
    const { user } = await requireUser(data.accessToken);
    const stateSecret = requireEnv("GOOGLE_OAUTH_STATE_SECRET", serverEnv.googleOAuthStateSecret);
    const state = await createSignedState(user.id, stateSecret);
    return { url: buildConsentUrl(state, [SCOPE_FOR[data.product]]) };
  });

const DisconnectGoogleProductSchema = z.object({
  accessToken: accessTokenSchema,
  product: GoogleProductSchema,
});
type DisconnectGoogleProductResult = { ok: true } | { ok: false; message: string };

/**
 * Best-effort revoke at Google, then clears this PRODUCT's local sync state
 * regardless of whether the revoke call succeeded. The shared refresh token
 * itself is only cleared once BOTH products are disconnected (see
 * GoogleConnectionRepository.disconnectProduct) — disconnecting Gmail alone
 * must not kill an active Calendar connection, and vice versa.
 */
export const disconnectGoogleProduct = createServerFn({ method: "POST" })
  .validator((data: unknown) => validate(DisconnectGoogleProductSchema, data))
  .handler(async ({ data }): Promise<DisconnectGoogleProductResult> => {
    const { supabase, user } = await requireUser(data.accessToken);
    const repo = new GoogleConnectionRepository(supabase);

    const connection = await repo.findConnectionForSync(user.id);
    if (!connection) return { ok: false, message: "No Google connection found." };

    const otherStillConnected =
      data.product === "gmail"
        ? connection.calendar_status !== "disconnected"
        : connection.gmail_status !== "disconnected";

    if (!otherStillConnected && connection.refresh_token_ciphertext) {
      try {
        const encryptionKey = requireEnv(
          "GOOGLE_TOKEN_ENCRYPTION_KEY",
          serverEnv.googleTokenEncryptionKey,
        );
        const refreshToken = await decryptToken(
          {
            ciphertext: connection.refresh_token_ciphertext,
            nonce: connection.refresh_token_nonce,
          },
          encryptionKey,
        );
        await revokeToken(refreshToken);
      } catch (err) {
        // Best-effort — proceed with local cleanup even if Google's revoke call fails
        // (e.g. the token was already revoked on Google's side).
        console.error("Google token revoke failed:", err instanceof Error ? err.message : err);
      }
    }

    // Calendar disconnect additionally removes the candidate ledger (Q12,
    // Module 9B plan §6) — Gmail's own disconnect never deletes gmail_messages,
    // this is deliberately different because Calendar's local data is purely
    // a sync artifact with no independent value once disconnected. Order
    // matters: calendar-only suggestions first (deleting calendar_events out
    // from under a surviving calendar-only suggestion — pending, accepted,
    // or dismissed — would null its only source FK and violate
    // suggestions_has_source_check; see deleteCalendarOnlySuggestions), then
    // the events themselves, then the sync checkpoint so a reconnect
    // re-backfills cleanly instead of resuming a now-meaningless incremental
    // token.
    if (data.product === "calendar") {
      await new SuggestionRepository(supabase).deleteCalendarOnlySuggestions(user.id);
      const calendarRepo = new CalendarRepository(supabase);
      await calendarRepo.deleteAllEventsForUser(user.id);
      await calendarRepo.deleteSyncState(user.id);
    }

    await repo.disconnectProduct(user.id, data.product);
    return { ok: true };
  });

const AccessTokenOnlySchema = z.object({ accessToken: accessTokenSchema });
type CheckAndSyncGmailResult = SyncOutcome | { status: "not_due" };

/** The "app open" trigger — a cheap due-check; only calls into GmailSyncService when actually due (and auto-sync is enabled). */
export const checkAndSyncGmail = createServerFn({ method: "POST" })
  .validator((data: unknown) => validate(AccessTokenOnlySchema, data))
  .handler(async ({ data }): Promise<CheckAndSyncGmailResult> => {
    const authed = await requireUser(data.accessToken);
    const repo = new GoogleConnectionRepository(authed.supabase);
    const connection = await repo.findConnectionForSync(authed.user.id);
    if (!connection) return { status: "skipped", reason: "not_connected" };
    if (!isSyncDue(connection)) return { status: "not_due" };
    return syncUser(authed);
  });

/** The manual "Sync Now" trigger — always runs, regardless of the due-check (that's the point of a manual override). */
export const syncGmailNow = createServerFn({ method: "POST" })
  .validator((data: unknown) => validate(AccessTokenOnlySchema, data))
  .handler(async ({ data }): Promise<SyncOutcome> => {
    const authed = await requireUser(data.accessToken);
    return syncUser(authed);
  });

type RebuildSuggestionsResult =
  { ok: true; outcome: RebuildOutcome } | { ok: false; message: string };

/**
 * DEVELOPMENT-ONLY. Deletes this user's Gmail-sourced suggestions and
 * regenerates them by re-running the current classifier over already-stored
 * gmail_messages. Never deletes messages, never calls the Gmail API, never
 * touches the OAuth connection or sync checkpoint, never touches a
 * calendar-sourced suggestion.
 *
 * Guarded on the SERVER, not just hidden in the UI: a hidden button is not
 * an access control, and this endpoint deletes rows. `import.meta.env.DEV`
 * is statically false in a production build, so the guard also lets the
 * bundler drop the body entirely rather than shipping a live destructive
 * endpoint that merely refuses at runtime.
 */
export const rebuildGmailSuggestions = createServerFn({ method: "POST" })
  .validator((data: unknown) => validate(AccessTokenOnlySchema, data))
  .handler(async ({ data }): Promise<RebuildSuggestionsResult> => {
    if (!import.meta.env.DEV) {
      return { ok: false, message: "This utility is only available in development." };
    }
    try {
      const authed = await requireUser(data.accessToken);
      const outcome = await rebuildSuggestions(authed, createServiceSupabase());
      return { ok: true, outcome };
    } catch (err) {
      return {
        ok: false,
        message: err instanceof Error ? err.message : "Failed to rebuild suggestions.",
      };
    }
  });

const FetchMessageBodySchema = z.object({
  accessToken: accessTokenSchema,
  gmailMessageRowId: uuid,
});

export type GmailMessageBody = {
  subject: string | null;
  fromDisplay: string | null;
  fromAddress: string | null;
  toAddress: string | null;
  dateIso: string | null;
  /** Plain-text body, signatures/quoted-reply/unsubscribe blocks already stripped. */
  bodyText: string;
  links: { label: string; url: string }[];
  attachments: { gmailAttachmentId: string; filename: string; mimeType: string; size: number }[];
};

type FetchMessageBodyResult = { ok: true; body: GmailMessageBody } | { ok: false; message: string };

/**
 * Reads one email's full content on demand, for the Review panel.
 *
 * The body is deliberately NOT stored (gmail_messages keeps only Gmail's own
 * short snippet — see the Module 9A privacy model), so showing the real email
 * in-app means fetching it live, exactly like attachment bytes are fetched at
 * accept-time rather than scan-time. Nothing here is persisted.
 *
 * Returns plain text only, never HTML: the panel renders it as text, so a
 * hostile email can't inject markup or script into the dashboard.
 */
export const fetchGmailMessageBody = createServerFn({ method: "POST" })
  .validator((data: unknown) => validate(FetchMessageBodySchema, data))
  .handler(async ({ data }): Promise<FetchMessageBodyResult> => {
    const authed = await requireUser(data.accessToken);
    try {
      const connectionRepo = new GoogleConnectionRepository(authed.supabase);
      const messageRepo = new GmailRepository(authed.supabase);
      const connection = await connectionRepo.findConnectionForSync(authed.user.id);
      if (!connection) return { ok: false, message: "Gmail is not connected." };

      const message = await messageRepo.findMessageById(data.gmailMessageRowId);
      if (!message || message.user_id !== authed.user.id) {
        return { ok: false, message: "Email not found." };
      }

      const encryptionKey = requireEnv(
        "GOOGLE_TOKEN_ENCRYPTION_KEY",
        serverEnv.googleTokenEncryptionKey,
      );
      const refreshToken = await decryptToken(
        { ciphertext: connection.refresh_token_ciphertext, nonce: connection.refresh_token_nonce },
        encryptionKey,
      );
      const { accessToken } = await refreshAccessToken(refreshToken);

      const full = await getFullMessage(accessToken, message.gmail_message_id);
      const cleaned = cleanEmailBody(full.bodyText);

      return {
        ok: true,
        body: {
          subject: full.headers.subject ?? message.subject,
          fromDisplay: parseFromHeader(full.headers.from ?? "").displayName,
          fromAddress: parseFromHeader(full.headers.from ?? "").address || message.from_address,
          toAddress: full.headers.to ?? null,
          dateIso: message.internal_date,
          bodyText: cleaned.text,
          links: cleaned.links,
          attachments: full.attachments.map((a) => ({
            gmailAttachmentId: a.attachmentId,
            filename: a.filename,
            mimeType: a.mimeType,
            size: a.size,
          })),
        },
      };
    } catch (err) {
      return {
        ok: false,
        message: err instanceof Error ? err.message : "Failed to load this email from Gmail.",
      };
    }
  });

const FetchAttachmentBytesSchema = z.object({
  accessToken: accessTokenSchema,
  gmailMessageRowId: uuid,
  // Gmail's own opaque attachment id — not one of our uuids.
  gmailAttachmentId: z.string().min(1).max(500),
});
type FetchAttachmentBytesResult = { ok: true; base64Data: string } | { ok: false; message: string };

/**
 * The ONE piece of "Import Attachment" accept that needs a server-only
 * secret — fetching the raw bytes from Gmail with a freshly refreshed
 * access token. Returns just the base64-encoded bytes; the actual Storage
 * upload + application_attachments row (src/services/GmailService.ts,
 * acceptImportAttachment) goes through the existing AttachmentService,
 * unchanged, back on the client where a real session already exists.
 */
export const fetchGmailAttachmentBytes = createServerFn({ method: "POST" })
  .validator((data: unknown) => validate(FetchAttachmentBytesSchema, data))
  .handler(async ({ data }): Promise<FetchAttachmentBytesResult> => {
    const authed = await requireUser(data.accessToken);
    try {
      const connectionRepo = new GoogleConnectionRepository(authed.supabase);
      const messageRepo = new GmailRepository(authed.supabase);
      const connection = await connectionRepo.findConnectionForSync(authed.user.id);
      if (!connection) return { ok: false, message: "Gmail is not connected." };

      const message = await messageRepo.findMessageById(data.gmailMessageRowId);
      if (!message || message.user_id !== authed.user.id) {
        return { ok: false, message: "Email not found." };
      }

      const encryptionKey = requireEnv(
        "GOOGLE_TOKEN_ENCRYPTION_KEY",
        serverEnv.googleTokenEncryptionKey,
      );
      const refreshToken = await decryptToken(
        { ciphertext: connection.refresh_token_ciphertext, nonce: connection.refresh_token_nonce },
        encryptionKey,
      );
      const { accessToken } = await refreshAccessToken(refreshToken);

      const attachment = await getAttachment(
        accessToken,
        message.gmail_message_id,
        data.gmailAttachmentId,
      );
      return { ok: true, base64Data: base64Encode(attachment.data) };
    } catch (err) {
      return {
        ok: false,
        message: err instanceof Error ? err.message : "Failed to fetch the attachment from Gmail.",
      };
    }
  });
