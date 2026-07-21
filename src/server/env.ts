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
  supabaseServiceRoleKey: fromProcess("SUPABASE_SERVICE_ROLE_KEY"),
  openaiApiKey: fromProcess("OPENAI_API_KEY"),
  anthropicApiKey: fromProcess("ANTHROPIC_API_KEY"),
  geminiApiKey: fromProcess("GEMINI_API_KEY"),
} as const;

export function requireEnv(name: string, value: string): string {
  if (!value) {
    throw new Error(`Missing required server env: ${name}`);
  }
  return value;
}
