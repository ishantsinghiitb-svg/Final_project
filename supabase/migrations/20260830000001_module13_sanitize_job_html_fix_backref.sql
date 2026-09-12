-- ── A1 fix follow-up — correct sanitize_job_description_html's dangerous-element pass ──
--
-- BUG (found while verifying 20260829000001 against the live DB):
--   The dangerous-element removal used ONE alternation with a back-reference
--   for the closing tag:
--       <(script|style|...)\M.*?(</\1\s*>|$)
--   PostgreSQL's regex engine switches to pure backtracking whenever a
--   pattern contains a back-reference (\1), and in that mode the non-greedy
--   quantifier `.*?` is NOT honoured — it matched greedily to `$`. Result:
--   every legitimate tag AFTER a <script>/<style>/<svg>/... block was
--   deleted too.
--       'lead <script>x</script> tail'      -> 'lead'          (wrong)
--       '<p>A</p><script>x</script><p>B</p>' -> '<p>A</p>'      (wrong)
--   It always failed SAFE (nothing executable survived), but it over-trimmed.
--
-- FIX:
--   Drop the back-reference. Loop over the element names (as
--   src/lib/sanitizeJobDescriptionHtml.ts already does) using a LITERAL
--   closing tag per element, so `.*?` stays non-greedy — verified against
--   the live DB, where the back-reference-free `<!--.*?-->` pass works
--   correctly. Everything else in the function, the trigger, and the grants
--   are unchanged.
--
-- APPLY: paste into the Supabase SQL Editor and run. Additive, idempotent.
--   The backfill re-runs and self-heals any row the buggy version trimmed
--   (a near-total no-op in practice — real description_html has no
--   <script>/<style>/<svg> mid-body).
--
-- VERIFY after applying:
--   SELECT sanitize_job_description_html('lead <script>x</script> tail');
--   -- expect: lead  tail
--   SELECT sanitize_job_description_html('<p>A</p><script>x</script><p>B</p>');
--   -- expect: <p>A</p><p>B</p>
--   SELECT sanitize_job_description_html('<img src=x onerror=alert(1)><p>ok</p>');
--   -- expect: <p>ok</p>
--   SELECT sanitize_job_description_html('<h2>Role</h2><ul><li>a</li></ul>');
--   -- expect: <h2>Role</h2><ul><li>a</li></ul>

BEGIN;

CREATE OR REPLACE FUNCTION sanitize_job_description_html(input text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  html      text;
  prev      text;
  guard     int := 0;
  soh       text := chr(1);  -- shields an emitted "<" during the strip pass
  stx       text := chr(2);  -- shields an emitted ">" during the strip pass
  d         text;
  dangerous text[] := ARRAY[
    'script','style','iframe','object','embed','noscript','template','svg',
    'math','head','title','link','meta','base','form','input','button',
    'textarea','select','option','applet','frame','frameset','audio','video',
    'canvas','map','xml'
  ];
BEGIN
  IF input IS NULL THEN
    RETURN NULL;
  END IF;

  -- 0. Bound the work, then drop the two shield sentinels so a caller can
  --    never pre-seed them to forge a tag past the strip pass below. A NUL
  --    byte cannot occur here: Postgres text and jsonb both reject it at the
  --    boundary, and chr(0) is not even a constructible text value.
  html := left(input, 100000);
  html := translate(html, chr(1) || chr(2), '');

  -- 1. Comments (incl. unterminated / IE conditional), CDATA, processing
  --    instructions, <!doctype ...> and any other <! ... > construct. None of
  --    these use a back-reference, so `.*?` is genuinely non-greedy here.
  html := regexp_replace(html, '<!--.*?-->', '', 'g');
  html := regexp_replace(html, '<!--.*$',    '', 'g');
  html := regexp_replace(html, '<!\[CDATA\[.*?\]\]>', '', 'gi');
  html := regexp_replace(html, '<\?.*?\?>',  '', 'g');
  html := regexp_replace(html, '<\?.*$',     '', 'g');
  html := regexp_replace(html, '<![^>]*>',   '', 'g');

  -- 2. Remove dangerous elements together with their content. Per-element
  --    with a LITERAL closing tag (no back-reference -> `.*?` stays
  --    non-greedy). Outer fixed-point loop defeats split-tag evasion such as
  --    <scr<script>ipt>.
  LOOP
    prev := html;
    FOREACH d IN ARRAY dangerous LOOP
      -- paired  <d ...> ... </d>  (shortest span)
      html := regexp_replace(html, '<' || d || '\M[^>]*>.*?</' || d || '\s*>', '', 'gi');
      -- unterminated open tag: nothing valid can follow an unclosed <script>,
      -- so drop it and everything after it.
      html := regexp_replace(html, '<' || d || '\M[^>]*>.*$', '', 'i');
      -- stray orphan open/close tag with no content
      html := regexp_replace(html, '</?' || d || '\M[^>]*>', '', 'gi');
    END LOOP;
    guard := guard + 1;
    EXIT WHEN html = prev OR guard >= 20;
  END LOOP;

  -- 3. Keep allow-listed structural tags as attribute-free, sentinel-shielded
  --    forms (ALL attributes discarded -- removes on*/href/src/style); drop
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

-- Re-run the guarded backfill with the corrected function. Only rewrites rows
-- whose stored value is not already what the fixed sanitizer produces.
UPDATE global_jobs
   SET description_html = sanitize_job_description_html(description_html)
 WHERE description_html IS NOT NULL
   AND description_html IS DISTINCT FROM sanitize_job_description_html(description_html);

COMMIT;
