import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { createServiceSupabase } from "@/server/supabase";
import { serverEnv, requireEnv } from "@/server/env";
import { verifySignedState } from "@/server/gmail/OAuthState";
import { exchangeCodeForTokens, GoogleOAuthError } from "@/server/gmail/GoogleOAuthClient";
import { getProfile } from "@/server/gmail/GmailApiClient";
import { encryptToken } from "@/server/gmail/TokenCrypto";
import { GmailRepository } from "@/repositories/GmailRepository";

// ── Gmail OAuth callback (Module 9A) ──
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

type GmailCallbackOutcome =
  "connected" | "access_denied" | "invalid_state" | "token_exchange_failed" | "connection_failed";

// `origin` must be passed in explicitly: unlike a browser's Response.redirect
// (which resolves a relative URL against the current document), Node's
// undici implementation — what actually runs this route in dev/on Workers —
// requires an absolute URL and throws TypeError: Invalid URL on a bare path.
function settingsRedirect(origin: string, outcome: GmailCallbackOutcome): Response {
  const params = new URLSearchParams({ gmail: outcome });
  return Response.redirect(
    new URL(`/dashboard/settings?${params.toString()}`, origin).toString(),
    302,
  );
}

export const Route = createFileRoute("/auth/gmail/callback")({
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

        const stateSecret = requireEnv("GMAIL_OAUTH_STATE_SECRET", serverEnv.gmailOAuthStateSecret);
        const userId = await verifySignedState(state, stateSecret);
        if (!userId) return settingsRedirect(url.origin, "invalid_state");

        try {
          const tokens = await exchangeCodeForTokens(code);
          const profile = await getProfile(tokens.accessToken);
          const encryptionKey = requireEnv(
            "GMAIL_TOKEN_ENCRYPTION_KEY",
            serverEnv.gmailTokenEncryptionKey,
          );
          const encrypted = await encryptToken(tokens.refreshToken, encryptionKey);

          const repo = new GmailRepository(createServiceSupabase());

          // Reconnecting the SAME Google account keeps its history_id
          // checkpoint and backfill progress (avoids a full historical
          // re-scan); a different account, or a first-time connect, starts
          // fresh from the profile's current historyId with backfill not yet
          // complete — GmailSyncService will paginate through it on the next
          // triggered sync (the Settings page fires "Sync Now" itself as soon
          // as it sees `?gmail=connected`, so this feels immediate).
          const existing = await repo.findConnectionForSync(userId);
          const sameAccount = existing?.google_email === profile.emailAddress;

          await repo.upsertConnection({
            user_id: userId,
            google_email: profile.emailAddress,
            scope: tokens.scope,
            refresh_token_ciphertext: encrypted.ciphertext,
            refresh_token_nonce: encrypted.nonce,
            history_id: sameAccount ? existing.history_id : profile.historyId,
            backfillComplete: sameAccount ? existing.backfill_complete : false,
            backfillPageToken: sameAccount ? existing.backfill_page_token : null,
          });

          return settingsRedirect(url.origin, "connected");
        } catch (err) {
          console.error("Gmail OAuth callback failed:", err instanceof Error ? err.message : err);
          if (err instanceof GoogleOAuthError)
            return settingsRedirect(url.origin, "token_exchange_failed");
          return settingsRedirect(url.origin, "connection_failed");
        }
      },
    },
  },
});
