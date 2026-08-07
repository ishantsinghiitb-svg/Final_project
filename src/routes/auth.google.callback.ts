import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { createServiceSupabase } from "@/server/supabase";
import { serverEnv, requireEnv } from "@/server/env";
import { verifySignedState } from "@/server/gmail/OAuthState";
import {
  exchangeCodeForTokens,
  GoogleOAuthError,
  GMAIL_SCOPE,
  CALENDAR_SCOPE,
} from "@/server/gmail/GoogleOAuthClient";
import { getProfile } from "@/server/gmail/GmailApiClient";
import { getPrimaryCalendar } from "@/server/calendar/CalendarApiClient";
import { encryptToken } from "@/server/gmail/TokenCrypto";
import { GoogleConnectionRepository } from "@/repositories/GoogleConnectionRepository";

// ── Google OAuth callback (Module 9A/9B) ──
//
// A bare GET redirect from Google — no ambient session exists here at all
// (this app's Supabase session is localStorage-based, not cookie-based), so
// this is the one route in the codebase that identifies its caller purely
// from a signed `state` value (see src/server/gmail/OAuthState.ts) instead
// of `requireUser(accessToken)`, and writes via the service-role client
// (createServiceSupabase()) instead of an RLS-scoped one. Mirrors the plain
// file-route `server.handlers.GET` mechanism already used by
// src/routes/sitemap[.]xml.ts, rather than TanStack Start's createServerFn
// RPC — Google's redirect was never going through that RPC format either way.
//
// ONE callback serves BOTH products (Gmail connect, Calendar connect, and
// any future "connect the other one too" click) — which product(s) this
// particular consent covered is derived from what Google's token response
// actually granted (`tokens.scope`, space-separated), not from anything the
// client declared before redirecting. That's simpler than threading intent
// through the `state` payload and more correct: it reflects reality even if
// Google silently narrows/widens what it grants.

type GoogleCallbackOutcome =
  "connected" | "access_denied" | "invalid_state" | "token_exchange_failed" | "connection_failed";

// `origin` must be passed in explicitly: unlike a browser's Response.redirect
// (which resolves a relative URL against the current document), Node's
// undici implementation — what actually runs this route in dev/on Workers —
// requires an absolute URL and throws TypeError: Invalid URL on a bare path.
function settingsRedirect(origin: string, outcome: GoogleCallbackOutcome): Response {
  const params = new URLSearchParams({ google: outcome });
  return Response.redirect(
    new URL(`/dashboard/settings?${params.toString()}`, origin).toString(),
    302,
  );
}

export const Route = createFileRoute("/auth/google/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);

        // The user declined consent, or Google itself errored out.
        if (url.searchParams.get("error")) {
          return settingsRedirect(url.origin, "access_denied");
        }

        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        if (!code || !state) return settingsRedirect(url.origin, "invalid_state");

        const stateSecret = requireEnv(
          "GOOGLE_OAUTH_STATE_SECRET",
          serverEnv.googleOAuthStateSecret,
        );
        const userId = await verifySignedState(state, stateSecret);
        if (!userId) return settingsRedirect(url.origin, "invalid_state");

        try {
          const tokens = await exchangeCodeForTokens(code);
          const grantedScopes = tokens.scope.split(/\s+/);
          const gmailGranted = grantedScopes.includes(GMAIL_SCOPE);
          const calendarGranted = grantedScopes.includes(CALENDAR_SCOPE);

          // Gmail's users.getProfile 403s without the gmail.readonly scope —
          // a user connecting Calendar alone never granted it. The Calendar
          // API has no dedicated "who am I" endpoint, but the primary
          // calendar's own `id` field IS the account's email address.
          let googleEmail: string;
          let gmailHistoryIdFromProfile: string | null = null;
          if (gmailGranted) {
            const profile = await getProfile(tokens.accessToken);
            googleEmail = profile.emailAddress;
            gmailHistoryIdFromProfile = profile.historyId;
          } else {
            const primary = await getPrimaryCalendar(tokens.accessToken);
            googleEmail = primary.id;
          }

          const encryptionKey = requireEnv(
            "GOOGLE_TOKEN_ENCRYPTION_KEY",
            serverEnv.googleTokenEncryptionKey,
          );
          const encrypted = await encryptToken(tokens.refreshToken, encryptionKey);

          const repo = new GoogleConnectionRepository(createServiceSupabase());

          // Reconnecting the SAME Google account keeps Gmail's history_id
          // checkpoint and backfill progress (avoids a full historical
          // re-scan); a different account, or a first-time connect, starts
          // fresh — GmailSyncService will paginate through it on the next
          // triggered sync (the Settings page fires "Sync Now" itself as soon
          // as it sees `?google=connected`, so this feels immediate).
          const existing = await repo.findConnectionForSync(userId);
          const sameAccount = existing?.google_email === googleEmail;

          await repo.upsertConnection({
            user_id: userId,
            google_email: googleEmail,
            scope: tokens.scope,
            refresh_token_ciphertext: encrypted.ciphertext,
            refresh_token_nonce: encrypted.nonce,
            gmailGranted,
            calendarGranted,
            gmailHistoryId: sameAccount
              ? (existing?.gmail_history_id ?? null)
              : gmailHistoryIdFromProfile,
            gmailBackfillComplete: sameAccount
              ? (existing?.gmail_backfill_complete ?? false)
              : false,
            gmailBackfillPageToken: sameAccount
              ? (existing?.gmail_backfill_page_token ?? null)
              : null,
          });

          return settingsRedirect(url.origin, "connected");
        } catch (err) {
          console.error("Google OAuth callback failed:", err instanceof Error ? err.message : err);
          if (err instanceof GoogleOAuthError)
            return settingsRedirect(url.origin, "token_exchange_failed");
          return settingsRedirect(url.origin, "connection_failed");
        }
      },
    },
  },
});
