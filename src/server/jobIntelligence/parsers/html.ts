// ── Module 10B.1: server-side HTML extraction ──
//
// The extension's parsers (Module 4B) run in a browser and use `querySelector`.
// This pipeline runs on the server (Nitro/Cloudflare Workers), where there is
// no DOM and no DOM library in this project's dependency tree — so the same
// job has to be done against raw markup.
//
// This is a deliberately SMALL, tag-scanning extractor, not a general HTML
// parser: it finds elements by tag+attribute/class, walks to the matching
// close tag counting nesting, and converts a fragment to clean text. That is
// exactly the surface the two HTML-based adapters need, and every function
// here is pure and unit-tested. Anything requiring real CSS-selector
// semantics is out of scope on purpose — a platform whose markup needs that
// is better served by its JSON/feed endpoint (see the ATS and RSS adapters).
//
// Never returns raw HTML to callers as job content: `htmlToPlainText` is what
// produces the stored `description`, per the module's "never store raw HTML"
// rule.

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
  hellip: "…",
  bull: "•",
  middot: "·",
  eacute: "é",
  reg: "®",
  copy: "©",
  trade: "™",
  deg: "°",
  euro: "€",
  pound: "£",
  yen: "¥",
  rupee: "₹",
};

/** Decodes named and numeric (decimal/hex) HTML entities. Unknown entities are left verbatim. */
export function decodeHtmlEntities(input: string): string {
  return input.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g, (match, entity: string) => {
    if (entity[0] === "#") {
      const isHex = entity[1] === "x" || entity[1] === "X";
      const code = Number.parseInt(isHex ? entity.slice(2) : entity.slice(1), isHex ? 16 : 10);
      if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) return match;
      try {
        return String.fromCodePoint(code);
      } catch {
        return match;
      }
    }
    const named = NAMED_ENTITIES[entity.toLowerCase()];
    return named ?? match;
  });
}

/** Drops comments and the CONTENT of script/style blocks — neither is ever job text. */
export function stripNonContent(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, " ");
}

