import type { JobParser, NormalizedJob, ParserContext } from "./types";

/**
 * Shared helpers for site parsers. Concrete parsers should prefer JSON-LD and
 * semantic/data attributes (via these helpers) over brittle CSS class names,
 * per the Module 2D spec — class-name selectors are a last resort and should
 * live in a site-specific `*.selectors.ts` file, not inline in the parser.
 */
export abstract class BaseParser implements JobParser {
  abstract tryParse(context: ParserContext): NormalizedJob | null;

  /** Parses every `<script type="application/ld+json">` on the page, skipping malformed ones. */
  protected readJsonLd(document: Document): unknown[] {
    const nodes = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
    const parsed: unknown[] = [];

    for (const node of nodes) {
      const text = node.textContent?.trim();
      if (!text) continue;
      try {
        const value = JSON.parse(text);
        if (Array.isArray(value)) parsed.push(...value);
        else parsed.push(value);
      } catch {
        // Malformed JSON-LD block — ignore and keep looking.
      }
    }

    return parsed;
  }

  /** Returns the first JSON-LD node whose `@type` matches (case-insensitive), if any. */
  protected findJsonLdByType(document: Document, type: string): Record<string, unknown> | null {
    const nodes = this.readJsonLd(document);
    for (const node of nodes) {
      if (!node || typeof node !== "object") continue;
      const record = node as Record<string, unknown>;
      const nodeType = record["@type"];
      const types = Array.isArray(nodeType) ? nodeType : [nodeType];
      if (types.some((t) => typeof t === "string" && t.toLowerCase() === type.toLowerCase())) {
        return record;
      }
    }
    return null;
  }

  /** Returns trimmed, whitespace-collapsed text for the first selector that yields non-empty content. */
  protected firstText(document: ParentNode, selectors: string[]): string | null {
    for (const selector of selectors) {
      const el = document.querySelector(selector);
      const text = el?.textContent ? this.cleanText(el.textContent) : "";
      if (text) return text;
    }
    return null;
  }

  /** Returns the given attribute's value for the first selector that has it non-empty. */
  protected firstAttr(document: ParentNode, selectors: string[], attr: string): string | null {
    for (const selector of selectors) {
      const el = document.querySelector(selector);
      const value = el?.getAttribute(attr)?.trim();
      if (value) return value;
    }
    return null;
  }

  protected cleanText(text: string): string {
    return text.replace(/\s+/g, " ").trim();
  }

  /** Strips HTML tags for use as plain-text description fallback; callers may keep raw HTML separately if needed. */
  protected htmlToText(html: string): string {
    const div = document.createElement("div");
    div.innerHTML = html;
    return this.cleanText(div.textContent ?? "");
  }
}
