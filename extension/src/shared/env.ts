/**
 * No validation here on purpose: this module must be importable (including
 * transitively, by the background service worker) with zero risk of
 * throwing. `chrome.runtime.onMessage.addListener` has to register
 * unconditionally — a missing/invalid Supabase config is a per-request
 * failure, not a reason for the whole message bus to never come up. See
 * `shared/supabase/client.ts` for where these are actually validated,
 * lazily, on first use.
 */
import { PRODUCTION_APP_ORIGIN } from "./constants";

export const env = {
  appEnv: import.meta.env.VITE_APP_ENV ?? "development",
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY,
  /**
   * The OfferLyst web app origin this build talks to. Baked in at BUILD time
   * by Vite (`import.meta.env`), so it is a property of the artifact, not
   * something resolved at runtime from whatever tab happens to be open.
   *
   * Used for BOTH:
   *   - navigation — `${appUrl}/dashboard/applications/<id>` etc. (see
   *     content/index.ts and popup/App.tsx), and
   *   - the privileged `/api/extension/*` fetches (see extensionApiClient.ts).
   * The previous doc comment here claimed "only used to build links, not part
   * of the auth bridge", which understated how load-bearing it is.
   *
   * Defaults to PRODUCTION, not localhost. It used to default to
   * `http://localhost:8080`, which meant a build with no VITE_APP_URL set
   * silently shipped an extension that sent real users to a dev server that
   * isn't running — the exact "extension redirects to localhost" bug. Failing
   * safe means the worst case is pointing at production, never at localhost.
   *
   * Local development overrides this via `extension/.env`
   * (VITE_APP_URL=http://localhost:8080); `extension/.env.production` pins the
   * deployed origin for `vite build`. See PRODUCTION_APP_ORIGIN in
   * ./constants.ts for the one line to change on a domain switch.
   */
  appUrl: import.meta.env.VITE_APP_URL ?? PRODUCTION_APP_ORIGIN,
} as const;
