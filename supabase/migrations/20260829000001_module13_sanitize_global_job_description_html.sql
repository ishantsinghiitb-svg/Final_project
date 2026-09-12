-- ── A1 stored-XSS fix — server-side sanitization of global_jobs.description_html ──
--
-- CONTEXT
--   `global_jobs.description_html` is rendered with React
--   `dangerouslySetInnerHTML` on the job-detail page and is shared,
--   world-readable data. Its write paths:
--     • upsert_global_job(jsonb)       — GRANT EXECUTE TO authenticated, so it
--                                        is callable DIRECTLY over PostgREST
--                                        (/rest/v1/rpc/upsert_global_job) by
--                                        any signed-in user, with an arbitrary
--                                        `description_html`. The browser
--                                        extension's own sanitizer never runs
--                                        for that call — it happens in the
--                                        extension, not the database.
--     • admin_upsert_global_job(jsonb) — the crawler path (raw ATS HTML).
--     • direct table writes / future code.
--
--   The application layer now sanitizes at the crawler ingestion boundary
--   (src/server/jobIntelligence/store/SupabaseJobIntelligenceStore.ts) and at
--   render (src/routes/dashboard.jobs.$jobId.tsx, isomorphic sanitizer +
--   DOMPurify). This migration is the DATABASE backstop and the ONLY layer
--   that covers the direct-PostgREST bypass of upsert_global_job, which never
--   reaches our Worker.
--
-- MECHANISM
--   A BEFORE INSERT OR UPDATE row trigger on global_jobs runs
--   sanitize_job_description_html() over NEW.description_html. No RPC body is
--   modified — every current and future write path is covered by the one
--   trigger, and upsert_global_job / admin_upsert_global_job are left exactly
--   as they are.
--
--   sanitize_job_description_html() mirrors
--   src/lib/sanitizeJobDescriptionHtml.ts: a STRICT structural-tag allowlist
--   (p, br, ul, ol, li, strong, em, b, i, h1-h4) with EVERY attribute
--   stripped from every retained tag — so there is no href / src / style /
--   on* surface at all, `javascript:` URLs are structurally impossible, and
--   <script>/<style>/<iframe>/<object>/<embed>/<svg>/<math>/… are removed
--   together with their contents. Output is capped at 100000 characters.
--
-- APPLY
--   This repo is not linked to the Supabase CLI. Apply by pasting this file
--   into the target project's SQL Editor and running it. It is additive and
--   idempotent (CREATE OR REPLACE + DROP TRIGGER IF EXISTS + a one-time
--   backfill that only rewrites rows whose stored value is not already safe).
--
-- VERIFY (run after applying)
--   -- 1. function + trigger exist
--   SELECT tgname FROM pg_trigger
--    WHERE tgrelid = 'global_jobs'::regclass AND NOT tgisinternal;
--   -- expect: global_jobs_sanitize_description_html, global_jobs_search_vector_update,
--   --         global_jobs_set_updated_at
--
--   -- 2. sanitizer neutralises a payload
--   SELECT sanitize_job_description_html('<img src=x onerror=alert(1)><p>ok</p>');
--   -- expect: <p>ok</p>
--   SELECT sanitize_job_description_html('<a href="javascript:alert(1)">x</a>');
--   -- expect: x
--   SELECT sanitize_job_description_html('<h2>Role</h2><ul><li>a</li></ul>');
--   -- expect: <h2>Role</h2><ul><li>a</li></ul>
--
--   -- 3. no stored row still carries executable markup
--   SELECT count(*) FROM global_jobs
--    WHERE description_html ~* '<\s*(script|iframe|object|embed|svg|style|img|a|form|link|meta)\M'
--       OR description_html ~* 'on[a-z]+\s*=' OR description_html ~* 'javascript:';
--   -- expect: 0

BEGIN;

