// ── Module 10B.1: minimal RSS/XML feed reader ──
//
// Only what an RSS 2.0 job feed needs: split `<item>` elements, read a child
// element's text (CDATA-aware, entity-decoded), and read an attribute off a
// child element (for `<media:content url="…">`). No namespaces resolution, no
// XSD, no DOM — a feed is a flat list of items with flat children.
//
// Namespaced child tags (`media:content`, `dc:creator`) are matched by their
// literal qualified name, which is what feeds actually emit. Kept separate
// from parsers/html.ts because the escaping rules differ: feed text is often
// double-escaped HTML inside CDATA, which the HTML helpers must not
// second-guess.

import { decodeHtmlEntities, collapseWhitespace } from "./html";

/** Raw text of one `<item>` element (inner XML), in feed order. */
export function extractFeedItems(xml: string, itemTag = "item"): string[] {
  const escaped = itemTag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`<${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escaped}\\s*>`, "gi");
  const items: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = re.exec(xml)) !== null) items.push(match[1]);
  return items;
}

function unwrapCdata(raw: string): string {
  const cdata = /^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/.exec(raw);
  return cdata ? cdata[1] : raw;
}

/**
 * Text content of the first `<tag>` child, CDATA-unwrapped and
 * entity-decoded. Whitespace is preserved (feed descriptions carry
 * meaningful line structure); use `readFeedLine` for single-line fields.
 */
export function readFeedField(itemXml: string, tag: string): string | null {
  const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`<${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escaped}\\s*>`, "i");
  const match = re.exec(itemXml);
  if (!match) return null;
  const value = decodeHtmlEntities(unwrapCdata(match[1]));
  return value.trim() ? value : null;
}

/** Single-line variant of `readFeedField` (titles, categories, types). */
export function readFeedLine(itemXml: string, tag: string): string | null {
  const value = readFeedField(itemXml, tag);
  return value ? collapseWhitespace(value) || null : null;
}

/** An attribute off the first `<tag …>` child, e.g. `media:content`'s `url`. */
export function readFeedAttribute(itemXml: string, tag: string, attribute: string): string | null {
  const escapedTag = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const escapedAttr = attribute.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const tagMatch = new RegExp(`<${escapedTag}(\\s[^>]*)?/?>`, "i").exec(itemXml);
  if (!tagMatch?.[1]) return null;
  const attrMatch = new RegExp(`\\b${escapedAttr}\\s*=\\s*("([^"]*)"|'([^']*)')`, "i").exec(
    tagMatch[1],
  );
  if (!attrMatch) return null;
  const value = decodeHtmlEntities(attrMatch[2] ?? attrMatch[3] ?? "");
  return value.trim() || null;
}

/** RFC-822 (`Fri, 07 Aug 2026 21:06:02 +0000`) or ISO date → ISO string; unparseable → null. */
export function readFeedDate(itemXml: string, tag: string): string | null {
  const raw = readFeedLine(itemXml, tag);
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

/** All `<loc>` URLs in a sitemap or sitemap index. */
export function extractSitemapUrls(xml: string): string[] {
  return [...xml.matchAll(/<loc>\s*([\s\S]*?)\s*<\/loc>/gi)]
    .map((match) => collapseWhitespace(decodeHtmlEntities(match[1])))
    .filter(Boolean);
}
