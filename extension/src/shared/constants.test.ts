import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  LOCAL_APP_ORIGIN,
  PRODUCTION_APP_ORIGIN,
  TRUSTED_APP_ORIGINS,
  WORKER_APP_ORIGIN,
} from "./constants";

// ── Production extension configuration ──
//
// The auth bridge (content/auth-bridge/session-reader.ts) only runs on the
// origins in TRUSTED_APP_ORIGINS. If the origin users actually sign in on is
// missing from that list, no session is ever bridged and every server call
// from the extension fails as unauthenticated — which is how a domain change
// silently breaks the extension. These lock that down.

const EXTENSION_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

function readTextFilesUnder(dir: string): { path: string; text: string }[] {
  const out: { path: string; text: string }[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...readTextFilesUnder(full));
    } else if (/\.(ts|tsx|js|mjs|json|html|css)$/.test(entry)) {
      out.push({ path: full, text: readFileSync(full, "utf8") });
    }
  }
  return out;
}

describe("production extension configuration", () => {
  it("points at the public production domain, not the raw Worker host", () => {
    expect(PRODUCTION_APP_ORIGIN).toBe("https://getofferlyst.com");
    expect(PRODUCTION_APP_ORIGIN).not.toContain("workers.dev");
    expect(PRODUCTION_APP_ORIGIN).not.toContain("localhost");
    expect(PRODUCTION_APP_ORIGIN.endsWith("/")).toBe(false);
  });

  it("trusts the production domain for the auth bridge and the /api/extension fetches", () => {
    expect(TRUSTED_APP_ORIGINS).toContain(`${PRODUCTION_APP_ORIGIN}/*`);
  });

  it("still trusts the Worker origin and localhost, so old installs and dev keep working", () => {
    // Users are redirected off the Worker origin (src/server/canonicalHost.ts),
    // but an extension build still pointed there must keep authenticating.
    expect(TRUSTED_APP_ORIGINS).toContain(`${WORKER_APP_ORIGIN}/*`);
    expect(TRUSTED_APP_ORIGINS).toContain("http://localhost:*/*");
    expect(LOCAL_APP_ORIGIN).toBe("http://localhost:8080");
  });

  it("the production build's VITE_APP_URL matches the production origin", () => {
    const envProduction = readFileSync(join(EXTENSION_ROOT, ".env.production"), "utf8");
    const match = /^VITE_APP_URL=(.+)$/m.exec(envProduction);
    expect(match?.[1].trim()).toBe(PRODUCTION_APP_ORIGIN);
  });

  it("both manifests derive their trusted origins from the one shared list", () => {
    for (const file of ["manifest.config.ts", "manifest.safari.ts"]) {
      const text = readFileSync(join(EXTENSION_ROOT, file), "utf8");
      // Once in host_permissions, once in the auth-bridge content script.
      expect(text.match(/\.\.\.TRUSTED_APP_ORIGINS/g)?.length).toBe(2);
    }
  });

  it("no server-side secret is present anywhere in extension source", () => {
    // The extension ships to users' browsers — it may only ever carry the
    // anon key. Service-role/provider keys live on the Worker (src/server/*).
    const forbidden = [
      "service_role",
      "SERVICE_ROLE",
      "SUPABASE_SECRET_KEY",
      "sb_secret_",
      "OPENAI_API_KEY",
      "ANTHROPIC_API_KEY",
      "GOOGLE_CLIENT_SECRET",
    ];
    const offenders: string[] = [];
    for (const file of readTextFilesUnder(join(EXTENSION_ROOT, "src"))) {
      if (file.path.endsWith("constants.test.ts")) continue; // this file names them
      for (const needle of forbidden) {
        if (file.text.includes(needle)) offenders.push(`${file.path}: ${needle}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