-- ── sanitize_job_description_html(text) ─────────────────────────────────────
CREATE OR REPLACE FUNCTION sanitize_job_description_html(input text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  html  text;
  prev  text;
  guard int := 0;
  soh   text := chr(1);  -- shields an emitted "<" during the strip pass
  stx   text := chr(2);  -- shields an emitted ">" during the strip pass
BEGIN
  IF input IS NULL THEN
    RETURN NULL;
  END IF;

  -- 0. Bound the work, then drop the two shield sentinels so a caller can
  --    never pre-seed them to forge a tag past the strip pass below. A NUL
  --    byte cannot occur here: Postgres text and jsonb both reject it at the
  --    boundary, and chr(0) is not even a constructible text value, so there
  --    is nothing to strip for it.
  html := left(input, 100000);
  html := translate(html, chr(1) || chr(2), '');

  -- 1. Comments (incl. unterminated / IE conditional), CDATA, processing
  --    instructions, <!doctype ...> and any other <! ... > construct.
  html := regexp_replace(html, '<!--.*?-->', '', 'g');
  html := regexp_replace(html, '<!--.*$',    '', 'g');
  html := regexp_replace(html, '<!\[CDATA\[.*?\]\]>', '', 'gi');
  html := regexp_replace(html, '<\?.*?\?>',  '', 'g');
  html := regexp_replace(html, '<\?.*$',     '', 'g');
  html := regexp_replace(html, '<![^>]*>',   '', 'g');

  -- 2. Remove dangerous elements together with their content, to a fixed
  --    point (split-tag evasion such as <scr<script>ipt> needs re-scanning).
  LOOP
    prev := html;
    html := regexp_replace(
      html,
      '<(script|style|iframe|object|embed|noscript|template|svg|math|head|title|link|meta|base|form|input|button|textarea|select|option|applet|frame|frameset|audio|video|canvas|map|xml)\M.*?(</\1\s*>|$)',
      '', 'gi');
    html := regexp_replace(
      html,
      '</?(script|style|iframe|object|embed|noscript|template|svg|math|head|title|link|meta|base|form|input|button|textarea|select|option|applet|frame|frameset|audio|video|canvas|map|xml)\M[^>]*>',
      '', 'gi');
    guard := guard + 1;
    EXIT WHEN html = prev OR guard >= 20;
  END LOOP;

  -- 3. Keep allow-listed structural tags as attribute-free, sentinel-shielded
  --    forms (ALL attributes discarded — removes on*/href/src/style); drop
  --    every other well-formed tag, keeping its inner text.
  html := regexp_replace(
    html,
    '<(/?)(p|br|ul|ol|li|strong|em|b|i|h1|h2|h3|h4)\M[^>]*>',
    soh || '\1\2' || stx, 'gi');
  html := regexp_replace(html, '</?[a-zA-Z][^>]*>', '', 'g');

  -- 4. Neutralise every stray angle bracket left by malformed markup, then
  --    restore the shielded structural tags.
  html := replace(html, '<', '&lt;');
  html := replace(html, '>', '&gt;');
  html := regexp_replace(html, soh || '(/?)([a-zA-Z1-4]+)' || stx, '<\1\2>', 'g');

  -- 5. Cosmetic tidy only.
  html := regexp_replace(html, '(<br\s*/?>\s*){3,}', '<br><br>', 'gi');
  html := regexp_replace(html, '<br\s*/>', '<br>', 'gi');
  html := btrim(html);

  IF html = '' THEN
    RETURN NULL;
  END IF;
  RETURN html;
END;
$$;

REVOKE ALL ON FUNCTION sanitize_job_description_html(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sanitize_job_description_html(text) TO authenticated, service_role;

-- ── BEFORE INSERT/UPDATE trigger on global_jobs ────────────────────────────
CREATE OR REPLACE FUNCTION global_jobs_sanitize_description_html_trigger()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Only touch the column on INSERT or when it actually changed, so ordinary
  -- lifecycle UPDATEs (last_seen_at, status, …) don't re-run the sanitizer.
  IF TG_OP = 'INSERT' OR NEW.description_html IS DISTINCT FROM OLD.description_html THEN
    NEW.description_html := sanitize_job_description_html(NEW.description_html);
  END IF;
  RETURN NEW;
END;
$$;

-- Name sorts before global_jobs_search_vector_update / global_jobs_set_updated_at,
-- so sanitization is the first BEFORE-row trigger to run.
DROP TRIGGER IF EXISTS global_jobs_sanitize_description_html ON global_jobs;
CREATE TRIGGER global_jobs_sanitize_description_html
  BEFORE INSERT OR UPDATE ON global_jobs
  FOR EACH ROW EXECUTE FUNCTION global_jobs_sanitize_description_html_trigger();

-- ── One-time backfill of already-stored rows ───────────────────────────────
-- Only rewrites rows whose stored HTML is not already what the sanitizer
-- would produce. Fires the trigger (idempotent) + the search-vector trigger
-- for each changed row; global_jobs is small enough that this is trivial.
UPDATE global_jobs
   SET description_html = sanitize_job_description_html(description_html)
 WHERE description_html IS NOT NULL
   AND description_html IS DISTINCT FROM sanitize_job_description_html(description_html);

COMMIT;
