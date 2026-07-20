/**
 * Structured-data readers for sources OTHER than JSON-LD (`BaseParser`
 * already covers that) — OpenGraph/meta tags, and a best-effort scan of any
 * `<script type="application/json">` blob a framework (Next.js's
 * `__NEXT_DATA__`, Nuxt, a hand-rolled SSR bootstrap, …) embedded in the
 * page. Both are pure DOM reads: a content script runs in an isolated
 * world and can never see the page's own `window`-scoped JS variables, only
 * what's actually present as DOM/text — so there is no "read
 * `window.__INITIAL_STATE__`" step here; it would silently never match.
 */

// ── OpenGraph / standard meta tags ──────────────────────────────────────────

export type MetaFields = {
  title: string | null;
  description: string | null;
  siteName: string | null;
};

export function readOpenGraphAndMeta(document: Document): MetaFields {
  return {
    title: metaContent(document, ['meta[property="og:title"]', 'meta[name="twitter:title"]']),
    description: metaContent(document, [
      'meta[property="og:description"]',
      'meta[name="description"]',
    ]),
    // Deliberately no `image` field: `og:image` is a page-level banner, not a
    // company logo, and using it as one reliably produces the same wrong
    // image for many different postings (the exact mistake documented on
    // LinkedInParser.readCompanyLogo) — so it's never read here at all.
    siteName: metaContent(document, ['meta[property="og:site_name"]']),
  };
}

function metaContent(document: Document, selectors: string[]): string | null {
  for (const selector of selectors) {
    const value = document.querySelector(selector)?.getAttribute("content")?.trim();
    if (value) return value;
  }
  return null;
}

// ── Embedded JSON (non-JSON-LD) ─────────────────────────────────────────────

export type EmbeddedJobFields = {
  title: string | null;
  companyName: string | null;
  description: string | null;
  location: string | null;
};

const EMPTY_EMBEDDED: EmbeddedJobFields = {
  title: null,
  companyName: null,
  description: null,
  location: null,
};

const TITLE_KEYS = ["jobTitle", "title", "positionTitle", "position", "roleTitle"];
const COMPANY_KEYS = ["companyName", "company", "organizationName", "employerName"];
const DESCRIPTION_KEYS = ["jobDescription", "description", "descriptionText", "body"];
const LOCATION_KEYS = ["location", "jobLocation", "locationName", "city"];

const MAX_SCRIPTS_SCANNED = 15;
const MAX_JSON_NODES_VISITED = 4000;
const MAX_JSON_DEPTH = 6;

/**
 * Best-effort duck-typed search over every `<script type="application/json">`
 * blob for job-shaped fields, stopping at the first script that yields at
 * least a title or company. Bounded on every axis (script count, node count,
 * depth) so a multi-megabyte SSR state blob can never turn this into an
 * expensive traversal — this is a last-resort signal, not a full parser.
 */
export function readEmbeddedJobJson(document: Document): EmbeddedJobFields {
  const scripts = Array.from(document.querySelectorAll('script[type="application/json"]')).slice(
    0,
    MAX_SCRIPTS_SCANNED,
  );

  for (const script of scripts) {
    const text = script.textContent?.trim();
    if (!text) continue;

    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      continue;
    }

    const found = searchForJobFields(data);
    if (found.title || found.companyName) return found;
  }

  return EMPTY_EMBEDDED;
}

function searchForJobFields(root: unknown): EmbeddedJobFields {
  const result: EmbeddedJobFields = { ...EMPTY_EMBEDDED };
  let visited = 0;

  function visit(node: unknown, depth: number): void {
    if (visited >= MAX_JSON_NODES_VISITED || depth > MAX_JSON_DEPTH) return;
    if (!node || typeof node !== "object") return;
    if (result.title && result.companyName) return;
    visited++;

    if (Array.isArray(node)) {
      for (const item of node) {
        if (result.title && result.companyName) return;
        visit(item, depth + 1);
      }
      return;
    }

    const record = node as Record<string, unknown>;
    result.title ??= firstStringByKeys(record, TITLE_KEYS);
    result.companyName ??= firstStringByKeys(record, COMPANY_KEYS);
    result.description ??= firstStringByKeys(record, DESCRIPTION_KEYS, 40);
    result.location ??= firstStringByKeys(record, LOCATION_KEYS);

    for (const value of Object.values(record)) {
      if (result.title && result.companyName) return;
      visit(value, depth + 1);
    }
  }

  visit(root, 0);
  return result;
}

function firstStringByKeys(
  record: Record<string, unknown>,
  keys: string[],
  minLength = 1,
): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim().length >= minLength) return value.trim();
  }
  return null;
}
