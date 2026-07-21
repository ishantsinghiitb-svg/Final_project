import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { serverEnv, requireEnv } from "./env";

// ── Server-side Supabase clients (Module 6A) ──
//
// ⚠️ SERVER-ONLY. The AI + parse server functions run on the Cloudflare Worker
// and must NOT ship provider keys or the service-role key to the client.
//
// `createServerSupabase(accessToken)` builds a per-request client authenticated
// as the calling user (their JWT in the Authorization header) so RLS remains
// the single source of truth even server-side — exactly like the client path.

export type ServerSupabase = SupabaseClient<Database>;

export function createServerSupabase(accessToken: string): ServerSupabase {
  const url = requireEnv("SUPABASE_URL", serverEnv.supabaseUrl);
  const anonKey = requireEnv("SUPABASE_ANON_KEY", serverEnv.supabaseAnonKey);

  return createClient<Database>(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

/** Service-role client — bypasses RLS. Reserved for narrow privileged paths. */
export function createServiceSupabase(): ServerSupabase {
  const url = requireEnv("SUPABASE_URL", serverEnv.supabaseUrl);
  const serviceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY", serverEnv.supabaseServiceRoleKey);

  return createClient<Database>(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export type AuthedContext = {
  supabase: ServerSupabase;
  user: User;
  accessToken: string;
};

/**
 * Validate the caller's access token and return an authed context.
 * Throws if the token is missing or invalid — callers surface a structured error.
 */
export async function requireUser(accessToken: string | undefined | null): Promise<AuthedContext> {
  if (!accessToken) {
    throw new Error("Not authenticated: missing access token");
  }
  const supabase = createServerSupabase(accessToken);
  const { data, error } = await supabase.auth.getUser(accessToken);
  if (error || !data.user) {
    throw new Error("Not authenticated: invalid session");
  }
  return { supabase, user: data.user, accessToken };
}
