// ── Google OAuth 2.0 client (Module 9A/9B) ──
//
// Hand-rolled `fetch` against Google's OAuth endpoints — no `googleapis`/
// `google-auth-library` dependency (not installed in this repo, and that
// package is Node-oriented/heavy for a Cloudflare Workers runtime). This is
// a separate, dedicated OAuth connection for Gmail/Calendar API access —
// distinct from Supabase Auth's "Sign in with Google"
// (src/services/AuthService.ts), which is login identity only and doesn't
// durably persist a scoped refresh token.
//
// ONE connection, TWO independently-grantable, incrementally authorized
// scopes: connecting either product requests only that product's scope, with
// `include_granted_scopes=true` so Google unions it with whatever was already
// granted (rather than each connect silently narrowing the other product's
// access). This is why every consent URL now takes an explicit `scopes`
// array instead of a single hardcoded scope.

import { requireEnv, serverEnv } from "@/server/env";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";

// Read-only, and *only* readonly — see the plan's OAuth Flow section for why
// gmail.modify/gmail.metadata are each wrong for this feature.
export const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";

// Read-only events access — narrower than calendar.readonly (which also
// exposes the calendar LIST itself, needed only for a future multi-calendar
// picker, not V1's primary-calendar-only sync). See the Module 9B plan §2 for
// why this stays read-only: no write scope is requested, so nothing this app
// does can ever create/modify/delete an event in the user's real calendar.
export const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events.readonly";

export class GoogleOAuthError extends Error {
  /** Google's OAuth error code, e.g. "invalid_grant" — callers use this to
   *  distinguish a terminal (refresh token revoked/expired, needs reconnect)
   *  failure from a transient one. */
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "GoogleOAuthError";
    this.code = code;
  }
}

async function parseErrorResponse(response: Response): Promise<GoogleOAuthError> {
  const body = await response.text();
  try {
    const parsed = JSON.parse(body) as { error?: string; error_description?: string };
    return new GoogleOAuthError(
      parsed.error ?? "unknown_error",
      parsed.error_description ?? `Google OAuth request failed (${response.status}).`,
    );
  } catch {
    return new GoogleOAuthError(
      "unknown_error",
      `Google OAuth request failed (${response.status}): ${body}`,
    );
  }
}

function credentials() {
  return {
    clientId: requireEnv("GOOGLE_CLIENT_ID", serverEnv.googleClientId),
    clientSecret: requireEnv("GOOGLE_CLIENT_SECRET", serverEnv.googleClientSecret),
    redirectUri: requireEnv("GOOGLE_OAUTH_REDIRECT_URI", serverEnv.googleOAuthRedirectUri),
  };
}

/**
 * Builds the URL to redirect the browser to for the Google consent screen.
 * `scopes` is exactly what's being newly requested for THIS click (e.g. just
 * `[CALENDAR_SCOPE]` when Gmail is already connected and the user clicks
 * "Connect" under Calendar) — `include_granted_scopes` tells Google to union
 * it with whatever this user already granted, rather than treating it as the
 * complete desired set.
 */
export function buildConsentUrl(state: string, scopes: string[]): string {
  const { clientId, redirectUri } = credentials();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: scopes.join(" "),
    access_type: "offline",
    include_granted_scopes: "true",
    // Forces Google to re-issue a refresh token even on a repeat consent —
    // without this, reconnecting an already-once-authorized account can
    // silently omit refresh_token from the response.
    prompt: "consent",
    state,
  });
  return `${AUTH_URL}?${params.toString()}`;
}

export type TokenExchangeResult = {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  scope: string;
};

/** Exchanges the `code` from the OAuth callback for an access + refresh token pair. */
export async function exchangeCodeForTokens(code: string): Promise<TokenExchangeResult> {
  const { clientId, clientSecret, redirectUri } = credentials();
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }).toString(),
  });
  if (!response.ok) throw await parseErrorResponse(response);

  const data = (await response.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    scope: string;
  };
  if (!data.refresh_token) {
    // Happens if `prompt=consent` was somehow bypassed (e.g. the user had
    // already granted this exact scope very recently) — without a refresh
    // token we can't sync in the background, so treat it as a hard failure
    // rather than silently connecting a session that will die in an hour.
    throw new GoogleOAuthError(
      "missing_refresh_token",
      "Google did not return a refresh token. Please try connecting again.",
    );
  }

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
    scope: data.scope,
  };
}

export type AccessTokenResult = { accessToken: string; expiresIn: number };

/** Mints a fresh access token from a stored refresh token. Throws `GoogleOAuthError("invalid_grant", ...)` if the refresh token itself has been revoked/expired. */
export async function refreshAccessToken(refreshToken: string): Promise<AccessTokenResult> {
  const { clientId, clientSecret } = credentials();
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
    }).toString(),
  });
  if (!response.ok) throw await parseErrorResponse(response);

  const data = (await response.json()) as { access_token: string; expires_in: number };
  return { accessToken: data.access_token, expiresIn: data.expires_in };
}

/** Best-effort revoke — callers should proceed with local cleanup even if this throws. */
export async function revokeToken(token: string): Promise<void> {
  const response = await fetch(REVOKE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token }).toString(),
  });
  if (!response.ok) throw await parseErrorResponse(response);
}
