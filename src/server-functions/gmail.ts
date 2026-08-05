import { createServerFn } from "@tanstack/react-start";
import { requireUser, createServiceSupabase } from "@/server/supabase";
import { rebuildSuggestions, type RebuildOutcome } from "@/server/gmail/SuggestionRebuilder";
import { serverEnv, requireEnv } from "@/server/env";
import { createSignedState } from "@/server/gmail/OAuthState";
import { buildConsentUrl, revokeToken } from "@/server/gmail/GoogleOAuthClient";
import { decryptToken } from "@/server/gmail/TokenCrypto";
import { GmailRepository } from "@/repositories/GmailRepository";
import { syncUser, isSyncDue, type SyncOutcome } from "@/server/gmail/GmailSyncService";
import { refreshAccessToken } from "@/server/gmail/GoogleOAuthClient";
import { getAttachment, getFullMessage } from "@/server/gmail/GmailApiClient";
import { base64Encode } from "@/server/gmail/base64";
import { parseFromHeader } from "@/server/gmail/emailParsing";
import { cleanEmailBody } from "@/server/gmail/EmailCleaner";

// ── Gmail server functions (Module 9A) ──
//
// Lives OUTSIDE src/server/** on purpose (same rationale as
// src/server-functions/resume.ts): Vite's import-protection blocks client
// imports of any "server" path, so createServerFn entry points the client
// calls directly must be defined here — the handler closures below (and
// everything they import from src/server/gmail/**) still get compiled into
// the server-only bundle.
//
// Every operation here needs a server-only secret (GOOGLE_CLIENT_SECRET /
// GMAIL_TOKEN_ENCRYPTION_KEY) or the Gmail API itself — reading connection
// status and toggling auto-sync don't, and are called directly via
// GmailService from the client instead, exactly like ApplicationService.
//
// checkAndSyncGmail / syncGmailNow are the two "app open" / "Sync Now"
// triggers from the plan's Sync Triggers section — both just call
// GmailSyncService.syncUser inside this same authenticated request; there is
// no background-execution mechanism (see GmailSyncService's header comment).

type GetConnectUrlInput = { accessToken: string };

/** Builds the Google consent URL for "Connect"/"Reconnect", bound to the caller via a signed state param. */
export const getGmailConnectUrl = createServerFn({ method: "POST" })
  .validator((data: GetConnectUrlInput) => data)
  .handler(async ({ data }): Promise<{ url: string }> => {
    const { user } = await requireUser(data.accessToken);
    const stateSecret = requireEnv("GMAIL_OAUTH_STATE_SECRET", serverEnv.gmailOAuthStateSecret);
    const state = await createSignedState(user.id, stateSecret);
    return { url: buildConsentUrl(state) };
  });

type DisconnectGmailInput = { accessToken: string };
type DisconnectGmailResult = { ok: true } | { ok: false; message: string };

/** Best-effort revoke at Google, then clears the stored (encrypted) token locally regardless of whether the revoke call succeeded. */
export const disconnectGmail = createServerFn({ method: "POST" })
  .validator((data: DisconnectGmailInput) => data)
  .handler(async ({ data }): Promise<DisconnectGmailResult> => {
    const { supabase, user } = await requireUser(data.accessToken);
    const repo = new GmailRepository(supabase);

    const connection = await repo.findConnectionForSync(user.id);
    if (!connection) return { ok: false, message: "No Gmail connection found." };

    if (connection.refresh_token_ciphertext) {
      try {
        const encryptionKey = requireEnv(
          "GMAIL_TOKEN_ENCRYPTION_KEY",
          serverEnv.gmailTokenEncryptionKey,
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
        console.error("Gmail token revoke failed:", err instanceof Error ? err.message : err);
      }
    }

    await repo.disconnectConnection(user.id);
    return { ok: true };
  });

type CheckAndSyncGmailInput = { accessToken: string };
type CheckAndSyncGmailResult = SyncOutcome | { status: "not_due" };

/** The "app open" trigger — a cheap due-check; only calls into GmailSyncService when actually due (and auto-sync is enabled). */
export const checkAndSyncGmail = createServerFn({ method: "POST" })
  .validator((data: CheckAndSyncGmailInput) => data)
  .handler(async ({ data }): Promise<CheckAndSyncGmailResult> => {
    const authed = await requireUser(data.accessToken);
    const repo = new GmailRepository(authed.supabase);
    const connection = await repo.findConnectionForSync(authed.user.id);
    if (!connection) return { status: "skipped", reason: "not_connected" };
    if (!isSyncDue(connection)) return { status: "not_due" };
    return syncUser(authed);
  });

type SyncGmailNowInput = { accessToken: string };

/** The manual "Sync Now" trigger — always runs, regardless of the due-check (that's the point of a manual override). */
export const syncGmailNow = createServerFn({ method: "POST" })
  .validator((data: SyncGmailNowInput) => data)
  .handler(async ({ data }): Promise<SyncOutcome> => {
    const authed = await requireUser(data.accessToken);
    return syncUser(authed);
  });

type RebuildSuggestionsInput = { accessToken: string };
type RebuildSuggestionsResult =
  { ok: true; outcome: RebuildOutcome } | { ok: false; message: string };

/**
 * DEVELOPMENT-ONLY. Deletes this user's gmail_suggestions and regenerates
 * them by re-running the current classifier over already-stored
 * gmail_messages. Never deletes messages, never calls the Gmail API, never
 * touches the OAuth connection or sync checkpoint.
 *
 * Guarded on the SERVER, not just hidden in the UI: a hidden button is not
 * an access control, and this endpoint deletes rows. `import.meta.env.DEV`
 * is statically false in a production build, so the guard also lets the
 * bundler drop the body entirely rather than shipping a live destructive
 * endpoint that merely refuses at runtime.
 */
export const rebuildGmailSuggestions = createServerFn({ method: "POST" })
  .validator((data: RebuildSuggestionsInput) => data)
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

type FetchMessageBodyInput = { accessToken: string; gmailMessageRowId: string };

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
  .validator((data: FetchMessageBodyInput) => data)
  .handler(async ({ data }): Promise<FetchMessageBodyResult> => {
    const authed = await requireUser(data.accessToken);
    try {
      const repo = new GmailRepository(authed.supabase);
      const connection = await repo.findConnectionForSync(authed.user.id);
      if (!connection) return { ok: false, message: "Gmail is not connected." };

      const message = await repo.findMessageById(data.gmailMessageRowId);
      if (!message || message.user_id !== authed.user.id) {
        return { ok: false, message: "Email not found." };
      }

      const encryptionKey = requireEnv(
        "GMAIL_TOKEN_ENCRYPTION_KEY",
        serverEnv.gmailTokenEncryptionKey,
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

type FetchAttachmentBytesInput = {
  accessToken: string;
  gmailMessageRowId: string;
  gmailAttachmentId: string;
};
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
  .validator((data: FetchAttachmentBytesInput) => data)
  .handler(async ({ data }): Promise<FetchAttachmentBytesResult> => {
    const authed = await requireUser(data.accessToken);
    try {
      const repo = new GmailRepository(authed.supabase);
      const connection = await repo.findConnectionForSync(authed.user.id);
      if (!connection) return { ok: false, message: "Gmail is not connected." };

      const message = await repo.findMessageById(data.gmailMessageRowId);
      if (!message || message.user_id !== authed.user.id) {
        return { ok: false, message: "Email not found." };
      }

      const encryptionKey = requireEnv(
        "GMAIL_TOKEN_ENCRYPTION_KEY",
        serverEnv.gmailTokenEncryptionKey,
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
