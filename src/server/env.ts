// ── Server-only environment (Module 6A) ──
//
// ⚠️ SERVER-ONLY. Never import this from client code — it reads provider API
// keys. On Cloudflare Workers (Nitro) these are `wrangler secret`s exposed via
// process.env; in dev they come from the Node process env. Supabase URL/anon
// key are the isomorphic VITE_ vars (not secrets).

function fromProcess(name: string): string {
  // process may be polyfilled/undefined depending on runtime; guard access.
  return (typeof process !== "undefined" && process.env?.[name]) || "";
}

export const serverEnv = {
  // Isomorphic (also on client) — safe.
  supabaseUrl:
    (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? fromProcess("SUPABASE_URL"),
  supabaseAnonKey:
    (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ??
    fromProcess("SUPABASE_ANON_KEY"),

  // Server-only secrets.
  // Migrating from Supabase's legacy JWT-based service_role key to the newer
  // sb_secret_... API key format — SUPABASE_SECRET_KEY is canonical,
  // SUPABASE_SERVICE_ROLE_KEY is read as a fallback so this deploys safely
  // regardless of which order the code change and the Cloudflare secret
  // land in. Remove the fallback once SUPABASE_SECRET_KEY is confirmed
  // live everywhere and the old plaintext Variable is deleted.
  supabaseServiceRoleKey:
    fromProcess("SUPABASE_SECRET_KEY") || fromProcess("SUPABASE_SERVICE_ROLE_KEY"),
  openaiApiKey: fromProcess("OPENAI_API_KEY"),
  anthropicApiKey: fromProcess("ANTHROPIC_API_KEY"),
  geminiApiKey: fromProcess("GEMINI_API_KEY"),

  // ── Module 9A/9B: Gmail + Calendar Intelligence (server-only) ──
  // One Google OAuth client, one connection per user, two incrementally
  // authorized scopes (Gmail, Calendar) — see GoogleOAuthClient.ts.
  googleClientId: fromProcess("GOOGLE_CLIENT_ID"),
  googleClientSecret: fromProcess("GOOGLE_CLIENT_SECRET"),
  googleOAuthRedirectUri: fromProcess("GOOGLE_OAUTH_REDIRECT_URI"),
  // Encrypts the stored Google refresh token at rest (AES-256-GCM) — kept
  // separate from googleOAuthStateSecret on purpose, one secret per purpose.
  // Renamed from GMAIL_TOKEN_ENCRYPTION_KEY in Module 9B (the token it
  // encrypts now covers both products); old name read as a fallback so an
  // already-configured deployment doesn't need an env change to keep working.
  googleTokenEncryptionKey:
    fromProcess("GOOGLE_TOKEN_ENCRYPTION_KEY") || fromProcess("GMAIL_TOKEN_ENCRYPTION_KEY"),
  // Signs the stateless OAuth `state` CSRF parameter (see
  // src/server/gmail/OAuthState.ts) — never reused for token encryption.
  // Renamed from GMAIL_OAUTH_STATE_SECRET in Module 9B, same fallback.
  googleOAuthStateSecret:
    fromProcess("GOOGLE_OAUTH_STATE_SECRET") || fromProcess("GMAIL_OAUTH_STATE_SECRET"),

  // Comma-separated allowlist of admin email addresses — the single gate
  // behind every admin capability in the app (job crawler admin panel,
  // Module 13 · Phase 5 Admin Platform). See
  // src/server/jobIntelligence/adminAuth.ts#requireAdmin. There is no
  // `is_admin` DB column/role in this project; a small env allowlist
  // checked against the authenticated caller's verified email is
  // intentionally simple and matches the "no roles/permissions system"
  // scope of this project.
  adminEmails: fromProcess("ADMIN_EMAILS"),
} as const;

export function requireEnv(name: string, value: string): string {
  if (!value) {
    throw new Error(`Missing required server env: ${name}`);
  }
  return value;
}