/** Collapses all whitespace to single spaces and trims — the single-line form. */
export function collapseWhitespace(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

const BLOCK_TAGS =
  "address|article|aside|blockquote|dd|div|dl|dt|fieldset|figcaption|figure|footer|form|h[1-6]|header|hr|li|main|nav|ol|p|pre|section|table|tbody|td|tfoot|th|thead|tr|ul";

/**
 * Converts an HTML fragment to clean, readable plain text: block boundaries
 * and `<br>` become newlines, list items get a "- " bullet, everything else
 * is stripped and entity-decoded. Runs of blank lines collapse to one.
 *
 * This is what produces the stored `description` — structured, searchable
 * text suitable for the deterministic resume match, never markup.
 */
export function htmlToPlainText(html: string | null | undefined): string {
  if (!html) return "";

  let text = stripNonContent(html);

  text = text.replace(/<br\s*\/?>/gi, "\n");
  text = text.replace(
    /<\/(p|div|section|article|h[1-6]|tr|ul|ol|dl|table|blockquote)\s*>/gi,
    "\n\n",
  );
  // `<li>` opens the line; `</li>` deliberately emits NOTHING. Emitting a
  // newline on both would put a blank line between every pair of list items
  // (open adds "\n- ", close adds "\n") — the closing `</ul>` already
  // terminates the last item.
  text = text.replace(/<li\b[^>]*>/gi, "\n- ");
  text = text.replace(/<\/li\s*>/gi, "");
  text = text.replace(new RegExp(`<(${BLOCK_TAGS})\\b[^>]*>`, "gi"), "\n");

  text = text.replace(/<[^>]+>/g, "");
  text = decodeHtmlEntities(text);

  return text
    .split("\n")
    .map((line) => line.replace(/[^\S\n]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/(?:^\s*-\s*$)/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Single-line plain text (for titles, company names, table cells). */
export function htmlToInlineText(html: string | null | undefined): string {
  return collapseWhitespace(htmlToPlainText(html).replace(/\n+/g, " "));
}

/**
 * Reads an attribute off an opening tag string like `<div class="x" id="y">`.
 * Case-insensitive; handles quoted and bare values.
 *
 * The name must be preceded by whitespace — NOT a `\b` boundary. `\b` sits
 * between `-` and `c`, so `\bclass` happily matches inside `data-class`, and
 * reading `class` off `<div data-class="x">` would return "x".
 */
export function readAttribute(openTag: string, attribute: string): string | null {
  const escaped = attribute.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const quoted = new RegExp(`(?<=\\s)${escaped}\\s*=\\s*("([^"]*)"|'([^']*)')`, "i").exec(openTag);
  if (quoted) return decodeHtmlEntities(quoted[2] ?? quoted[3] ?? "");
  const bare = new RegExp(`(?<=\\s)${escaped}\\s*=\\s*([^\\s"'>]+)`, "i").exec(openTag);
  return bare ? decodeHtmlEntities(bare[1]) : null;
}

/** True when an opening tag's `class` attribute contains `className` as a whole token. */
export function hasClass(openTag: string, className: string): boolean {
  const classes = readAttribute(openTag, "class");
  if (!classes) return false;
  return classes.split(/\s+/).includes(className);
}

export type HtmlElement = {
  /** The opening tag verbatim, e.g. `<div class="card" id="x">`. */
  openTag: string;
  /** Markup between the open and matching close tag. */
  innerHtml: string;
  /** Open tag + inner + close tag. */
  outerHtml: string;
};

const VOID_TAGS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);

/**
 * Finds every `<tag …>` whose opening tag satisfies `matches`, returning it
 * with its inner markup. Nesting is handled by counting same-tag opens/closes
 * forward from each match, so an outer `div` card containing inner `div`s
 * yields the whole card.
 *
 * Non-nesting-safe by design in one case: unbalanced markup (a missing close
 * tag) makes an element run to the end of the document. That is the correct
 * failure for a crawler — it produces one over-long field the Validator
 * rejects, rather than silently truncating at the wrong place.
 */
export function findElements(
  html: string,
  tagName: string,
  matches: (openTag: string) => boolean = () => true,
  limit = Number.POSITIVE_INFINITY,
): HtmlElement[] {
  const source = stripNonContent(html);
  const lowerTag = tagName.toLowerCase();
  const openRe = new RegExp(`<${lowerTag}\\b[^>]*>`, "gi");
  const results: HtmlElement[] = [];

  let match: RegExpExecArray | null;
  while (results.length < limit && (match = openRe.exec(source)) !== null) {
    const openTag = match[0];
    if (!matches(openTag)) continue;

    // Self-closing or void: no inner content to scan for.
    if (openTag.endsWith("/>") || VOID_TAGS.has(lowerTag)) {
      results.push({ openTag, innerHtml: "", outerHtml: openTag });
      continue;
    }

    const contentStart = match.index + openTag.length;
    const end = findMatchingClose(source, lowerTag, contentStart);
    const innerHtml = source.slice(contentStart, end.contentEnd);
    results.push({
      openTag,
      innerHtml,
      outerHtml: source.slice(match.index, end.afterClose),
    });

    // Continue AFTER this element so nested matches aren't emitted as siblings.
    openRe.lastIndex = end.afterClose;
  }

  return results;
}

function findMatchingClose(
  source: string,
  tagName: string,
  from: number,
): { contentEnd: number; afterClose: number } {
  const scanner = new RegExp(`<(/?)${tagName}\\b[^>]*>`, "gi");
  scanner.lastIndex = from;
  let depth = 1;
  let match: RegExpExecArray | null;

  while ((match = scanner.exec(source)) !== null) {
    const isClose = match[1] === "/";
    if (isClose) {
      depth--;
      if (depth === 0) {
        return { contentEnd: match.index, afterClose: match.index + match[0].length };
      }
    } else if (!match[0].endsWith("/>")) {
      depth++;
    }
  }

  return { contentEnd: source.length, afterClose: source.length };
}

/** All elements of `tagName` carrying the given class token. */
export function findElementsByClass(
  html: string,
  tagName: string,
  className: string,
  limit?: number,
): HtmlElement[] {
  return findElements(html, tagName, (openTag) => hasClass(openTag, className), limit);
}

/** Inline text of the first element of `tagName` with `className`, or null. */
export function textOfFirstByClass(
  html: string,
  tagName: string,
  className: string,
): string | null {
  const [element] = findElementsByClass(html, tagName, className, 1);
  if (!element) return null;
  return htmlToInlineText(element.innerHtml) || null;
}

/** Inline text of every element of `tagName` with `className`, empties dropped. */
export function textsByClass(html: string, tagName: string, className: string): string[] {
  return findElementsByClass(html, tagName, className)
    .map((element) => htmlToInlineText(element.innerHtml))
    .filter(Boolean);
}

/** `content` of the first `<meta>` matching a name/property value (og:title, description, …). */
export function readMetaContent(html: string, nameOrProperty: string): string | null {
  const metas = findElements(html, "meta", (openTag) => {
    const name = readAttribute(openTag, "name") ?? readAttribute(openTag, "property");
    return name?.toLowerCase() === nameOrProperty.toLowerCase();
  });
  for (const meta of metas) {
    const content = readAttribute(meta.openTag, "content");
    if (content) return collapseWhitespace(content);
  }
  return null;
}

/** Resolves a possibly-relative href against a base URL; returns null when unresolvable. */
export function resolveUrl(href: string | null | undefined, base: string): string | null {
  if (!href) return null;
  const trimmed = href.trim();
  if (!trimmed || trimmed.startsWith("#") || /^javascript:/i.test(trimmed)) return null;
  try {
    return new URL(trimmed, base).toString();
  } catch {
    return null;
  }
}
