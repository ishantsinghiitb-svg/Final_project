import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { env } from "../env";

/**
 * The background service worker has no `window`/`localStorage`, so
 * supabase-js can't manage its own persisted session or token refresh here.
 * `persistSession`/`autoRefreshToken` are off; the session is bridged in
 * manually via `session-store.ts` (`chrome.storage.local` + `setSession`)
 * every time the (ephemeral) service worker wakes up.
 *
 * Built lazily, on first actual use, rather than at module-import time.
 * `background/service-worker.ts` imports this module transitively (via
 * `session-store.ts` and the handler modules) before it registers
 * `chrome.runtime.onMessage.addListener` — if construction happened eagerly
 * here and threw (e.g. missing env vars), that exception would propagate up
 * through the whole import chain and the listener would never register,
 * breaking every message type, not just Supabase-dependent ones.
 */
let client: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (client) return client;

  if (!env.supabaseUrl || !env.supabaseAnonKey) {
    throw new Error(
      "Missing Supabase environment variables. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in extension/.env.",
    );
  }

  client = createClient(env.supabaseUrl, env.supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  return client;
}
