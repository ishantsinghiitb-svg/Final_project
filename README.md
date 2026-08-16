# Offerlyst

TanStack Start (React 19 + Vite + Nitro) app on Supabase, deployed to Cloudflare
Workers via Lovable. This document covers local development and what's needed
to run this in production — not feature/module documentation.

## Local development

```bash
npm install
cp .env.example .env   # fill in the values described below
npm run dev
```

The dev server prints its actual local URL on startup (port isn't fixed — see
`.env.example`'s note on `GOOGLE_OAUTH_REDIRECT_URI`).

The browser extension (`extension/`) is a separate subproject with its own
`package.json` and `.env.example`:

```bash
npm run extension:install
npm run extension:dev
```

## Environment variables

Full descriptions and setup notes live in [`.env.example`](.env.example) —
copy it to `.env` and fill in real values. **Names only** below; never commit
actual values (`.env` is gitignored and must stay that way).

| Variable | Where it's used |
| --- | --- |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | Isomorphic — Supabase project URL/anon key, safe on the client |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only, bypasses RLS — narrow privileged paths only |
| `OPENAI_API_KEY` (+ optional `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`) | Server-only AI provider keys |
| `VITE_AI_DEFAULT_PROVIDER`, `VITE_AI_FREE_CREDITS`, `VITE_AI_REQUEST_TIMEOUT_MS` | Isomorphic AI config, not secrets |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_OAUTH_REDIRECT_URI` | Server-only — Google OAuth client (Gmail + Calendar) |
| `GOOGLE_TOKEN_ENCRYPTION_KEY`, `GOOGLE_OAUTH_STATE_SECRET` | Server-only — 32-byte base64 secrets (see `.env.example` for generation) |
| `ADMIN_EMAILS` | Server-only — comma-separated allowlist gating admin-only job-crawl endpoints |

In production these are Cloudflare Worker secrets, not a `.env` file:

```bash
npx wrangler secret put OPENAI_API_KEY
# ...one per server-only secret
```

`VITE_*` variables are inlined into the client bundle at **build time**, not
read at runtime — they must be set wherever the production build actually
runs (see Deployment below), not just as Worker secrets.

## Build commands

```bash
npm run dev          # local dev server
npx tsc --noEmit      # typecheck (no output on success)
npm run build         # production build → .output/
npm run test           # run the vitest suite once
npm run lint            # eslint (currently has pre-existing CRLF-only failures, unrelated to app code)
```

`npm run build` needs no environment variables to succeed — it's a static
compile/bundle step. It runs Vite's client+SSR build, then Nitro's
`cloudflare-module` preset, which generates `.output/server/wrangler.json`
and the Worker deploy config automatically. There is no committed
`wrangler.toml` and there shouldn't be — Nitro regenerates it every build.

## CI

`.github/workflows/ci.yml` runs on every push and PR against `main`:
typecheck (`tsc --noEmit`), build (`npm run build`), and the test suite
(`npm run test`). It needs no secrets — the build doesn't touch Supabase or
any provider at compile time. Lint is intentionally not gated in CI (see
pre-existing CRLF issue above).

## Deployment

Hosting is Cloudflare Workers, managed through Lovable: pushes to the branch
connected in the Lovable project sync back to the Lovable editor and trigger
Lovable's own build + deploy pipeline (Vite → Nitro `cloudflare-module`
preset, as above). There is no separate manual `wrangler deploy` step in
normal operation.

Server-only secrets (everything without a `VITE_` prefix) must be set as
Cloudflare Worker secrets for the deployed Worker — see `.env.example` for
the full list and `npx wrangler secret put <NAME>` to set one. `VITE_*`
values must be available to whatever performs the production build (check
Lovable's project environment-variable settings if the build isn't running
locally).

## Database migrations

SQL migrations live in `supabase/migrations/`, one file per change, applied
in filename (timestamp) order. This repo is **not** linked to the Supabase
CLI (no `supabase/config.toml`) — migrations are applied manually:

1. Open the target Supabase project → SQL Editor.
2. Run the new migration file's SQL directly.
3. Verify the change actually landed by querying the affected table/column
   via the Supabase dashboard or PostgREST — don't assume a migration file
   existing in the repo means it was applied to the live database.

Migrations are additive-only by convention (no destructive changes, no down
migrations). If a migration needs to be undone, write and apply a new
forward migration that reverses it — don't hand-edit or delete an already
applied migration file.

## Rollback / recovery basics

- **App code**: Lovable deploys from git — reverting means pushing a revert
  commit (or redeploying a previous commit) to the connected branch. There is
  no separate Cloudflare rollback step to manage in normal operation.
- **Database**: this repo has no automated backup/rollback tooling. Point-in-
  time recovery and backup retention are configured in the Supabase project
  dashboard (Settings → Database → Backups) and depend on your Supabase plan
  — check that dashboard directly; it can't be verified or changed from this
  repo.
- **Migrations**: forward-only (see above) — recovery from a bad migration is
  a new corrective migration, not a revert.

## Monitoring / health checks

- **Liveness**: `GET /api/health` returns `{"status":"ok","timestamp":...}`
  with a 200. It's a plain fetch handler intercepted in `src/server.ts`
  ahead of SSR (same pattern as the extension API) — it only proves the
  Worker is up, it does not check Supabase or any other dependency.
- **Errors**: caught server-side errors go through `console.error`, which
  Cloudflare Workers captures in real-time dashboard logs
  (Workers & Pages → your Worker → Logs, or `wrangler tail`) at no extra
  cost. There is no dedicated error-tracking service (e.g. Sentry) wired up
  yet — if you want alerting/aggregation beyond Cloudflare's dashboard logs,
  that's a deliberate future addition, not an oversight.
- `src/routes/supabase-status.tsx` is a pre-existing client-side debug page,
  not a monitoring endpoint — it requires JS execution in a browser and
  isn't suitable for automated uptime checks.
