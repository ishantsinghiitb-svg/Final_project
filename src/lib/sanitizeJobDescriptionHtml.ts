// ── Job-description HTML sanitizer (security — A1 stored-XSS fix) ──────────
//
// `global_jobs.description_html` is rendered with `dangerouslySetInnerHTML`
// on the job-detail page and is shared, world-readable data. It can be
// written by:
//   • `upsert_global_job(jsonb)`        — GRANT EXECUTE TO authenticated,
//                                          callable directly over PostgREST,
//                                          so ANY signed-in user is a writer
//   • `admin_upsert_global_job(jsonb)`  — the server-side crawler path
//   • direct table writes / future code
//
// Defense in depth for that column:
//   1. DB    — a BEFORE INSERT/UPDATE trigger on `global_jobs` runs an
//              equivalent SQL sanitizer, so NO write path can store unsafe
//              HTML regardless of which RPC (or none) was used. This is the
//              only layer that covers the direct-PostgREST bypass of
//              `upsert_global_job`, which never reaches our Worker.
//              See supabase/migrations/20260829000001_*.
//   2. App   — the crawler ingestion boundary (`toAdminUpsertPayload`) runs
//              THIS function before the value is ever sent to Supabase.
//   3. Render — the job-detail route runs THIS function, then an additional
//              DOMPurify pass in the browser, before `dangerouslySetInnerHTML`.
//
// This module is the shared, isomorphic core of layers 2 and 3: pure string
// work, zero dependencies, no DOM — so it runs identically on the Cloudflare
// Workers runtime (SSR / crawler), in the browser, and under vitest.
//
// Policy: a STRICT structural-tag allowlist with ZERO attributes on any
// retained element — identical to the browser-extension parser's own
// sanitizer (extension/src/core/parsers/linkedin/sanitize.ts). Because no
// attribute is ever kept, there is no `href` / `src` / `style` / `on*`
// surface at all, which is what makes `javascript:` URLs and event handlers
// structurally impossible in the output rather than something we have to
// pattern-match away.

/**
 * Hard cap on stored/rendered `description_html`, applied BEFORE any parsing.
 * The plain-text `description` field caps at 60k (see JobValidator); HTML
 * markup is more verbose, so this allows headroom while still bounding a
 * hostile payload. Mirrored by the SQL sanitizer.
 */
export const MAX_JOB_DESCRIPTION_HTML_LENGTH = 100_000;

/**
 * The ONLY tags kept in the output, always attribute-free. Structural /
 * text-formatting only — no links, media, or containers. Kept in sync with
 * the extension sanitizer's allowlist and with the render-time DOMPurify
 * config in src/routes/dashboard.jobs.$jobId.tsx.
 */
export const ALLOWED_JOB_HTML_TAGS = [
  "p",
  "br",
  "ul",
  "ol",
  "li",
  "strong",
  "em",
  "b",
  "i",
  "h1",
  "h2",
  "h3",
  "h4",
] as const;

const ALLOWED_TAGS = new Set<string>(ALLOWED_JOB_HTML_TAGS);

// Elements dropped together with their entire contents: they can execute
// (script/style/svg/math/iframe/object/embed/…) or their text must never be
// shown as body copy (head/title/…). Anything not listed here and not in the
// allowlist is unwrapped (tag removed, inner text kept).
const DROP_WITH_CONTENT = [
  "script",
  "style",
  "iframe",
  "object",
  "embed",
  "noscript",
  "template",
  "svg",
  "math",
  "head",
  "title",
  "link",
  "meta",
  "base",
  "form",
  "input",
  "button",
  "textarea",
  "select",
  "option",
  "applet",
  "frame",
  "frameset",
  "audio",
  "video",
  "canvas",
  "map",
  "xml",
];

// A single alternation of every allow-listed tag, used by the escape pass to
// tell an emitted-clean tag apart from malformed residue without any
// placeholder/sentinel bookkeeping.
const ALLOWED_TAG_ALT = ALLOWED_JOB_HTML_TAGS.join("|");

const DROP_WITH_CONTENT_RE = new RegExp(
  `<(${DROP_WITH_CONTENT.join("|")})\\b[\\s\\S]*?(?:</\\1\\s*>|$)`,
  "gi",
);
const DROP_ORPHAN_RE = new RegExp(`</?(?:${DROP_WITH_CONTENT.join("|")})\\b[^>]*>`, "gi");

