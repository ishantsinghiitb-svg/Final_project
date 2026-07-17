/**
 * No validation here on purpose: this module must be importable (including
 * transitively, by the background service worker) with zero risk of
 * throwing. `chrome.runtime.onMessage.addListener` has to register
 * unconditionally — a missing/invalid Supabase config is a per-request
 * failure, not a reason for the whole message bus to never come up. See
 * `shared/supabase/client.ts` for where these are actually validated,
 * lazily, on first use.
 */
export const env = {
  appEnv: import.meta.env.VITE_APP_ENV ?? "development",
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY,
  /** Used only to build "Open in NextOffer" links — not part of the auth bridge. */
  appUrl: import.meta.env.VITE_APP_URL ?? "http://localhost:8080",
} as const;