// Well-formed tag: `<` (or `</`) IMMEDIATELY followed by a tag name — no
// whitespace, matching how HTML parsers actually tokenise a start tag (so
// prose like `a < b and b > c` is never mistaken for a tag). Captures the
// leading slash + name and ignores everything else up to the first `>`;
// `[^>]*?` can never cross a `>`, so attributes are always discarded whole.
const ANY_TAG_RE = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b[^>]*?>/g;

// A `<` that does NOT begin one of our emitted clean tags, and a `>` that
// does NOT close one — everything else that could still read as markup.
const STRAY_LT_RE = new RegExp(`<(?!/?(?:${ALLOWED_TAG_ALT})>)`, "gi");
const STRAY_GT_RE = new RegExp(`(?<!<\\/?(?:${ALLOWED_TAG_ALT}))>`, "gi");

// C0 control characters, minus tab (9) / LF (10) / CR (13). Built from code
// points so this source file stays plain ASCII.
const CONTROL_CHARS_RE = new RegExp(
  "[" +
    Array.from({ length: 32 }, (_unused, code) => code)
      .filter((code) => code !== 9 && code !== 10 && code !== 13)
      .map((code) => "\\u" + code.toString(16).padStart(4, "0"))
      .join("") +
    "]",
  "g",
);

/**
 * Reduce arbitrary HTML to an attribute-free, structural-tag-only subset that
 * cannot execute script or navigate. Returns `null` for nullish input or when
 * nothing renderable survives (so callers fall back to the plain-text
 * `description`).
 *
 * Safe to run repeatedly — the function is idempotent on its own output.
 */
export function sanitizeJobDescriptionHtml(input: string | null | undefined): string | null {
  if (input == null) return null;
  let html = typeof input === "string" ? input : String(input);

  // 0. Bound the work, then strip NULs and other C0 control characters
  //    (tab / LF / CR are kept).
  if (html.length > MAX_JOB_DESCRIPTION_HTML_LENGTH) {
    html = html.slice(0, MAX_JOB_DESCRIPTION_HTML_LENGTH);
  }
  html = html.replace(CONTROL_CHARS_RE, "");

  // 1. Comments (incl. unterminated / IE conditional), CDATA, processing
  //    instructions, <!doctype …> and any other `<! … >` construct.
  html = html.replace(/<!--[\s\S]*?-->/g, "");
  html = html.replace(/<!--[\s\S]*$/g, "");
  html = html.replace(/<!\[CDATA\[[\s\S]*?\]\]>/gi, "");
  html = html.replace(/<\?[\s\S]*?\?>/g, "");
  html = html.replace(/<\?[\s\S]*$/g, "");
  html = html.replace(/<![\s\S]*?>/g, "");

  // 2. Remove dangerous elements together with their content. Repeated to a
  //    fixed point so split-tag tricks (`<scr<script>ipt>`) cannot survive by
  //    exposing a fresh tag after an earlier pass.
  for (let i = 0; i < 20; i++) {
    const before = html;
    html = html.replace(DROP_WITH_CONTENT_RE, "");
    html = html.replace(DROP_ORPHAN_RE, "");
    if (html === before) break;
  }

  // 3. Rewrite every well-formed tag: allow-listed ones to their bare
  //    `<tag>` / `</tag>` form (ALL attributes discarded — this is what
  //    removes on*/href/src/style), everything else to nothing (inner text
  //    is kept).
  html = html.replace(ANY_TAG_RE, (_match, slash: string, name: string) => {
    const tag = name.toLowerCase();
    if (!ALLOWED_TAGS.has(tag)) return "";
    if (tag === "br") return "<br>";
    return slash ? `</${tag}>` : `<${tag}>`;
  });

  // 4. Every well-formed tag was already resolved in step 3 (to a clean
  //    allow-listed tag or to nothing). Anything angle-bracketed still left is
  //    malformed residue — HTML-escape every bracket that is not part of one
  //    of the clean tags emitted in step 3 so no parser can reconstruct a tag
  //    from it.
  html = html.replace(STRAY_LT_RE, "&lt;");
  html = html.replace(STRAY_GT_RE, "&gt;");

  // 5. Cosmetic tidy only — never affects safety.
  html = html.replace(/(?:<br>\s*){3,}/g, "<br><br>");
  html = html.trim();

  return html.length > 0 ? html : null;
}
